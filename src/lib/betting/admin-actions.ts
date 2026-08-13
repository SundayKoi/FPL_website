"use server";

import { revalidatePath } from "next/cache";
import { requireBettingStaff } from "./access";
import { createBettingServiceClient } from "./service-client";

// Admin (staff-only) actions for the betting domain (Task 9). Every export
// here starts with `requireBettingStaff()` — throws for a non-staff caller,
// caught below and turned into `{ ok: false, error }` so this file matches
// actions.ts's house result shape rather than ever throwing across the
// server-action boundary. Only once that passes does any RPC or table call
// happen, which is what admin-actions.test.ts's authorization suite checks.
//
// Every money-moving write goes through a Task 3/4 admin RPC (service_role
// only — see 20260813000003_betting_market_rpcs.sql /
// 20260813000004_betting_pickem_store_seasons.sql's lockdown blocks).
// Team/event catalog CRUD has no ported admin RPC (upsert_team_admin /
// delete_team_admin / upsert_event_admin / delete_event_admin exist in the
// source's 004_admin_rpcs.sql / 006_delete_rpcs.sql but were never carried
// into this repo's migrations — confirmed by grep across
// supabase/migrations/). Controller ruling: since these don't move money,
// write them directly through the service client instead of writing a new
// migration (out of scope for this task), preserving the audit invariant by
// calling the already-ported `_audit` RPC ourselves right after.
//
// grantPoints calls `admin_grant` (supabase/migrations/
// 20260813000007_betting_admin_grant.sql — ported after the controller
// resolved task-9-report.md's NEEDS_CONTEXT note: the missing RPC was a plan
// gap, not a reason to improvise a direct balance write).

type ActionResult = { ok: true } | { ok: false; error: string };
type IdResult = { ok: true; id: number } | { ok: false; error: string };

function isFiniteInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

/** Runs `requireBettingStaff()` and returns its context, or `null` once an
 * error has already been pushed onto `fail` — every action below is
 * `const ctx = await staffOnly(); if (!ctx) return fail!;`. */
async function staffOnly(): Promise<{ discordId: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireBettingStaff();
    return ctx;
  } catch {
    return { ok: false, error: "Staff only." };
  }
}
function isStaffCtx(x: { discordId: string } | { ok: false; error: string }): x is { discordId: string } {
  return "discordId" in x;
}

const BETTING_ADMIN_PATHS = ["/admin/betting", "/admin/betting/pickems", "/admin/betting/catalog", "/admin/betting/seasons", "/admin/betting/props", "/betting"];
function revalidateBetting(): void {
  for (const path of BETTING_ADMIN_PATHS) revalidatePath(path);
}

// === Markets ==================================================================

export interface CreateMarketInput {
  eventId: number;
  teamAId: number;
  teamBId: number;
  title: string;
  /** Optional market rules/description text (create_market_admin's p_rules). */
  rules?: string;
  gameAt: string;
  /** Rake in basis points (0-10000), default 0. */
  rakeBps?: number;
  /** Opening-line implied win probability for team A, 0 < p < 1, display only. */
  openLineProbA?: number;
  drawEnabled: boolean;
}

/**
 * Creates a market via `create_market_admin`. Note: unlike an earlier draft
 * of this task's interface, the RPC has no `p_lock_at` parameter — it always
 * derives `lock_at = game_at - 5 minutes` server-side (see
 * 20260813000003_betting_market_rpcs.sql), so there is no separate lock time
 * to accept here.
 */
export async function createMarket(input: CreateMarketInput): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!isFiniteInt(input.eventId) || !isFiniteInt(input.teamAId) || !isFiniteInt(input.teamBId)) {
    return { ok: false, error: "Invalid event or team." };
  }
  if (input.teamAId === input.teamBId) {
    return { ok: false, error: "Team A and Team B must be different teams." };
  }
  if (!input.title || !input.title.trim()) {
    return { ok: false, error: "Enter a market title." };
  }
  const gameAtMs = new Date(input.gameAt).getTime();
  if (Number.isNaN(gameAtMs)) {
    return { ok: false, error: "Invalid game time." };
  }
  if (gameAtMs <= Date.now()) {
    return { ok: false, error: "game time must be in the future" };
  }
  const rakeBps = input.rakeBps ?? 0;
  if (!isFiniteInt(rakeBps) || rakeBps < 0 || rakeBps > 10000) {
    return { ok: false, error: "Rake must be between 0 and 10000 bps." };
  }
  if (input.openLineProbA !== undefined && !(input.openLineProbA > 0 && input.openLineProbA < 1)) {
    return { ok: false, error: "Opening line probability must be between 0 and 1." };
  }

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("create_market_admin", {
    p_actor: ctx.discordId,
    p_event: input.eventId,
    p_team_a: input.teamAId,
    p_team_b: input.teamBId,
    p_title: input.title.trim(),
    p_rules: input.rules?.trim() || null,
    p_game_at: input.gameAt,
    p_rake_bps: rakeBps,
    p_open_line_prob_a: input.openLineProbA ?? null,
    p_draw_enabled: input.drawEnabled,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true, id: data as number };
}

