// League-wide card economy numbers, for the public ledger page.
//
// Reads card_inventory and card_pack_opens, neither of which has a public
// read policy — so this takes the service client and returns only
// aggregates. No row ever reaches the page: the output is counts and sums
// plus two anonymous superlatives, which is the whole point of putting it
// somewhere public.
//
// Framework-free (any SupabaseClient), same as its siblings.

import type { SupabaseClient } from "@supabase/supabase-js";
import { FOIL_TYPES, foilTypeOf, type FoilType } from "@/lib/packs/config";
import { CHAMPION_TIER } from "@/lib/cards/champions";
import { TEAM_TIER } from "@/lib/cards/teamCards";

/**
 * Wallets left out of every number here.
 *
 * The devs opened a great many packs on a great deal of test money, and
 * their totals would drown the league's. Matched case-insensitively
 * against betting_profiles.username, and overridable with
 * CARD_STATS_EXCLUDED (comma-separated) so a rename doesn't need a deploy.
 *
 * Names, not ids: a Discord id is stable but nobody can eyeball it to
 * check this list is right.
 */
export const DEFAULT_EXCLUDED_COLLECTORS = ["dribb", "spiesss"];

/** Both sides of the comparison go through this, so "@Dribb" in the table
 *  still matches "dribb" in the list. A silent miss here doesn't error —
 *  it just quietly counts a dev's test packs as league activity, which is
 *  the one thing this whole list exists to prevent. */
export function normalizeCollectorName(name: string): string {
  return name.trim().toLowerCase().replace(/^@+/, "");
}

export function excludedCollectorNames(configured: string | undefined = process.env.CARD_STATS_EXCLUDED): string[] {
  const parsed = (configured ?? "").split(",").map(normalizeCollectorName).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_EXCLUDED_COLLECTORS;
}

export interface EconomyStats {
  packsOpened: number;
  spent: number;
  collectors: number;
  /**
   * Copies HELD, not copies ever pulled.
   *
   * dust_card deletes the inventory row (20260826000018_card_trading.sql),
   * so a melted copy leaves no trace here — and signed copies are the most
   * attractive thing to melt at SIGNED_DUST_BASE. Counting pulls instead
   * would need the pull recorded somewhere a delete can't reach; until it
   * is, the page has to say "in circulation" and mean it.
   */
  cardsPulled: number;
  foils: number;
  /** Foils broken down by parallel, common first. The ladder is only worth
   *  having if the league can see how thin the top of it is. */
  foilsByType: Record<FoilType, number>;
  signed: number;
  altArts: number;
  /** Minted, not pulled — moments aren't in packs. */
  momentsMinted: number;
  /** Roster plates in circulation. `byTeam` is ordered by copies so the
   *  page can show which rosters the league is actually holding, and
   *  `weeks` counts the distinct editions minted — a team pulled across
   *  four weeks is four different collectibles, not four of one. */
  teams: {
    total: number;
    foils: number;
    weeks: number;
    byTeam: { teamName: string; copies: number }[];
  };
  /** The expedition board, as activity rather than inventory: runs are an
   *  ACTION, so unlike every other figure here nothing deletes them and
   *  these are true totals rather than what survived the dust button. */
  expeditions: {
    runs: number;
    /** Distinct people who have sent a squad out. */
    runners: number;
    /** Squads still in the field — launched, not yet claimed. */
    inField: number;
    byTier: Record<string, number>;
    /** What the board has actually paid: dollars, comped packs, marks. */
    dollars: number;
    comps: number;
    marks: number;
    /** Runs that came home on the top grade. */
    jackpots: number;
  };
  /** The Faceless Drop's relics in circulation. `byRank` keys are the
   *  corner indices (K, A, Q, 7, JOKER) so the page can show how the Hand
   *  spread; foils/signed/altArts are the drop's own shine, a SUBSET of
   *  the global counters above, never in addition to them. */
  champions: { total: number; byRank: Record<string, number>; foils: number; signed: number; altArts: number };
  /** Highest overall anyone has pulled, and who is on the card. */
  bestPull: { playerName: string; overall: number; tier: string } | null;
  /** The player who has been pulled the most times. */
  mostPulled: { playerName: string; copies: number } | null;
  /** How many wallets were left out, so the number is honest about it. */
  excludedCount: number;
  /** The paging cap was hit and these figures are a floor, not a total. */
  truncated: boolean;
}

