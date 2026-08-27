// Reads over expedition_runs. Framework-free on purpose (takes any
// SupabaseClient, no next/headers), same as src/lib/packs/queries.ts —
// the page passes the service-role client, a signed-in user's own client
// works too (the table's RLS policy lets an owner read their own runs),
// and a future scripts/ job can reuse these under tsx.
//
// Every read fails soft to "no runs": these back a page, and an
// environment that hasn't applied 20260901000001_card_expeditions.sql yet
// should render an empty board rather than 500.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpeditionMark, ExpeditionOutcome, ExpeditionTierKey, OutcomeGrade } from "./config";

/**
 * The outcome as the ROW stores it, which is not quite what rollOutcome
 * returned: claim_expedition writes the payout facts plus the copy that
 * took the mark, and drops `briefHit` — that was reasoning about the
 * dollars, and the dollars are already banked. Anything that wants the
 * brief back recomputes it from `startedAt` (briefFor), which is exactly
 * how the claim itself derived it.
 */
export type ExpeditionRunOutcome = Omit<ExpeditionOutcome, "briefHit"> & {
  /** The copy that came home wearing the mark — null when none dropped. */
  bearer: number | null;
};

export interface ExpeditionRun {
  id: number;
  tier: ExpeditionTierKey;
  /** card_inventory ids, exactly three. */
  squad: number[];
  shine: number;
  startedAt: string;
  resolvesAt: string;
  outcome: ExpeditionRunOutcome | null;
  claimedAt: string | null;
}

const RUN_COLUMNS = "id, tier, squad, shine, started_at, resolves_at, outcome, claimed_at";

interface RunDbRow {
  id: number;
  tier: string;
  squad: number[] | null;
  shine: number;
  started_at: string;
  resolves_at: string;
  outcome: {
    grade: OutcomeGrade;
    dollars: number;
    comp: boolean;
    mark: ExpeditionMark | null;
    bearer: number | null;
  } | null;
  claimed_at: string | null;
}

function mapRun(row: RunDbRow): ExpeditionRun {
  return {
    id: row.id,
    tier: row.tier as ExpeditionTierKey,
    // A bigint[] column can't actually be null (the table says not null),
    // but a squad read as null would otherwise crash a board over one bad
    // row rather than showing the other runs.
    squad: (row.squad ?? []).map(Number),
    shine: row.shine,
    startedAt: row.started_at,
    resolvesAt: row.resolves_at,
    outcome: row.outcome
      ? {
          grade: row.outcome.grade,
          dollars: Number(row.outcome.dollars),
          comp: row.outcome.comp === true,
          mark: row.outcome.mark ?? null,
          bearer: row.outcome.bearer === null || row.outcome.bearer === undefined ? null : Number(row.outcome.bearer),
        }
      : null,
    claimedAt: row.claimed_at,
  };
}

/**
 * One collector's expeditions for one season, newest launch first —
 * unclaimed runs and the log of finished ones in the same list, because
 * the board draws them from one shape and the only difference is whether
 * `claimedAt` is set.
 */
export async function fetchRuns(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
): Promise<ExpeditionRun[]> {
  const { data, error } = await supabase
    .from("expedition_runs")
    .select(RUN_COLUMNS)
    .eq("discord_id", discordId)
    .eq("season", season)
    .order("started_at", { ascending: false });
  if (error) return [];
  return ((data as RunDbRow[]) ?? []).map(mapRun);
}

/**
 * Every copy of this collector's that is currently away — the deploy lock,
 * as the UI needs to read it: dimmed in the squad picker, un-meltable in
 * the shelf, un-offerable in a trade.
 *
 * Season-blind on purpose. The lock is a property of the CARD, not of the
 * season being browsed, and the trigger behind it (card_inventory_
 * expedition_guard) doesn't look at seasons either; a per-season read here
 * would show an academy copy as free while the database refused to move it.
 *
 * Presentation only. The trigger is the guarantee.
 */
export async function fetchDeployedCopyIds(supabase: SupabaseClient, discordId: string): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("expedition_runs")
    .select("squad")
    .eq("discord_id", discordId)
    .is("claimed_at", null);
  if (error) return new Set();
  const deployed = new Set<number>();
  for (const row of ((data as { squad: number[] | null }[]) ?? [])) {
    for (const id of row.squad ?? []) deployed.add(Number(id));
  }
  return deployed;
}