/**
 * Resolves a market via `resolve_market_admin`. Validated client-of-the-DB
 * side before the RPC call: the winner must be one of the market's two
 * teams, or -1 (the RPC-boundary "the Draw won" sentinel — only valid when
 * the market has draw_enabled).
 */
export async function resolveMarket(marketId: number, winnerTeamId: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!isFiniteInt(marketId) || !isFiniteInt(winnerTeamId)) {
    return { ok: false, error: "Invalid market or winner." };
  }

  const service = createBettingServiceClient();
  const { data: market } = await service
    .from("betting_markets")
    .select("team_a_id, team_b_id, draw_enabled")
    .eq("id", marketId)
    .single();
  const row = market as { team_a_id: number; team_b_id: number; draw_enabled: boolean } | null;
  if (!row) return { ok: false, error: "Market not found." };

  const validWinner =
    winnerTeamId === row.team_a_id ||
    winnerTeamId === row.team_b_id ||
    (winnerTeamId === -1 && row.draw_enabled);
  if (!validWinner) {
    return { ok: false, error: "Winner must be one of the market's two teams (or -1 for a draw)." };
  }

  const { error } = await service.rpc("resolve_market_admin", {
    p_actor: ctx.discordId,
    p_market: marketId,
    p_winner: winnerTeamId,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

/** Cancels a market (refunds every bet) via `cancel_market_admin`. */
export async function cancelMarket(marketId: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(marketId)) return { ok: false, error: "Invalid market." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("cancel_market_admin", { p_actor: ctx.discordId, p_market: marketId });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

/** Deletes a market that was created by mistake and never took a bet, via
 * `delete_market_admin` (refuses if any bets or pick'em legs reference it —
 * cancel it instead in that case). */
export async function deleteMarket(marketId: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(marketId)) return { ok: false, error: "Invalid market." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("delete_market_admin", { p_actor: ctx.discordId, p_id: marketId });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

// === Pick'ems ==================================================================

export interface CreatePickemInput {
  eventId: number;
  title: string;
  /** market_ids for each leg — the RPC requires at least 2, all currently
   * OPEN and not yet locked, none with draw_enabled. */
  marketIds: number[];
}

export async function createPickem(input: CreatePickemInput): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!isFiniteInt(input.eventId)) return { ok: false, error: "Invalid event." };
  if (!input.title || !input.title.trim()) return { ok: false, error: "Enter a pick'em title." };
  const marketIds = input.marketIds ?? [];
  if (marketIds.length < 2 || !marketIds.every(isFiniteInt)) {
    return { ok: false, error: "A pick'em needs at least 2 series." };
  }

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("create_pickem_admin", {
    p_actor: ctx.discordId,
    p_event: input.eventId,
    p_title: input.title.trim(),
    p_markets: marketIds,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true, id: data as number };
}

/** Resolves a pick'em (grades every card) via `resolve_pickem`. Unlike every
 * other admin RPC in this file, `resolve_pickem(p_pickem bigint)` takes no
 * `p_actor` and writes no audit row — ported verbatim from the source, which
 * has the same shape (its legs are already individually audited via
 * resolve_market_admin/cancel_market_admin). */
export async function resolvePickem(pickemId: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(pickemId)) return { ok: false, error: "Invalid pick'em." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("resolve_pickem", { p_pickem: pickemId });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

export async function cancelPickem(pickemId: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(pickemId)) return { ok: false, error: "Invalid pick'em." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("cancel_pickem_admin", { p_actor: ctx.discordId, p_pickem: pickemId });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

// === Catalog: teams / events (no ported admin RPC — direct writes) ===========
// See this file's header note: upsert_team_admin/delete_team_admin/
// upsert_event_admin/delete_event_admin exist in the source but were never
// ported into supabase/migrations for this repo. These don't move money, so
// the controller ruling authorizes writing directly to betting_teams/
// betting_events through the service client (never anon/authenticated —
// RLS's public policies on these tables are select-only), calling the
// already-ported `_audit` RPC ourselves so the audit trail stays complete.

export interface UpsertTeamInput {
  id?: number;
  name: string;
  shortCode: string;
  color?: string;
  logoUrl?: string;
}

export async function upsertTeam(input: UpsertTeamInput): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!input.name || !input.name.trim()) return { ok: false, error: "Enter a team name." };
  if (!input.shortCode || !input.shortCode.trim()) return { ok: false, error: "Enter a short code." };
  if (input.id !== undefined && !isFiniteInt(input.id)) return { ok: false, error: "Invalid team id." };

  const service = createBettingServiceClient();
  const row = {
    name: input.name.trim(),
    short_code: input.shortCode.trim().toUpperCase(),
    color: input.color?.trim() || "#888780",
    logo_url: input.logoUrl?.trim() || null,
  };

  const { data, error } =
    input.id === undefined
      ? await service.from("betting_teams").insert(row).select("id").single()
      : await service.from("betting_teams").update(row).eq("id", input.id).select("id").single();
  if (error) return { ok: false, error: error.message };
  const id = (data as { id: number } | null)?.id;
  if (id === undefined) return { ok: false, error: "Team not found." };

  await service.rpc("_audit", {
    p_actor: ctx.discordId,
    p_action: "team_upsert",
    p_target: `betting_teams:${id}`,
    p_before: null,
    p_after: { name: row.name, short_code: row.short_code },
  });

  revalidateBetting();
  return { ok: true, id };
}

/** Deletes a team — refuses if any market still references it (as team A,
 * team B, or the recorded winner), matching the source's delete_team_admin
 * guard exactly. */
export async function deleteTeam(id: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(id)) return { ok: false, error: "Invalid team." };

  const service = createBettingServiceClient();
  const { data: teamData, error: teamError } = await service.from("betting_teams").select("name").eq("id", id).single();
  if (teamError || !teamData) return { ok: false, error: "Unknown team." };

  const { count } = await service
    .from("betting_markets")
    .select("id", { count: "exact", head: true })
    .or(`team_a_id.eq.${id},team_b_id.eq.${id},winning_team_id.eq.${id}`);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Team is used by ${count} market(s) — delete those first.` };
  }

  const { error } = await service.from("betting_teams").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await service.rpc("_audit", {
    p_actor: ctx.discordId,
    p_action: "team_delete",
    p_target: `betting_teams:${id}`,
    p_before: { name: (teamData as { name: string }).name },
    p_after: null,
  });

  revalidateBetting();
  return { ok: true };
}

export interface UpsertEventInput {
  id?: number;
  name: string;
  description?: string;
}

export async function upsertEvent(input: UpsertEventInput): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!input.name || !input.name.trim()) return { ok: false, error: "Enter an event name." };
  if (input.id !== undefined && !isFiniteInt(input.id)) return { ok: false, error: "Invalid event id." };

  const service = createBettingServiceClient();
  const row = { name: input.name.trim(), description: input.description?.trim() || null };

  const { data, error } =
    input.id === undefined
      ? await service.from("betting_events").insert(row).select("id").single()
      : await service.from("betting_events").update(row).eq("id", input.id).select("id").single();
  if (error) return { ok: false, error: error.message };
  const id = (data as { id: number } | null)?.id;
  if (id === undefined) return { ok: false, error: "Event not found." };

  await service.rpc("_audit", {
    p_actor: ctx.discordId,
    p_action: "event_upsert",
    p_target: `betting_events:${id}`,
    p_before: null,
    p_after: { name: row.name },
  });

  revalidateBetting();
  return { ok: true, id };
}

/** Deletes an event — refuses if any market still references it, matching
 * the source's delete_event_admin guard. */
export async function deleteEvent(id: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(id)) return { ok: false, error: "Invalid event." };

  const service = createBettingServiceClient();
  const { data: eventData, error: eventError } = await service.from("betting_events").select("name").eq("id", id).single();
  if (eventError || !eventData) return { ok: false, error: "Unknown event." };

  const { count } = await service.from("betting_markets").select("id", { count: "exact", head: true }).eq("event_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Event has ${count} market(s) — delete those first.` };
  }

  const { error } = await service.from("betting_events").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  await service.rpc("_audit", {
    p_actor: ctx.discordId,
    p_action: "event_delete",
    p_target: `betting_events:${id}`,
    p_before: { name: (eventData as { name: string }).name },
    p_after: null,
  });

  revalidateBetting();
  return { ok: true };
}

