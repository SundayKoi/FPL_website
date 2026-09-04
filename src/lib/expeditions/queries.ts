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
import type { CardFate, RecordedChoice, RouteEvent } from "./routes";

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
  /** What the forks made of the base payout. 1 on runs from before forks. */
  lootMultiplier: number;
  pushes: number;
  fragments: number;
  /** Every squad member's fate. Empty on runs from before forks. */
  fates: CardFate[];
  events: RouteEvent[];
  /** A Rescue's verdict. */
  rescued: boolean | null;
  /** The Exorcism's cleansed card. */
  cleansed: number | null;
};

/** A run's tier, or 'lost': the HOLD on a lost card, which the board draws
 *  under "Missing" rather than "In the field". */
export type RunTier = ExpeditionTierKey | "lost";

export interface ExpeditionRun {
  id: number;
  tier: RunTier;
  /** card_inventory ids — three on a run, one on a hold. */
  squad: number[];
  shine: number;
  startedAt: string;
  resolvesAt: string;
  outcome: ExpeditionRunOutcome | null;
  claimedAt: string | null;
  forks: number;
  choices: RecordedChoice[];
  insured: boolean;
  /** A Rescue's hold, an Exorcism's card, or a hold's losing run. */
  target: number | null;
  fee: number;
}

const RUN_COLUMNS = "id, tier, squad, shine, started_at, resolves_at, outcome, claimed_at, forks, choices, insured, target, fee";

interface RunDbRow {
  id: number;
  tier: string;
  squad: number[] | null;
  shine: number;
  started_at: string;
  resolves_at: string;
  outcome: {
    grade?: OutcomeGrade;
    dollars?: number;
    comp?: boolean;
    mark?: ExpeditionMark | null;
    bearer?: number | null;
    lootMultiplier?: number;
    pushes?: number;
    fragments?: number;
    fates?: CardFate[];
    events?: RouteEvent[];
    rescued?: boolean | null;
    cleansed?: number | null;
  } | null;
  claimed_at: string | null;
  forks: number | null;
  choices: RecordedChoice[] | null;
  insured: boolean | null;
  target: number | null;
  fee: number | null;
}

export function mapRun(row: RunDbRow): ExpeditionRun {
  return {
    id: row.id,
    tier: row.tier as RunTier,
    // A bigint[] column can't actually be null (the table says not null),
    // but a squad read as null would otherwise crash a board over one bad
    // row rather than showing the other runs.
    squad: (row.squad ?? []).map(Number),
    shine: row.shine,
    startedAt: row.started_at,
    resolvesAt: row.resolves_at,
    // A hold's outcome ({rescued}/{ransomed}/{expired}) has no grade; it
    // reads as "no outcome" here, and the board reads holds by their tier.
    outcome: row.outcome && row.outcome.grade
      ? {
          grade: row.outcome.grade,
          dollars: Number(row.outcome.dollars ?? 0),
          comp: row.outcome.comp === true,
          mark: row.outcome.mark ?? null,
          bearer: row.outcome.bearer === null || row.outcome.bearer === undefined ? null : Number(row.outcome.bearer),
          lootMultiplier: Number(row.outcome.lootMultiplier ?? 1),
          pushes: Number(row.outcome.pushes ?? 0),
          fragments: Number(row.outcome.fragments ?? 0),
          fates: Array.isArray(row.outcome.fates) ? row.outcome.fates : [],
          events: Array.isArray(row.outcome.events) ? row.outcome.events : [],
          rescued: row.outcome.rescued ?? null,
          cleansed: row.outcome.cleansed ?? null,
        }
      : null,
    claimedAt: row.claimed_at,
    forks: Number(row.forks ?? 0),
    choices: Array.isArray(row.choices) ? row.choices : [],
    insured: row.insured === true,
    target: row.target === null || row.target === undefined ? null : Number(row.target),
    fee: Number(row.fee ?? 0),
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

/** A card the route did not bring home: its hold, and how it was lost. */
export interface LostHold {
  holdId: number;
  cardId: number;
  /** When the week runs out and the card is gone. */
  expiresAt: string;
  /** The run that lost it. */
  lostOn: number | null;
  season: string;
}

/**
 * Every card of this collector's that is lost right now, in any season —
 * the Missing board, and the list a Rescue picks its target from.
 */
export async function fetchLostHolds(supabase: SupabaseClient, discordId: string): Promise<LostHold[]> {
  const { data, error } = await supabase
    .from("expedition_runs")
    .select("id, squad, resolves_at, target, season")
    .eq("discord_id", discordId)
    .eq("tier", "lost")
    .is("claimed_at", null)
    .order("resolves_at", { ascending: true });
  if (error) return [];
  return ((data as { id: number; squad: number[] | null; resolves_at: string; target: number | null; season: string }[]) ?? [])
    .filter((row) => (row.squad ?? []).length > 0)
    .map((row) => ({
      holdId: Number(row.id),
      cardId: Number(row.squad![0]),
      expiresAt: row.resolves_at,
      lostOn: row.target === null ? null : Number(row.target),
      season: row.season,
    }));
}

/** Map fragments held. Zero until the first is found. */
export async function fetchFragments(supabase: SupabaseClient, discordId: string): Promise<number> {
  const { data, error } = await supabase
    .from("expedition_supplies")
    .select("fragments")
    .eq("discord_id", discordId)
    .maybeSingle();
  if (error || !data) return 0;
  return Number((data as { fragments: number }).fragments ?? 0);
}

/** Whether this week's free policy is spent. */
export async function fetchPolicyUsed(supabase: SupabaseClient, discordId: string, weekStart: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("expedition_policies")
    .select("run_id")
    .eq("discord_id", discordId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) return true;
  return data !== null;
}

export interface Grave {
  id: number;
  inventoryId: number;
  slug: string;
  playerName: string;
  tier: string;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  card: import("@/lib/cards/build").PlayerCardData;
  runId: number | null;
  cause: "route" | "unrescued";
  diedAt: string;
}

/** The cards this collector has lost for good, newest first. */
export async function fetchGraveyard(supabase: SupabaseClient, discordId: string, season: string): Promise<Grave[]> {
  const { data, error } = await supabase
    .from("expedition_graveyard")
    .select("id, inventory_id, slug, player_name, tier, foil, foil_type, signed, card, run_id, cause, died_at")
    .eq("discord_id", discordId)
    .eq("season", season)
    .order("died_at", { ascending: false })
    .limit(60);
  if (error) return [];
  return ((data as Record<string, unknown>[]) ?? []).map((row) => ({
    id: Number(row.id),
    inventoryId: Number(row.inventory_id),
    slug: String(row.slug),
    playerName: String(row.player_name),
    tier: String(row.tier),
    foil: row.foil === true,
    foilType: (row.foil_type as string | null) ?? null,
    signed: row.signed === true,
    card: row.card as Grave["card"],
    runId: row.run_id === null || row.run_id === undefined ? null : Number(row.run_id),
    cause: row.cause as Grave["cause"],
    diedAt: String(row.died_at),
  }));
}
