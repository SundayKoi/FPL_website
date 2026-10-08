"use server";

// Server actions for the offseason pages. Each is a thin call through the
// caller's own session: the database decides who may do what (the RPCs
// check staff themselves; direct table writes pass RLS only for staff), so
// nothing here trusts the page that called it.

import { revalidatePath } from "next/cache";
import type { LolRole } from "@/lib/draft/types";
import { createServerSupabase } from "@/lib/supabase/server";
import type { EntrantStatus, EntryTier, MatchStage, OffseasonEventStatus, Tier, WeekStatus } from "./types";

export type OffseasonActionResult = { ok: true } | { ok: false; error: string };

/** "CODE: message" from an RPC reads as the message; RLS refusals as a sentence. */
function failure(error: { message?: string; code?: string } | null): OffseasonActionResult {
  const message = error?.message ?? "Something went wrong.";
  if (error?.code === "42501" || /row-level security|permission denied/i.test(message)) {
    return { ok: false, error: "Only offseason staff can do that." };
  }
  const coded = /^[A-Z_]+: (.+)$/.exec(message);
  return { ok: false, error: coded ? coded[1] : message };
}

async function done(result: { error: { message?: string; code?: string } | null }): Promise<OffseasonActionResult> {
  if (result.error) return failure(result.error);
  revalidatePath("/offseason", "layout");
  return { ok: true };
}

// === Players =================================================================

export async function signUpAction(input: {
  eventId: string;
  displayName: string;
  riotId: string;
  opggUrl: string;
  currentRank: string;
  primaryRole: LolRole;
  secondaryRole: LolRole | null;
}): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_sign_up", {
      p_event_id: input.eventId,
      p_display_name: input.displayName,
      p_riot_id: input.riotId,
      p_opgg_url: input.opggUrl,
      p_current_rank: input.currentRank,
      p_primary_role: input.primaryRole,
      p_secondary_role: input.secondaryRole,
    }),
  );
}

export async function withdrawAction(eventId: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_withdraw", { p_event_id: eventId }));
}

/**
 * The player confirms they are playing `role`. A player staff added by hand
 * passes that row's Riot ID to claim it in the same step.
 */
export async function lockInAction(input: { eventId: string; role: LolRole; riotId?: string }): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_lock_in", {
      p_event_id: input.eventId,
      p_role: input.role,
      p_riot_id: input.riotId?.trim() || null,
    }),
  );
}

// === Staff: event and entrants ===============================================

export async function createEventAction(name: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_events").insert({ name: name.trim() }));
}

export async function updateEventAction(
  eventId: string,
  patch: { name?: string; status?: OffseasonEventStatus; signups_open?: boolean; yardstick_season?: string },
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_events").update(patch).eq("id", eventId));
}

export async function addEntrantAction(
  eventId: string,
  input: {
    displayName: string;
    riotId: string;
    currentRank: string;
    opggUrl: string;
    primaryRole: LolRole;
    secondaryRole: LolRole | null;
  },
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.from("offseason_entrants").insert({
      event_id: eventId,
      display_name: input.displayName.trim(),
      riot_id: input.riotId.trim(),
      current_rank: input.currentRank.trim() || null,
      opgg_url: input.opggUrl.trim() || null,
      primary_role: input.primaryRole,
      secondary_role: input.secondaryRole,
    }),
  );
}

export async function updateEntrantAction(
  entrantId: string,
  patch: {
    display_name?: string;
    riot_id?: string;
    primary_role?: LolRole;
    secondary_role?: LolRole | null;
    status?: Extract<EntrantStatus, "active" | "benched" | "withdrawn">;
  },
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_entrants").update(patch).eq("id", entrantId));
}

/** Staff record a lock-in for `role` (a player who confirmed in Discord), or clear it with null. */
export async function setLockInAction(entrantId: string, role: LolRole | null): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase
      .from("offseason_entrants")
      .update({ locked_in_role: role, locked_in_at: role ? new Date().toISOString() : null })
      .eq("id", entrantId),
  );
}

export async function deleteEntrantAction(entrantId: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_entrants").delete().eq("id", entrantId));
}

export async function applyRolesAction(
  eventId: string,
  rows: { entrantId: string; role: LolRole | null; status: "active" | "benched" }[],
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_apply_roles", {
      p_event_id: eventId,
      p_assignments: rows.map((row) => ({ entrant_id: row.entrantId, role: row.role, status: row.status })),
    }),
  );
}

// === Staff: weeks ============================================================

export async function openWeekAction(eventId: string, weekNumber: number): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_weeks").insert({ event_id: eventId, week_number: weekNumber }));
}

export async function setWeekStatusAction(weekId: string, status: WeekStatus): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_weeks").update({ status }).eq("id", weekId));
}

export async function setWeekEntriesAction(
  weekId: string,
  entries: { entrant_id: string; tier: EntryTier; captain_seat: number | null }[],
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_set_week_entries", { p_week_id: weekId, p_entries: entries }));
}

export async function createWeekDraftAction(
  weekId: string,
  tier: Tier,
  settings: { budget: number; countdownSeconds: number; roundMinimums: number[] },
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_create_week_draft", {
      p_week_id: weekId,
      p_tier: tier,
      p_budget: settings.budget,
      p_countdown_seconds: settings.countdownSeconds,
      p_round_minimums: settings.roundMinimums,
    }),
  );
}

export async function importWeekDraftAction(weekId: string, tier: Tier): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_import_week_draft", { p_week_id: weekId, p_tier: tier }));
}

// === Staff: matches and results ==============================================

export async function createMatchesAction(
  weekId: string,
  stage: MatchStage,
  bestOf: 1 | 3 | 5,
  pairs: { teamA: string; teamB: string }[],
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  const { data: last, error } = await supabase
    .from("offseason_matches")
    .select("sort_order")
    .eq("week_id", weekId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return failure(error);
  const start = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;
  return done(
    await supabase.from("offseason_matches").insert(
      pairs.map((pair, index) => ({
        week_id: weekId,
        stage,
        best_of: bestOf,
        team_a_id: pair.teamA,
        team_b_id: pair.teamB,
        sort_order: start + index,
      })),
    ),
  );
}

export async function deleteMatchAction(matchId: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_matches").delete().eq("id", matchId));
}

export async function setGameAction(
  matchId: string,
  gameNumber: number,
  riotMatchId: string,
  winnerTeamId: string | null,
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_set_game", {
      p_match_id: matchId,
      p_game_number: gameNumber,
      p_riot_match_id: riotMatchId,
      p_winner_team_id: winnerTeamId,
    }),
  );
}

export async function setTeamEliminatedAction(teamId: string, eliminated: boolean): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_set_team_eliminated", { p_team_id: teamId, p_eliminated: eliminated }));
}
