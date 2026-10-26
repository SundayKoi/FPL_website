"use server";

// Server actions for the offseason pages. Each is a thin call through the
// caller's own session: the database decides who may do what (the RPCs
// check staff themselves; direct table writes pass RLS only for staff), so
// nothing here trusts the page that called it.

import { revalidatePath } from "next/cache";
import { validSignatureDataUrl } from "@/lib/cards/signing";
import type { LolRole } from "@/lib/draft/types";
import { createServerSupabase } from "@/lib/supabase/server";
import { INGEST_WORKFLOW_URL, IngestError, latestIngestRun, startIngest, type IngestRun } from "./ingestRun";
import { buildCardSet, type OffseasonCopy } from "./packs";
import { loadOffseason } from "./queries";
import { assignSides, tierSchedule } from "./schedule";
import type { EntrantStatus, EntryTier, MatchStage, OffseasonEventStatus, Tier, WeekStatus } from "./types";

export type OffseasonActionResult = { ok: true } | { ok: false; error: string };

/** "CODE: message" from an RPC reads as the message; RLS refusals as a sentence. */
function failure(error: { message?: string; code?: string } | null): { ok: false; error: string } {
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

/**
 * Signs the player's own offseason card. A player staff added by hand passes
 * their Riot ID to claim the spot in the same step.
 */
export async function signCardAction(input: { eventId: string; signature: string; riotId?: string }): Promise<OffseasonActionResult> {
  if (!validSignatureDataUrl(input.signature)) return { ok: false, error: "Draw your signature again." };
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_sign_card", {
      p_event_id: input.eventId,
      p_signature: input.signature,
      p_riot_id: input.riotId?.trim() || null,
    }),
  );
}

/** Casts or changes the member's MVP vote for a week. */
export async function voteMvpAction(weekId: string, entrantId: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_vote_mvp", { p_week_id: weekId, p_entrant_id: entrantId }));
}

export type OpenPackResult =
  | { ok: true; remaining: number; weekNumber: number; copies: OffseasonCopy[] }
  | { ok: false; error: string };

/**
 * Opens one offseason pack for the signed-in member. `requestId` comes from
 * the page and stays the same across retries of one click, so a pack whose
 * answer was lost on the way back is returned, not bought twice.
 */
export async function openOffseasonPackAction(requestId: string): Promise<OpenPackResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("offseason_open_pack", { p_request_id: requestId });
  if (error) return failure(error);
  const result = data as {
    week_number: number;
    remaining: number;
    cards: { id: number; foil: boolean; shiny: boolean; signed: boolean; card: OffseasonCopy["card"] }[];
  };
  revalidatePath("/offseason/packs");
  return {
    ok: true,
    remaining: result.remaining,
    weekNumber: result.week_number,
    copies: result.cards.map((copy) => ({ ...copy, weekNumber: result.week_number })),
  };
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
    overall_adjustment?: number;
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
  const updated = await supabase.from("offseason_weeks").update({ status }).eq("id", weekId).select("event_id, week_number").single();
  if (updated.error) return failure(updated.error);
  // Completing a week publishes its card set: a fresh set each week.
  if (status === "complete") {
    const week = updated.data as { event_id: string; week_number: number };
    const published = await publishCardSet(supabase, week.event_id, week.week_number);
    if (published) {
      revalidatePath("/offseason", "layout");
      return { ok: false, error: `Week complete, but its cards weren't published: ${failure(published).error.replace(/\.$/, "")}. Use Publish cards to try again.` };
    }
  }
  revalidatePath("/offseason", "layout");
  return { ok: true };
}

/** Builds the week's set from the event's games so far and publishes it; the database error, if any. */
async function publishCardSet(supabase: ServerSupabase, eventId: string, weekNumber: number): Promise<DbError> {
  const view = await loadOffseason(supabase);
  if (!view || view.event.id !== eventId) return { message: "EVENT_NOT_FOUND: that isn't the current event." };
  const { error } = await supabase.rpc("offseason_publish_card_set", {
    p_event_id: eventId,
    p_week_number: weekNumber,
    p_cards: buildCardSet(view),
  });
  return error;
}

