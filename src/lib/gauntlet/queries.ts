// Reads for the Gauntlet page — service client only (gauntlet_runs and
// card_inventory are both deny-all), ownership scoped by the session's
// discord id at the caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeasureKey } from "@/lib/cards/measures";
import type { InventoryRow } from "@/lib/packs/queries";
import type { CardLeague } from "@/lib/cards/queries";
import { mondayOf } from "@/lib/packs/week";
import type { GauntletRunRow } from "./run";
import { rankGauntletWeek } from "./settle";
import { patronActive } from "@/lib/patron/flames";
import { GAUNTLET_ROLES, type GauntletRole } from "./sim";
import { heirloomBlurb, heirloomOf } from "./heirlooms";

/** The bars the draft screen reads: the three comp identities
 *  (compProfileOf) plus every lane key — small enough to ship per option. */
export const DRAFT_STAT_KEYS: MeasureKey[] = ["combat", "damage", "laning", "presence", "survival", "vision"];

/** One pickable card in the draft — the slice the client needs, WITHOUT
 *  the frozen card json (a shelf of 200 copies must not ship 200 cards). */
export interface GauntletOption {
  inventoryId: number;
  name: string;
  overall: number;
  foil: boolean;
  signed: boolean;
  fresh: boolean;
  editionWeek: string;
  /** The real-life team — what the draft screen's chemistry reads. */
  team: string | null;
  /** Which shelf the copy came off. Both field, and the bracket scales to
   *  whatever you pick — but a draft screen mixing two leagues has to say
   *  which is which, or an academy 80 reads as a premier one. */
  league: CardLeague;
  /** The DRAFT_STAT_KEYS bars only — enough for the comp readout and the
   *  per-card chips; missing bars fall back the way statOf falls back. */
  stats: Partial<Record<MeasureKey, number>>;
}

/** One shelf relic that can come along on a run — the slice the draft
 *  screen needs, without the frozen card json. */
export interface HeirloomOption {
  inventoryId: number;
  kind: "moment" | "plate";
  title: string;
  /** Moments: the colorway family, and so the dial it hands over. */
  family?: string;
  /** Plates: whose roster, so the screen can say who it wants fielded. */
  teamName?: string | null;
  /** The line the picker prints under it. */
  blurb: string;
}

/**
 * The moments and roster plates on the shelf, as things a run can bring.
 *
 * Deliberately the SAME inventory read the lineup options come from —
 * buildGauntletOptions skips these copies (a relic has no role), and this
 * picks them back up rather than paying for a second query.
 */
export function buildHeirloomOptions(rows: InventoryRow[]): HeirloomOption[] {
  const options: HeirloomOption[] = [];
  for (const row of rows) {
    const heirloom = heirloomOf(row.id, row.card);
    if (!heirloom) continue;
    options.push({
      inventoryId: heirloom.inventoryId,
      kind: heirloom.kind,
      title: heirloom.title,
      family: heirloom.family,
      teamName: heirloom.teamName,
      // The draft screen has no lineup yet when this is built, so a
      // plate's line is the general one; the picker re-reads it against
      // the five once cards are chosen.
      blurb: heirloomBlurb(heirloom, heirloom.kind === "plate" ? 1 : 0) ?? "",
    });
  }
  return options.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

/** The Monday key of the running week — module-level so components call
 *  this instead of building dates in render. */
export function currentWeek(): string {
  return mondayOf(new Date());
}

/** The collection as draft options, by role, best copies first. Moments
 *  and champions relics don't field — they watch from the shelf. */
export function buildGauntletOptions(
  rows: InventoryRow[],
  week: string,
  /** season -> league, for the shelf tag. A season missing from the map
   *  reads as premier, which is what a single-league environment has. */
  leagueOf: ReadonlyMap<string, CardLeague> = new Map(),
): Record<GauntletRole, GauntletOption[]> {
  const byRole = Object.fromEntries(GAUNTLET_ROLES.map((role) => [role, [] as GauntletOption[]])) as Record<
    GauntletRole,
    GauntletOption[]
  >;
  for (const row of rows) {
    if (row.card.moment || row.card.champWin || row.card.team) continue;
    const role = row.role as GauntletRole;
    if (!byRole[role]) continue;
    byRole[role].push({
      inventoryId: row.id,
      name: row.playerName,
      overall: row.overall,
      foil: row.foil,
      signed: row.signed,
      fresh: row.editionWeek === week,
      editionWeek: row.editionWeek,
      team: row.card.teamName ?? null,
      league: leagueOf.get(row.season) ?? "premier",
      stats: Object.fromEntries(
        (row.card.subStats ?? [])
          .filter((bar) => (DRAFT_STAT_KEYS as string[]).includes(bar.key))
          .map((bar) => [bar.key, bar.value]),
      ),
    });
  }
  for (const role of GAUNTLET_ROLES) {
    byRole[role].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
  }
  return byRole;
}

export async function fetchActiveGauntletRun(
  supabase: SupabaseClient,
  discordId: string,
): Promise<GauntletRunRow | null> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("*")
    .eq("discord_id", discordId)
    .eq("status", "active")
    .maybeSingle();
  // Deploy-before-migration: no table just means no run yet.
  if (error) return null;
  return data as GauntletRunRow | null;
}

