/**
 * Derived facts for the weekly homepage brief.
 *
 * The generator's contract is that every number is computed here and the model
 * only writes prose around facts it is handed. Handing it raw scorelines broke
 * that: asked to recap week 1 it listed three 2-1 results and then wrote that
 * only one side had forced a third game, contradicting itself in the same
 * brief. Anything a sentence might assert -- how many series went the
 * distance, who swept, who leads a stat -- is counted here instead of being
 * left to inference.
 */

export interface BriefFixture {
  division: string | null;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  best_of: number | null;
}

export interface SeriesResult {
  division: string | null;
  winner: string | null;
  loser: string | null;
  score: string;
  games_played: number;
  /** True when the series used every game its format allows (2-1 in a Bo3). */
  went_to_deciding_game: boolean;
  was_sweep: boolean;
}

export interface SeriesSummary {
  results: SeriesResult[];
  total_series: number;
  series_that_went_the_distance: number;
  teams_that_went_the_distance: string[];
  sweeps: number;
}

export function summariseSeries(fixtures: BriefFixture[]): SeriesSummary {
  const results: SeriesResult[] = fixtures.map((fixture) => {
    const a = fixture.score_a ?? 0;
    const b = fixture.score_b ?? 0;
    const aWon = a >= b;
    const games = a + b;
    // Compared against best_of rather than hardcoded to 3, so a Bo5 playoff
    // series is only "the distance" at 3-2.
    const bestOf = fixture.best_of ?? 3;
    return {
      division: fixture.division,
      winner: aWon ? fixture.team_a : fixture.team_b,
      loser: aWon ? fixture.team_b : fixture.team_a,
      score: `${Math.max(a, b)}-${Math.min(a, b)}`,
      games_played: games,
      went_to_deciding_game: games === bestOf,
      was_sweep: Math.min(a, b) === 0,
    };
  });

  const distance = results.filter((r) => r.went_to_deciding_game);
  return {
    results,
    total_series: results.length,
    series_that_went_the_distance: distance.length,
    teams_that_went_the_distance: distance.flatMap((r) =>
      [r.winner, r.loser].filter((name): name is string => Boolean(name)),
    ),
    sweeps: results.filter((r) => r.was_sweep).length,
  };
}

/**
 * The Monday-to-Monday window containing the most recent game.
 *
 * The stat query used to start from the earliest `scheduled_at` of the
 * recapped week's fixtures, which silently returned nothing whenever a series
 * was played before its scheduled slot -- and an empty stat list is why a
 * brief once claimed no individual stat lines existed for a week that had
 * been fully ingested. Deriving the window from the games themselves cannot
 * miss them.
 */
export function weekBoundsFromLatest(dates: Array<string | null>): { start: string; end: string } | null {
  const latest = dates
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  if (!latest) return null;

  const start = new Date(latest);
  if (Number.isNaN(start.getTime())) return null;
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface BriefStatRow {
  summoner_name: string | null;
  team_name: string | null;
  champion: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  total_damage_to_champions: number | null;
  game_date: string | null;
}

export interface PlayerLine {
  player: string;
  team: string | null;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  damage: number;
}

export function withinWindow(
  rows: BriefStatRow[],
  bounds: { start: string; end: string } | null,
): BriefStatRow[] {
  if (!bounds) return [];
  const start = new Date(bounds.start).getTime();
  const end = new Date(bounds.end).getTime();
  return rows.filter((row) => {
    if (!row.game_date) return false;
    const at = new Date(row.game_date).getTime();
    return at >= start && at < end;
  });
}

/** Per-player totals for the week, best KDA first. */
export function aggregatePlayerLines(rows: BriefStatRow[]): PlayerLine[] {
  const grouped = new Map<string, PlayerLine>();
  for (const row of rows) {
    const name = row.summoner_name?.trim();
    if (!name) continue;
    const line = grouped.get(name) ?? {
      player: name,
      team: row.team_name ?? null,
      games: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      kda: 0,
      damage: 0,
    };
    line.games += 1;
    line.kills += row.kills ?? 0;
    line.deaths += row.deaths ?? 0;
    line.assists += row.assists ?? 0;
    line.damage += row.total_damage_to_champions ?? 0;
    grouped.set(name, line);
  }
  return [...grouped.values()]
    .map((line) => ({
      ...line,
      // Deaths of zero would divide to Infinity, which serialises to null in
      // JSON and reads to the model as "no data" rather than "flawless".
      kda: Number(((line.kills + line.assists) / Math.max(line.deaths, 1)).toFixed(2)),
    }))
    .sort((a, b) => b.kda - a.kda || b.damage - a.damage);
}
