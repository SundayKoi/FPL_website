// The card engine's identities and labels: tier bands, URL slugs, and the
// keys players and team badges are looked up by.
//
// Split out of build.ts so a client component that only needs a slug, a
// tier or a key does not pull the whole rating engine (build.ts,
// styleRating.ts, playstyle.ts) into its bundle. build.ts re-exports every
// name here, so existing imports keep working.

import type { CardTier } from "./build";

const TIERS: { min: number; tier: CardTier }[] = [
  { min: 94, tier: { key: "challenger", label: "Challenger" } },
  { min: 89, tier: { key: "master", label: "Master" } },
  { min: 83, tier: { key: "diamond", label: "Diamond" } },
  { min: 77, tier: { key: "emerald", label: "Emerald" } },
  { min: 70, tier: { key: "platinum", label: "Platinum" } },
  { min: 60, tier: { key: "gold", label: "Gold" } },
  { min: 50, tier: { key: "silver", label: "Silver" } },
  { min: 0, tier: { key: "bronze", label: "Bronze" } },
];

export function tierFor(overall: number): CardTier {
  return (TIERS.find((band) => overall >= band.min) ?? TIERS[TIERS.length - 1]).tier;
}

/** URL identity for a card page — unique per real player (name collides,
 *  name#tag doesn't; see stats_records' tag column). Latin diacritics fold
 *  to their base letter (Archêr → archer-ezpz) instead of vanishing into a
 *  hyphen; scripts with no Latin base (Greek, kana) still strip, exactly as
 *  before, so no pre-fold slug in the wild changes. */
export function cardSlug(summonerName: string, tag: string): string {
  return `${summonerName}-${tag}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The key a team badge is looked up by.
 *
 * raw_stats.team_name is written by the ingest from `league_teams.name`,
 * but the logo lives on the DRAFT-side `teams` table — two tables whose
 * names only have to agree by convention. Punctuation and spacing drift
 * between them constantly ("Fraudulent 5" vs "Fraudulent5"), so both sides
 * collapse to letters and digits before they are compared. Genuine
 * spelling differences are bridged by abbreviation in queries.ts.
 */
export function teamBadgeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The engine's internal player key ("name#tag", lowercased). */
export function playerKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name.trim().toLowerCase()}#${row.tag.trim().toLowerCase()}`;
}

/** The shared player key ("name#tag", lowercased) — exported so data
 *  layers key their maps the same way the engine does. */
export function cardPlayerKey(summonerName: string, tag: string): string {
  return playerKey({ summoner_name: summonerName, tag });
}

/** The title a player who qualified for nothing is given. */
export const FALLBACK_ARCHETYPE = "Jack of All Trades";
