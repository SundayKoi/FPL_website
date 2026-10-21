// Offseason Overall ratings, from the league's own card engine.
//
// The event's games live in offseason_stats (raw_stats' shape), so they run
// through exactly what the weekly cards do: aggregate the rows into a
// cohort, grade each player against it, and style-rate against the event's
// yardstick season (S6's by default — the playstyle ratings S6 introduced).
// The rating that decides captains and elimination is CUMULATIVE: every
// game the event has played so far, rated as one cohort. Each week is also
// rated on its own for the player pages' trend.

import { buildSeasonCards, type CardGameMeta, type CardGameRow, type PlayerCardData } from "@/lib/cards/build";
import { cardPlayerKey, tierFor } from "@/lib/cards/cardKeys";
import { styleYardstickFor } from "@/lib/cards/styleYardsticks";
import type { LolRole } from "@/lib/draft/types";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import { compareByRating } from "./order";
import { splitRiotId, type OffseasonEntrant } from "./types";

export { compareByRating };

/**
 * One player's row from one game, as offseason_stats stores it. A sub's row
 * is credited to the player they replaced (see subs.ts): it then carries that
 * player's name and `played_by` keeps the sub's own "Name#TAG".
 */
export type OffseasonStatRow = CardGameRow & WeeklyRawStatRow & { team_side?: string | null; played_by?: string };

export interface WeekRating {
  week: number;
  overall: number | null;
  games: number;
}

export interface EntrantRating {
  entrantId: string;
  /** The cumulative card; null until the player has an ingested game. */
  card: PlayerCardData | null;
  /** The card's Overall, staff's adjustment included. */
  overall: number | null;
  /** Staff's points on top of the rated Overall (OffseasonEntrant.overall_adjustment). */
  adjustment: number;
  /** Games rated into the Overall. */
  games: number;
  /** The player's record for the whole event; see `records` below. */
  wins: number;
  losses: number;
  weekly: WeekRating[];
}

/** The card engine's key for an entrant's Riot ID, or null if malformed. */
export function entrantKey(riotId: string): string | null {
  const parts = splitRiotId(riotId);
  return parts ? cardPlayerKey(parts.name, parts.tag) : null;
}

function gameLogOf(rows: OffseasonStatRow[]): Map<string, CardGameMeta> {
  const log = new Map<string, CardGameMeta>();
  for (const row of rows) {
    const entry = log.get(row.match_id) ?? { durationMin: Number(row.game_duration_min) || 0, blueTeam: null, redTeam: null };
    const side = (row.team_side ?? "").toLowerCase();
    if (side === "blue" && !entry.blueTeam) entry.blueTeam = row.team_name ?? null;
    if (side === "red" && !entry.redTeam) entry.redTeam = row.team_name ?? null;
    log.set(row.match_id, entry);
  }
  return log;
}

/** Cards for one cohort of rows, keyed by player key. */
export function rateRows(rows: OffseasonStatRow[], yardstickSeason: string): Map<string, PlayerCardData> {
  if (rows.length === 0) return new Map();
  // The style rating keys a team's damage taken by team_name, so a row the
  // ingest could not name still needs its side to stand in for one.
  const named = rows.map((row) => (row.team_name ? row : { ...row, team_name: row.team_side ?? null }));
  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const row of named) {
    const key = cardPlayerKey(row.summoner_name, row.tag);
    const list = gamesByPlayer.get(key);
    if (list) list.push(row);
    else gamesByPlayer.set(key, [row]);
  }
  const cards = buildSeasonCards({
    cohort: aggregateWeeklyPlayerRows(named as WeeklyRawStatRow[]),
    gamesByPlayer,
    gameLog: gameLogOf(named),
    yardstick: styleYardstickFor(yardstickSeason),
  });
  return new Map(cards.map((card) => [cardPlayerKey(card.name, card.tag), card]));
}

/**
 * Every entrant's cumulative rating and week-by-week trend. `weekOfMatch`
 * maps a Riot match id to the event week it was played in; rows for other
 * matches are ignored. `records` is each player's record from game results
 * (standings.ts playerRecords); without it the record is the card's, from the
 * rated games alone.
 */
export function rateEntrants({
  entrants,
  rows,
  weekOfMatch,
  yardstickSeason,
  records,
}: {
  entrants: OffseasonEntrant[];
  rows: OffseasonStatRow[];
  weekOfMatch: Map<string, number>;
  yardstickSeason: string;
  records?: Map<string, { wins: number; losses: number }>;
}): Map<string, EntrantRating> {
  const eventRows = rows.filter((row) => weekOfMatch.has(row.match_id));
  const cumulative = rateRows(eventRows, yardstickSeason);

  const rowsByWeek = new Map<number, OffseasonStatRow[]>();
  for (const row of eventRows) {
    const week = weekOfMatch.get(row.match_id)!;
    const list = rowsByWeek.get(week);
    if (list) list.push(row);
    else rowsByWeek.set(week, [row]);
  }
  const weeks = [...rowsByWeek.keys()].sort((a, b) => a - b);
  const weeklyCards = new Map(weeks.map((week) => [week, rateRows(rowsByWeek.get(week)!, yardstickSeason)]));
  const gamesByKeyWeek = new Map<string, number>();
  for (const row of eventRows) {
    const id = `${cardPlayerKey(row.summoner_name, row.tag)}|${weekOfMatch.get(row.match_id)}`;
    gamesByKeyWeek.set(id, (gamesByKeyWeek.get(id) ?? 0) + 1);
  }

  const ratings = new Map<string, EntrantRating>();
  for (const entrant of entrants) {
    const key = entrantKey(entrant.riot_id);
    const adjustment = entrant.overall_adjustment ?? 0;
    const card = adjustCard(key ? cumulative.get(key) ?? null : null, adjustment);
    ratings.set(entrant.id, {
      entrantId: entrant.id,
      card,
      overall: card?.overall ?? null,
      adjustment,
      games: card ? card.wins + card.losses : 0,
      wins: records ? (records.get(entrant.id)?.wins ?? 0) : (card?.wins ?? 0),
      losses: records ? (records.get(entrant.id)?.losses ?? 0) : (card?.losses ?? 0),
      weekly: key
        ? weeks
            .map((week) => ({
              week,
              overall: weeklyCards.get(week)!.get(key)?.overall ?? null,
              games: gamesByKeyWeek.get(`${key}|${week}`) ?? 0,
            }))
            .filter((week) => week.games > 0)
        : [],
    });
  }
  return ratings;
}

/**
 * A card with staff's adjustment on its Overall, kept within the engine's
 * 1-99 and with the tier it now reaches. Week-by-week Overalls stay as rated.
 */
export function adjustCard(card: PlayerCardData | null, adjustment: number): PlayerCardData | null {
  if (!card || !adjustment) return card;
  const overall = Math.max(1, Math.min(99, card.overall + adjustment));
  return { ...card, overall, tier: tierFor(overall) };
}

/** Each role's players, best rated first — the event's leaderboards. */
export function leaderboards(
  entrants: OffseasonEntrant[],
  ratings: Map<string, Pick<EntrantRating, "overall">>,
): Record<LolRole, OffseasonEntrant[]> {
  const boards: Record<LolRole, OffseasonEntrant[]> = { top: [], jungle: [], mid: [], adc: [], support: [] };
  for (const entrant of entrants) {
    if (entrant.assigned_role && entrant.status !== "withdrawn") boards[entrant.assigned_role].push(entrant);
  }
  const order = compareByRating(ratings);
  for (const role of Object.keys(boards) as LolRole[]) boards[role].sort(order);
  return boards;
}