interface InventoryStatRow {
  discord_id: string;
  slug: string;
  player_name: string;
  overall: number;
  tier: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  artSkin: number | null;
  /** Which edition the copy minted from — the week a roster plate froze. */
  edition_week: string | null;
}

/** The discord ids behind `names`. An empty result is fine and normal —
 *  it just means nobody is excluded. */
async function excludedIds(supabase: SupabaseClient, names: string[]): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const { data, error } = await supabase.from("betting_profiles").select("discord_id, username");
  if (error) return new Set();
  const wanted = new Set(names);
  return new Set(
    ((data as { discord_id: string; username: string | null }[]) ?? [])
      .filter((row) => wanted.has(normalizeCollectorName(row.username ?? "")))
      .map((row) => row.discord_id),
  );
}

/**
 * Every row of `table` for `season`, in pages.
 *
 * PostgREST caps a response at max_rows (1000 in this project's
 * config.toml, and the same by default on the hosted project). A single
 * unpaged select therefore does not return "all the rows" — it returns the
 * first thousand, silently, with no error and no marker. Aggregating that
 * gives a wrong answer that looks like a right one.
 *
 * Ordered by id because pagination without a total order is not
 * pagination: ranges can overlap or skip rows between requests.
 *
 * `truncated` is surfaced rather than swallowed. A cap that nobody is told
 * about reads as the truth.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  season: string,
  pageSize = 1000,
  maxPages = 100,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("season", season)
      .order("id")
      .range(from, from + pageSize - 1);
    // An error on the first page means no data at all (a missing table, say);
    // on a later page it means we stop with what we have. Either way the
    // caller gets rows it can aggregate rather than an exception.
    if (error) return { rows, truncated: false };
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * One season's economy, with `excluded` wallets removed from every figure.
 *
 * Aggregated in JS rather than by the database: PostgREST has no SUM
 * without an RPC. Every read is paged — see fetchAllRows for why a plain
 * select is not enough.
 *
 * A missing table (card_moments before its migration lands) contributes
 * zero rather than throwing, so the page renders whatever it can.
 */