// === Catalog: store items (upsert_store_item_admin / delete_store_item_admin,
// both ported in 20260813000004_betting_pickem_store_seasons.sql) ============

export interface UpsertStoreItemInput {
  id?: number;
  name: string;
  description?: string;
  cost: number;
  type: string;
  payload?: Record<string, unknown>;
  active: boolean;
}

export async function upsertStoreItem(input: UpsertStoreItemInput): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!input.name || !input.name.trim()) return { ok: false, error: "Enter an item name." };
  if (!input.type || !input.type.trim()) return { ok: false, error: "Enter an item type." };
  if (!isFiniteInt(input.cost) || input.cost <= 0) return { ok: false, error: "Cost must be a positive integer." };
  if (input.id !== undefined && !isFiniteInt(input.id)) return { ok: false, error: "Invalid item id." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("upsert_store_item_admin", {
    p_actor: ctx.discordId,
    p_id: input.id ?? null,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_cost: input.cost,
    p_type: input.type.trim(),
    p_payload: input.payload ?? null,
    p_active: input.active,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true, id: data as number };
}

export async function deleteStoreItem(id: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(id)) return { ok: false, error: "Invalid item." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("delete_store_item_admin", { p_actor: ctx.discordId, p_id: id });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

// === Seasons (create_season_admin / close_season_admin) ======================

export async function createSeason(name: string): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!name || !name.trim()) return { ok: false, error: "Enter a season name." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("create_season_admin", { p_actor: ctx.discordId, p_name: name.trim() });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true, id: data as number };
}

