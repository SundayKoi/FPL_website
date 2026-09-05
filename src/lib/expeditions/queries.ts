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
  /** The teams whose match day surged the payout. Empty on runs from
   *  before surges, and on any run whose squad was not playing. */
  surge: string[];
  /** A moment's echo: which edition card the route dropped a copy of, and
   *  which moment copy it echoed from. */
  echo: { slug: string; week: string; moment: number } | null;
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
  /** Encounters the sweep has applied (a storm's delay), by leg. */
  encounters: { key: string; leg: number }[];
  /** The rulebook the run launched under — see TRAIL_RULES. A squad in
   *  the field resolves under the rules it left with, never the newest. */
  rules: number;
}

/** The rulebook version from which a run has the trail: encounters,
 *  storms, the stranded bounty, the match-day surge, the echo and the
 *  rival fork. Runs stamped below it walk their forks exactly as before. */
export const TRAIL_RULES = 2;

/** Whether this run launched under the trail rules. */
export function hasTrail(run: Pick<ExpeditionRun, "rules">): boolean {
  return run.rules >= TRAIL_RULES;
}

const RUN_COLUMNS = "id, tier, squad, shine, started_at, resolves_at, outcome, claimed_at, forks, choices, insured, target, fee, encounters, rules";

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
    surge?: string[] | null;
    echo?: { slug?: string; week?: string; moment?: number } | null;
  } | null;
  claimed_at: string | null;
  forks: number | null;
  choices: RecordedChoice[] | null;
  insured: boolean | null;
  target: number | null;
  fee: number | null;
  encounters?: { key: string; leg: number }[] | null;
  rules?: number | null;
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
          surge: Array.isArray(row.outcome.surge) ? row.outcome.surge.map(String) : [],
          echo:
            row.outcome.echo && typeof row.outcome.echo.slug === "string" && typeof row.outcome.echo.week === "string"
              ? { slug: row.outcome.echo.slug, week: row.outcome.echo.week, moment: Number(row.outcome.echo.moment ?? 0) }
              : null,
        }
      : null,
    claimedAt: row.claimed_at,
    forks: Number(row.forks ?? 0),
    choices: Array.isArray(row.choices) ? row.choices : [],
    insured: row.insured === true,
    target: row.target === null || row.target === undefined ? null : Number(row.target),
    fee: Number(row.fee ?? 0),
    encounters: Array.isArray(row.encounters) ? row.encounters : [],
    // A row from before the column reads as the oldest rulebook: nothing
    // new ever applies to a run that predates the column that says it may.
    rules: Number(row.rules ?? 1),
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

/** Every open hold in the league that is NOT this collector's — what a
 *  squad can stumble on. Oldest first: the card closest to being gone is
 *  the one most worth carrying home. */
export async function fetchStrangersHolds(supabase: SupabaseClient, discordId: string): Promise<LostHold[]> {
  const { data, error } = await supabase
    .from("expedition_runs")
    .select("id, squad, resolves_at, target, season, discord_id")
    .eq("tier", "lost")
    .is("claimed_at", null)
    .neq("discord_id", discordId)
    .order("resolves_at", { ascending: true })
    .limit(20);
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

/** The league's fixtures with a time on or after `since`, soonest first —
 *  enough calendar for the match-day surge (the launch day's games) and the
 *  rival fork (a team's next opponent). Season-blind: the fixture table
 *  keeps both leagues, and a team name matches or it does not. */
export async function fetchFixturesSince(
  supabase: SupabaseClient,
  since: string,
  limit = 80,
): Promise<{ team_a: string | null; team_b: string | null; scheduled_at: string | null }[]> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("team_a, team_b, scheduled_at")
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return ((data as { team_a: string | null; team_b: string | null; scheduled_at: string | null }[]) ?? []);
}

/** One line of the league's ledger: a card that fell, went missing, or was
 *  brought back — whose, which route, and when. */
export interface LedgerEntry {
  /** Stable across the page: "grave-<id>" or "hold-<id>". */
  key: string;
  kind: "died" | "buried" | "missing" | "rescued" | "ransomed" | "carried";
  at: string;
  owner: { discordId: string; username: string; avatarUrl: string | null };
  /** Who carried a stranger's card home — set on `carried` only. */
  by: { discordId: string; username: string } | null;
  playerName: string;
  tier: string;
  foil: boolean;
  signed: boolean;
  /** The route that lost the card, when the run is still known. */
  route: ExpeditionTierKey | null;
  season: string;
}

const LEDGER_KIND_RANK: Record<LedgerEntry["kind"], number> = { died: 0, buried: 1, missing: 2, rescued: 3, carried: 4, ransomed: 5 };

/**
 * The ledger of the fallen and the found, league-wide and newest first:
 * every grave, every hold that is still open, and every hold that closed
 * with the card coming home (a Rescue, a ransom, a stranger's squad). A
 * hold that ran out is not listed twice — its grave already is.
 *
 * Service-client only: the graveyard and the holds are owner-scoped under
 * RLS, and this page reads everybody's on purpose.
 */