/** Publishes (or republishes) a week's card set, replacing what that week had. */
export async function publishCardSetAction(eventId: string, weekNumber: number): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  const error = await publishCardSet(supabase, eventId, weekNumber);
  if (error) return failure(error);
  revalidatePath("/offseason", "layout");
  return { ok: true };
}

/** When the week drafts and plays (ISO instants, or null to clear); its auctions move with the draft time. */
export async function setWeekTimesAction(weekId: string, draftAt: string | null, gamesAt: string | null): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_set_week_times", { p_week_id: weekId, p_draft_at: draftAt, p_games_at: gamesAt }));
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
  settings: { budget: number; countdownSeconds: number; captainCosts: Record<string, number> },
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(
    await supabase.rpc("offseason_create_week_draft", {
      p_week_id: weekId,
      p_tier: tier,
      p_budget: settings.budget,
      p_countdown_seconds: settings.countdownSeconds,
      // No round minimums in the offseason: every nomination may open at 1.
      p_round_minimums: [1],
      // Each captain's own cost by entrant id, taken off their team's budget
      // (never 0).
      p_captain_costs: settings.captainCosts,
    }),
  );
}

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>;
type DbError = { message?: string; code?: string } | null;

/** Adds matches after the week's last one, each on random sides. */
async function insertMatches(
  supabase: ServerSupabase,
  weekId: string,
  stage: MatchStage,
  bestOf: 1 | 3 | 5,
  pairs: { teamA: string; teamB: string }[],
): Promise<DbError> {
  const { data: last, error } = await supabase
    .from("offseason_matches")
    .select("sort_order")
    .eq("week_id", weekId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return error;
  const start = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 1;
  const { error: insertError } = await supabase.from("offseason_matches").insert(
    assignSides(pairs).map((pair, index) => ({
      week_id: weekId,
      stage,
      best_of: bestOf,
      team_a_id: pair.teamA,
      team_b_id: pair.teamB,
      sort_order: start + index,
    })),
  );
  return insertError;
}

/** Schedules a freshly imported tier, unless its matches already exist. */
async function scheduleTier(supabase: ServerSupabase, weekId: string, tier: Tier): Promise<DbError> {
  const [weekResult, teamsResult, matchesResult] = await Promise.all([
    supabase.from("offseason_weeks").select("week_number, elimination_draft_id").eq("id", weekId).single(),
    supabase.from("offseason_teams").select("id, tier").eq("week_id", weekId).order("name"),
    supabase.from("offseason_matches").select("stage").eq("week_id", weekId),
  ]);
  const failed = weekResult.error ?? teamsResult.error ?? matchesResult.error;
  if (failed) return failed;
  const week = weekResult.data as { week_number: number; elimination_draft_id: string | null };
  const teams = (teamsResult.data ?? []) as { id: string; tier: Tier }[];
  const plan = tierSchedule({
    tier,
    teamIds: teams.filter((team) => team.tier === tier).map((team) => team.id),
    weekNumber: week.week_number,
    hasEliminationTier: Boolean(week.elimination_draft_id),
  });
  const existing = (matchesResult.data ?? []) as { stage: MatchStage }[];
  if (!plan || existing.some((match) => match.stage === plan.stage)) return null;
  return insertMatches(supabase, weekId, plan.stage, plan.bestOf, plan.pairings);
}

/** Imports a finished auction, then schedules that tier's matches straight away. */
export async function importWeekDraftAction(weekId: string, tier: Tier): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("offseason_import_week_draft", { p_week_id: weekId, p_tier: tier });
  if (error) return failure(error);
  const scheduleError = await scheduleTier(supabase, weekId, tier);
  revalidatePath("/offseason", "layout");
  if (scheduleError) {
    return { ok: false, error: `Teams imported, but the schedule could not be made (${failure(scheduleError).error}). Use Generate.` };
  }
  return { ok: true };
}