/**
 * The five a player fielded last time, as inventory ids.
 *
 * The draft screen needs it because a re-run must differ by at least one
 * card, and finding that out AFTER pressing start is a worse way to learn
 * a rule than being shown it while you draft.
 */
export async function fetchLastLineup(
  supabase: SupabaseClient,
  discordId: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("lineup")
    .eq("discord_id", discordId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return [];
  const lineup = (data as { lineup: { inventoryId: number | null }[] }[] | null)?.[0]?.lineup ?? [];
  return lineup.map((card) => card.inventoryId).filter((id): id is number => typeof id === "number");
}

export interface GauntletWeekStats {
  bestScore: number;
  attempts: number;
  /** The latest finished run, for the "last run" strip. */
  lastFinished: GauntletRunRow | null;
}

export async function fetchGauntletWeekStats(
  supabase: SupabaseClient,
  discordId: string,
  week: string,
): Promise<GauntletWeekStats> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("*")
    .eq("discord_id", discordId)
    .eq("week_start", week)
    .order("id", { ascending: false });
  if (error) return { bestScore: 0, attempts: 0, lastFinished: null };
  const runs = (data as GauntletRunRow[]) ?? [];
  const finished = runs.filter((run) => run.status !== "active");
  return {
    bestScore: runs.reduce((best, run) => Math.max(best, run.score), 0),
    attempts: runs.length,
    lastFinished: finished[0] ?? null,
  };
}

/** What a player has unlocked on the ladder this season. 0 until the
 *  first clear, and 0 when the table is not there yet. */
export async function fetchAscension(supabase: SupabaseClient, discordId: string, season: string): Promise<number> {
  const { data, error } = await supabase
    .from("gauntlet_ascension")
    .select("unlocked")
    .eq("discord_id", discordId)
    .eq("season", season)
    .maybeSingle();
  if (error || !data) return 0;
  return Number((data as { unlocked: number }).unlocked ?? 0);
}

export interface ContractProgress {
  /** Keys finished this week. */
  thisWeek: string[];
  /** Contracts finished this season, across every week — the count that
   *  unlocks openers. */
  seasonTotal: number;
}

/** What this player has done on the week's contracts, and the season's
 *  running count. Both zero when the table is not there yet. */
export async function fetchContractProgress(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
  week: string,
): Promise<ContractProgress> {
  const { data, error } = await supabase
    .from("gauntlet_contracts")
    .select("week_start, contract_key")
    .eq("discord_id", discordId)
    .eq("season", season);
  if (error) return { thisWeek: [], seasonTotal: 0 };
  const rows = ((data as { week_start: string; contract_key: string }[]) ?? []);
  return {
    thisWeek: rows.filter((row) => row.week_start === week).map((row) => row.contract_key),
    seasonTotal: rows.length,
  };
}

export interface GauntletBoardRow {
  discordId: string;
  username: string;
  score: number;
  /** The score as the board weighs it — see src/lib/gauntlet/ascension.ts. */
  weighted: number;
  ascension: number;
  drafted: boolean;
  round: number;
  cleared: boolean;
  /** Active patron's flame key, for the board's flame dot. */
  flame: string | null;
}

/** The week's board: best run per user, ranked — the same ranking the
 *  Monday settlement pays, so what the page shows is what the pot reads. */
export async function fetchGauntletBoard(
  supabase: SupabaseClient,
  season: string,
  week: string,
  limit = 10,
): Promise<GauntletBoardRow[]> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("discord_id, score, round, status, ascension, drafted")
    .eq("season", season)
    .eq("week_start", week);
  if (error) return [];
  const ranked = rankGauntletWeek(
    (data as { discord_id: string; score: number; round: number; status: string; ascension?: number | null; drafted?: boolean | null }[]) ?? [],
  ).slice(0, limit);
  if (ranked.length === 0) return [];
  const { data: profiles } = await supabase
    .from("betting_profiles")
    .select("discord_id, username, patron_until, patron_flame")
    .in("discord_id", ranked.map((row) => row.discordId));
  const byId = new Map(
    ((profiles as { discord_id: string; username: string | null; patron_until: string | null; patron_flame: string | null }[]) ?? []).map(
      (row) => [row.discord_id, row],
    ),
  );
  return ranked.map((row) => {
    const profile = byId.get(row.discordId);
    return {
      discordId: row.discordId,
      username: profile?.username ?? "Unknown",
      score: row.score,
      weighted: row.weighted,
      ascension: row.ascension,
      drafted: row.drafted,
      round: row.round,
      cleared: row.cleared,
      flame: profile && patronActive(profile.patron_until) ? profile.patron_flame ?? "ember" : null,
    };
  });
}