/** Closes the active season. `resetTo` of 0 keeps every wallet's balance;
 * >0 soft-resets every wallet to that balance through the ledger (see
 * close_season_admin). Refuses while any market/pick'em is still unsettled. */
export async function closeSeason(seasonId: number, resetTo: number): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;
  if (!isFiniteInt(seasonId)) return { ok: false, error: "Invalid season." };
  if (!isFiniteInt(resetTo) || resetTo < 0) return { ok: false, error: "Reset balance must be 0 or a positive integer." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("close_season_admin", {
    p_actor: ctx.discordId,
    p_season: seasonId,
    p_reset_to: resetTo,
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

// === Users: grant/deduct (admin_grant, 20260813000007_betting_admin_grant.sql) ==

/**
 * Grants (positive delta) or deducts (negative delta) a wallet's balance via
 * `admin_grant`, with `reason` carried through as the RPC's `p_note` (stored
 * in the audit row's `after.note`, alongside the ledger's fixed
 * `admin_grant` reason string). The RPC itself refuses a deduction that
 * would take the balance below zero ('grant would make balance negative')
 * and an unknown target ('unknown user %') — surfaced here as the RPC's own
 * error message, same as every other action in this file.
 */
export async function grantPoints(discordId: string, delta: number, reason: string): Promise<ActionResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!discordId || !discordId.trim()) return { ok: false, error: "Enter a Discord id." };
  if (!isFiniteInt(delta) || delta === 0) return { ok: false, error: "Enter a non-zero whole-number amount." };
  if (!reason || !reason.trim()) return { ok: false, error: "Enter a reason for the audit trail." };

  const service = createBettingServiceClient();
  const { error } = await service.rpc("admin_grant", {
    p_actor: ctx.discordId,
    p_target: discordId.trim(),
    p_amount: delta,
    p_note: reason.trim(),
  });
  if (error) return { ok: false, error: error.message };

  revalidateBetting();
  return { ok: true };
}

// === prop suggestions (supabase/migrations/20260814000001) ==================

/**
 * Approves a member's prop suggestion into a real market: the RPC creates two
 * synthetic outcome teams and calls create_market_admin, so announcements and
 * the whole money path are the standard ones.
 */
export async function approveProp(suggestionId: number, eventId: number, gameAt: string): Promise<IdResult> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!isFiniteInt(suggestionId) || !isFiniteInt(eventId)) {
    return { ok: false, error: "Invalid suggestion or event." };
  }
  const gameAtMs = new Date(gameAt).getTime();
  if (Number.isNaN(gameAtMs)) return { ok: false, error: "Invalid game time." };
  if (gameAtMs <= Date.now()) return { ok: false, error: "game time must be in the future" };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("approve_prop_admin", {
    p_actor: ctx.discordId,
    p_suggestion: suggestionId,
    p_event: eventId,
    p_game_at: new Date(gameAtMs).toISOString(),
  });
  if (error) {
    if (/not pending/i.test(error.message)) return { ok: false, error: "That suggestion was already reviewed." };
    return { ok: false, error: "Something went wrong approving that suggestion." };
  }

  revalidateBetting();
  return { ok: true, id: data as number };
}

/** Rejects a pending prop suggestion, optionally with a reason the member sees. */
export async function rejectProp(suggestionId: number, reason?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await staffOnly();
  if (!isStaffCtx(ctx)) return ctx;

  if (!isFiniteInt(suggestionId)) return { ok: false, error: "Invalid suggestion." };
  const trimmed = reason?.trim() || undefined;

  const service = createBettingServiceClient();
  const { error } = await service.rpc("reject_prop_admin", {
    p_actor: ctx.discordId,
    p_suggestion: suggestionId,
    p_reason: trimmed ?? null,
  });
  if (error) {
    if (/not pending/i.test(error.message)) return { ok: false, error: "That suggestion was already reviewed." };
    return { ok: false, error: "Something went wrong rejecting that suggestion." };
  }

  revalidateBetting();
  return { ok: true };
}