export async function fetchLedger(supabase: SupabaseClient, limit = 120): Promise<LedgerEntry[]> {
  const [gravesResult, holdsResult] = await Promise.all([
    supabase
      .from("expedition_graveyard")
      .select("id, discord_id, season, player_name, tier, foil, signed, run_id, cause, died_at")
      .order("died_at", { ascending: false })
      .limit(limit),
    supabase
      .from("expedition_runs")
      .select("id, discord_id, season, squad, resolves_at, claimed_at, outcome, target")
      .eq("tier", "lost")
      .order("id", { ascending: false })
      .limit(limit),
  ]);
  type GraveRow = { id: number; discord_id: string; season: string; player_name: string; tier: string; foil: boolean; signed: boolean; run_id: number | null; cause: string; died_at: string };
  type HoldRow = { id: number; discord_id: string; season: string; squad: number[] | null; resolves_at: string; claimed_at: string | null; outcome: { rescued?: boolean; ransomed?: boolean; expired?: boolean; stranger?: string } | null; target: number | null };
  const graves = gravesResult.error ? [] : (((gravesResult.data as GraveRow[]) ?? []));
  const holds = holdsResult.error ? [] : (((holdsResult.data as HoldRow[]) ?? [])).filter(
    (hold) => (hold.squad ?? []).length > 0 && !(hold.claimed_at && hold.outcome?.expired),
  );
  if (graves.length === 0 && holds.length === 0) return [];

  const runIds = [...new Set([...graves.map((g) => g.run_id), ...holds.map((h) => h.target)].filter((id): id is number => typeof id === "number"))];
  const cardIds = [...new Set(holds.map((h) => Number(h.squad![0])))];
  const people = [...new Set([...graves.map((g) => g.discord_id), ...holds.map((h) => h.discord_id), ...holds.map((h) => h.outcome?.stranger).filter((id): id is string => typeof id === "string")])];

  const [runsResult, cardsResult, profilesResult] = await Promise.all([
    runIds.length > 0 ? supabase.from("expedition_runs").select("id, tier").in("id", runIds) : Promise.resolve({ data: [], error: null }),
    cardIds.length > 0 ? supabase.from("card_inventory").select("id, player_name, tier, foil, signed").in("id", cardIds) : Promise.resolve({ data: [], error: null }),
    people.length > 0 ? supabase.from("betting_profiles").select("discord_id, username, avatar_url").in("discord_id", people) : Promise.resolve({ data: [], error: null }),
  ]);
  const routeOf = new Map<number, ExpeditionTierKey>();
  for (const row of ((runsResult.data as { id: number; tier: string }[] | null) ?? [])) {
    if (row.tier !== "lost") routeOf.set(Number(row.id), row.tier as ExpeditionTierKey);
  }
  const cardOf = new Map<number, { player_name: string; tier: string; foil: boolean; signed: boolean }>();
  for (const row of ((cardsResult.data as { id: number; player_name: string; tier: string; foil: boolean; signed: boolean }[] | null) ?? [])) {
    cardOf.set(Number(row.id), row);
  }
  const personOf = new Map<string, { username: string; avatar_url: string | null }>();
  for (const row of ((profilesResult.data as { discord_id: string; username: string | null; avatar_url: string | null }[] | null) ?? [])) {
    personOf.set(row.discord_id, { username: row.username ?? "Unknown", avatar_url: row.avatar_url ?? null });
  }
  const owner = (discordId: string) => ({
    discordId,
    username: personOf.get(discordId)?.username ?? "Unknown",
    avatarUrl: personOf.get(discordId)?.avatar_url ?? null,
  });

  const entries: LedgerEntry[] = [];
  for (const grave of graves) {
    entries.push({
      key: `grave-${grave.id}`,
      kind: grave.cause === "route" ? "died" : "buried",
      at: grave.died_at,
      owner: owner(grave.discord_id),
      by: null,
      playerName: grave.player_name,
      tier: grave.tier,
      foil: grave.foil === true,
      signed: grave.signed === true,
      route: grave.run_id === null ? null : routeOf.get(Number(grave.run_id)) ?? null,
      season: grave.season,
    });
  }
  for (const hold of holds) {
    const card = cardOf.get(Number(hold.squad![0]));
    // A hold whose card is gone from the shelf and not expired is a card
    // in transit — dusted or traded can't happen under the lock, so this
    // is a read race, and the line waits for the next render.
    if (!card) continue;
    const kind: LedgerEntry["kind"] = hold.claimed_at === null
      ? "missing"
      : hold.outcome?.ransomed
        ? "ransomed"
        : hold.outcome?.stranger
          ? "carried"
          : "rescued";
    const stranger = hold.outcome?.stranger;
    entries.push({
      key: `hold-${hold.id}`,
      kind,
      // An open hold is dated by when the card runs out, which is the
      // number a rescuer needs; a closed one by when it closed.
      at: hold.claimed_at ?? hold.resolves_at,
      owner: owner(hold.discord_id),
      by: kind === "carried" && stranger ? { discordId: stranger, username: personOf.get(stranger)?.username ?? "Unknown" } : null,
      playerName: card.player_name,
      tier: card.tier,
      foil: card.foil === true,
      signed: card.signed === true,
      route: hold.target === null ? null : routeOf.get(Number(hold.target)) ?? null,
      season: hold.season,
    });
  }
  return entries
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || LEDGER_KIND_RANK[a.kind] - LEDGER_KIND_RANK[b.kind])
    .slice(0, limit);
}
