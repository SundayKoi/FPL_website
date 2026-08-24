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
  cardsPulled: number;
  foils: number;
  signed: number;
  altArts: number;
  /** Minted, not pulled — moments aren't in packs. */
  momentsMinted: number;
  /** Highest overall anyone has pulled, and who is on the card. */
  bestPull: { playerName: string; overall: number; tier: string } | null;
  /** The player who has been pulled the most times. */
  mostPulled: { playerName: string; copies: number } | null;
  /** How many wallets were left out, so the number is honest about it. */
  excludedCount: number;
}

interface InventoryStatRow {
  discord_id: string;
  player_name: string;
  overall: number;
  tier: string;
  foil: boolean;
  signed: boolean | null;
  artSkin: number | null;
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
 * One season's economy, with `excluded` wallets removed from every figure.
 *
 * Aggregated in JS rather than by the database: PostgREST has no SUM
 * without an RPC, and the row counts here are packs-times-five for one
 * season — small enough that a migration to add an aggregate view would be
 * work spent ahead of a problem.
 *
 * A missing table (card_moments before its migration lands) contributes
 * zero rather than throwing, so the page renders whatever it can.
 */
export async function fetchEconomyStats(
  supabase: SupabaseClient,
  season: string,
  excludeNames: string[] = excludedCollectorNames(),
): Promise<EconomyStats> {
  const excluded = await excludedIds(supabase, excludeNames);

  const [opensResult, inventoryResult, momentsResult] = await Promise.all([
    supabase.from("card_pack_opens").select("discord_id, cost").eq("season", season),
    supabase
      .from("card_inventory")
      // artSkin comes out of the frozen card json — the alternate-print roll
      // is only recorded there, never as a column.
      .select("discord_id, player_name, overall, tier, foil, signed, artSkin:card->artSkin")
      .eq("season", season),
    supabase.from("card_moments").select("id", { count: "exact", head: true }).eq("season", season),
  ]);

  const opens = (opensResult.error ? [] : ((opensResult.data as { discord_id: string; cost: number }[]) ?? [])).filter(
    (row) => !excluded.has(row.discord_id),
  );
  const cards = (
    inventoryResult.error ? [] : ((inventoryResult.data as unknown as InventoryStatRow[]) ?? [])
  ).filter((row) => !excluded.has(row.discord_id));

  const copiesByPlayer = new Map<string, number>();
  let best: EconomyStats["bestPull"] = null;
  let foils = 0;
  let signed = 0;
  let altArts = 0;
  for (const card of cards) {
    if (card.foil) foils += 1;
    if (card.signed === true) signed += 1;
    if ((card.artSkin ?? 0) > 0) altArts += 1;
    copiesByPlayer.set(card.player_name, (copiesByPlayer.get(card.player_name) ?? 0) + 1);
    if (!best || card.overall > best.overall) {
      best = { playerName: card.player_name, overall: card.overall, tier: card.tier };
    }
  }

  // Name last as the tiebreak so a dead heat renders the same on every load.
  const mostPulled = [...copiesByPlayer.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];

  return {
    packsOpened: opens.length,
    spent: opens.reduce((total, row) => total + (row.cost ?? 0), 0),
    collectors: new Set(cards.map((card) => card.discord_id)).size,
    cardsPulled: cards.length,
    foils,
    signed,
    altArts,
    momentsMinted: momentsResult.error ? 0 : momentsResult.count ?? 0,
    bestPull: best,
    mostPulled: mostPulled ? { playerName: mostPulled[0], copies: mostPulled[1] } : null,
    excludedCount: excluded.size,
  };
}