export async function fetchEconomyStats(
  supabase: SupabaseClient,
  season: string,
  excludeNames: string[] = excludedCollectorNames(),
  /** Page size must not exceed the API's max_rows, or every page comes back
   *  short and paging stops after the first. Exposed for tests. */
  paging: { pageSize?: number; maxPages?: number } = {},
): Promise<EconomyStats> {
  const { pageSize = 1000, maxPages = 100 } = paging;
  const excluded = await excludedIds(supabase, excludeNames);

  const [opensPage, inventoryPage, momentsResult, runsPage] = await Promise.all([
    fetchAllRows<{ discord_id: string; cost: number }>(
      supabase,
      "card_pack_opens",
      "id, discord_id, cost",
      season,
      pageSize,
      maxPages,
    ),
    // artSkin comes out of the frozen card json — the alternate-print roll
    // is only recorded there, never as a column.
    fetchAllRows<InventoryStatRow>(
      supabase,
      "card_inventory",
      "id, discord_id, slug, player_name, overall, tier, foil, foil_type, signed, edition_week, artSkin:card->artSkin",
      season,
      pageSize,
      maxPages,
    ),
    supabase.from("card_moments").select("id", { count: "exact", head: true }).eq("season", season),
    // Expedition runs are ACTIONS, not inventory — nothing deletes them,
    // so unlike the copy counts above these are true totals. A season with
    // the table not yet migrated reads as an empty board, same tolerance
    // the expedition page itself keeps.
    fetchAllRows<{
      discord_id: string;
      tier: string;
      claimed_at: string | null;
      outcome: { grade?: string; dollars?: number; comp?: boolean; mark?: string | null } | null;
    }>(supabase, "expedition_runs", "id, discord_id, tier, claimed_at, outcome", season, pageSize, maxPages),
  ]);

  const opens = opensPage.rows.filter((row) => !excluded.has(row.discord_id));
  const runs = runsPage.rows.filter((row) => !excluded.has(row.discord_id));
  const cards = inventoryPage.rows.filter((row) => !excluded.has(row.discord_id));

  const copiesByPlayer = new Map<string, number>();
  let best: EconomyStats["bestPull"] = null;
  let foils = 0;
  const foilsByType = Object.fromEntries(FOIL_TYPES.map((type) => [type, 0])) as Record<FoilType, number>;
  let signed = 0;
  let altArts = 0;
  const champions = { total: 0, byRank: {} as Record<string, number>, foils: 0, signed: 0, altArts: 0 };
  const teams = { total: 0, foils: 0, weeks: 0, byTeam: [] as { teamName: string; copies: number }[] };
  const teamCopies = new Map<string, number>();
  const teamWeeks = new Set<string>();
  for (const card of cards) {
    const isChampion = card.tier === CHAMPION_TIER;
    const isTeam = card.tier === TEAM_TIER;
    if (card.foil) {
      foils += 1;
      // foilTypeOf, not the raw column: a copy pulled before parallels
      // existed has no type and counts as what it is, a Prisma.
      foilsByType[foilTypeOf(card.foil_type)] += 1;
    }
    if (card.signed === true) signed += 1;
    if ((card.artSkin ?? 0) > 0) altArts += 1;
    if (isChampion) {
      champions.total += 1;
      // Rank off the slug (faceless-k …) — the flat columns carry no rank.
      const rank = (card.slug ?? "").replace(/^faceless-/, "").toUpperCase();
      champions.byRank[rank] = (champions.byRank[rank] ?? 0) + 1;
      if (card.foil) champions.foils += 1;
      if (card.signed === true) champions.signed += 1;
      if ((card.artSkin ?? 0) > 0) champions.altArts += 1;
      // Relics stay out of the player-centric superlatives: a drop-week
      // run on the Hand would crown "most pulled player: king of spades",
      // which isn't what that figure means. overall 0 keeps them out of
      // bestPull on its own.
      continue;
    }
    if (isTeam) {
      // player_name on a plate is the TEAM's name and edition_week is the
      // roster it froze, so neither needs the slug parsed back apart.
      teams.total += 1;
      if (card.foil) teams.foils += 1;
      teamCopies.set(card.player_name, (teamCopies.get(card.player_name) ?? 0) + 1);
      if (card.edition_week) teamWeeks.add(card.edition_week);
      // Same reasoning as the Hand: a roster is not a player, and letting
      // one into "most pulled" would answer a question nobody asked.
      continue;
    }
    copiesByPlayer.set(card.player_name, (copiesByPlayer.get(card.player_name) ?? 0) + 1);
    if (!best || card.overall > best.overall) {
      best = { playerName: card.player_name, overall: card.overall, tier: card.tier };
    }
  }

  // Name last as the tiebreak so a dead heat renders the same on every load.
  const mostPulled = [...copiesByPlayer.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];

  teams.weeks = teamWeeks.size;
  teams.byTeam = [...teamCopies.entries()]
    .map(([teamName, copies]) => ({ teamName, copies }))
    .sort((a, b) => b.copies - a.copies || a.teamName.localeCompare(b.teamName));

  // Claimed runs only for the payout figures: an unclaimed row has no
  // outcome yet, and counting its absent dollars as zero would read as "the
  // board paid nothing" rather than "the squad is still out there".
  const expeditions = {
    runs: runs.length,
    runners: new Set(runs.map((row) => row.discord_id)).size,
    inField: runs.filter((row) => !row.claimed_at).length,
    byTier: {} as Record<string, number>,
    dollars: 0,
    comps: 0,
    marks: 0,
    jackpots: 0,
  };
  for (const run of runs) {
    expeditions.byTier[run.tier] = (expeditions.byTier[run.tier] ?? 0) + 1;
    const outcome = run.outcome;
    if (!run.claimed_at || !outcome) continue;
    expeditions.dollars += Number(outcome.dollars ?? 0);
    if (outcome.comp === true) expeditions.comps += 1;
    if (outcome.mark) expeditions.marks += 1;
    if (outcome.grade === "jackpot") expeditions.jackpots += 1;
  }

  return {
    packsOpened: opens.length,
    spent: opens.reduce((total, row) => total + (row.cost ?? 0), 0),
    collectors: new Set(cards.map((card) => card.discord_id)).size,
    cardsPulled: cards.length,
    foils,
    foilsByType,
    signed,
    altArts,
    momentsMinted: momentsResult.error ? 0 : momentsResult.count ?? 0,
    champions,
    teams,
    expeditions,
    bestPull: best,
    mostPulled: mostPulled ? { playerName: mostPulled[0], copies: mostPulled[1] } : null,
    excludedCount: excluded.size,
    truncated: opensPage.truncated || inventoryPage.truncated || runsPage.truncated,
  };
}