// === Staff: matches and results ==============================================

export async function createMatchesAction(
  weekId: string,
  stage: MatchStage,
  bestOf: 1 | 3 | 5,
  pairs: { teamA: string; teamB: string }[],
): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done({ error: await insertMatches(supabase, weekId, stage, bestOf, pairs) });
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

// === Staff: MVP nominees =====================================================

/** Replaces a week's MVP nominees: two to five of its players, in display order, or none. */
export async function setMvpNomineesAction(weekId: string, entrantIds: string[]): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_set_mvp_nominees", { p_week_id: weekId, p_entrant_ids: entrantIds }));
}

/** Ends a week's MVP vote at `closesAt` (an ISO instant), or with null when the next week is complete. */
export async function setMvpClosesAtAction(weekId: string, closesAt: string | null): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.from("offseason_weeks").update({ mvp_closes_at: closesAt }).eq("id", weekId));
}

// === Staff: tournament codes =================================================

export type AddMatchCodesResult =
  | { ok: true; added: number; skipped: number; assigned: number; pooled: number }
  | { ok: false; error: string };

/** Adds codes to the event's pool. Any game still without a code takes one straight away. */
export async function addMatchCodesAction(eventId: string, codes: string[]): Promise<AddMatchCodesResult> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("offseason_add_match_codes", { p_event_id: eventId, p_codes: codes });
  if (error) return failure(error);
  revalidatePath("/offseason", "layout");
  const counts = data as { added: number; skipped: number; assigned: number; pooled: number };
  return { ok: true, added: counts.added, skipped: counts.skipped, assigned: counts.assigned, pooled: counts.pooled };
}

/** Throws a code away; a game it was on takes the next code waiting. */
export async function removeMatchCodeAction(codeId: string): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_remove_match_code", { p_code_id: codeId }));
}

export async function setTeamEliminatedAction(teamId: string, eliminated: boolean): Promise<OffseasonActionResult> {
  const supabase = await createServerSupabase();
  return done(await supabase.rpc("offseason_set_team_eliminated", { p_team_id: teamId, p_eliminated: eliminated }));
}

// === Staff: stats ingest =====================================================
// These two call GitHub with a server-held token, not the database, so they
// check here that the caller is staff (offseason_is_staff) before anything else.

const STAFF_ONLY = { ok: false, error: "Only offseason staff can do that." } as const;
const NOT_SET_UP = "The Ingest now button isn't set up yet: the site needs GITHUB_ACTIONS_TOKEN.";

async function callerIsStaff(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("offseason_is_staff");
  return !error && data === true;
}

function ingestFailure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof IngestError ? error.message : "Couldn't reach GitHub. Try again in a minute." };
}

export type IngestStatusResult =
  | { ok: true; configured: boolean; run: IngestRun | null; workflowUrl: string }
  | { ok: false; error: string };

/** How the latest ingest run went, or that the button has no token to start one. */
export async function ingestStatusAction(): Promise<IngestStatusResult> {
  if (!(await callerIsStaff())) return STAFF_ONLY;
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return { ok: true, configured: false, run: null, workflowUrl: INGEST_WORKFLOW_URL };
  try {
    return { ok: true, configured: true, run: await latestIngestRun(token), workflowUrl: INGEST_WORKFLOW_URL };
  } catch (error) {
    return ingestFailure(error);
  }
}

/** Starts the ingest for every pending game, unless a run is already going. */
export async function runIngestAction(): Promise<OffseasonActionResult> {
  if (!(await callerIsStaff())) return STAFF_ONLY;
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return { ok: false, error: NOT_SET_UP };
  try {
    const latest = await latestIngestRun(token);
    if (latest && latest.status !== "completed") return { ok: false, error: "An ingest is already running." };
    await startIngest(token);
    return { ok: true };
  } catch (error) {
    return ingestFailure(error);
  }
}
