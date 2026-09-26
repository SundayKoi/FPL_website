// Which seasons are rated by playstyle (styleRating.ts), and the history
// each one is graded against.
//
// Server-side by use: queries.ts is the only importer, and the file behind
// it grows by a season a year. Keep it out of anything a client component
// imports — build.ts is one of those, which is why the engine takes the
// yardstick as an argument instead of reading it here.

import { compareSeasonCodes, seasonBelongsToLeague } from "@/lib/league/season";
import type { StyleYardstick } from "./styleRating";
import generated from "./styleYardsticks.json";

export interface StyleYardstickFile {
  /** How the file was made and how to remake it, for whoever opens it. */
  about: string;
  /** Season code -> the yardstick that season is graded against. */
  seasons: Record<string, StyleYardstick>;
}

const YARDSTICKS = generated as unknown as StyleYardstickFile;

/**
 * Seasons that were printed before the style rating existed. They keep the
 * rating they were printed with — their live cards, their Season's End and
 * any rebuild of their editions — so every copy already pulled keeps
 * agreeing with the cards around it. Premier S5 and Academy A1 were the
 * running seasons when the style rating was agreed (2026-09-25): it starts
 * with S6 and A2, and never touches a season already underway.
 */
export const LEGACY_RATING_SEASONS: ReadonlySet<string> = new Set(["S1", "S2", "S3", "S4", "S5", "A1"]);

const normalize = (season: string): string => season.trim().toLocaleUpperCase();

export function ratesByPlaystyle(season: string | null | undefined): boolean {
  const code = season?.trim();
  return Boolean(code) && !LEGACY_RATING_SEASONS.has(normalize(code!));
}

/**
 * The yardstick `season` is graded against, or null for a season rated the
 * way seasons before S6 and A2 were.
 *
 * A season with no entry of its own — the generator was not re-run at
 * rollover — takes its league's newest one instead of quietly reverting to
 * the old rating: graded against slightly older history is still graded by
 * the rule the league agreed.
 */
export function styleYardstickFor(
  season: string | null | undefined,
  file: StyleYardstickFile = YARDSTICKS,
): StyleYardstick | null {
  if (!ratesByPlaystyle(season)) return null;
  const code = normalize(season!);
  const own = file.seasons[code];
  if (own) return own;
  const codes = Object.keys(file.seasons).sort(compareSeasonCodes);
  const league = seasonBelongsToLeague(code, "academy") ? "academy" : "premier";
  const pick = codes.filter((c) => seasonBelongsToLeague(c, league)).at(-1) ?? codes.at(-1);
  return pick ? file.seasons[pick] : null;
}
