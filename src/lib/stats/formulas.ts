import type {
  ChampionAggRow,
  PlayerAggRow,
  RankedPlayer,
  ScoutingProfile,
  ScoutingStatLine,
  TeamAggRow,
} from "./types";

// Scoring weights and benchmarks follow docs/reference/FPL_Stats_legacy.html.

/** A stat key on PlayerAggRow usable in the blended percentile+normalized scoring. */
type ScoreKey = "winrate_pct" | "kda" | "avg_dmg_per_min" | "avg_cs_per_min"
  | "avg_gold_per_min" | "avg_kills" | "avg_deaths" | "avg_assists" | "avg_vision_per_min";

type Weights = Partial<Record<ScoreKey, number>>;

const MAX_BENCHMARKS: Record<ScoreKey, number> = {
  winrate_pct: 100,
  kda: 6,
  avg_dmg_per_min: 800,
  avg_cs_per_min: 9,
  avg_gold_per_min: 450,
  avg_kills: 10,
  avg_deaths: 8,
  avg_assists: 12,
  avg_vision_per_min: 2,
};

type Percentiles = Map<ScoreKey, Map<string, number>>;

/** Sort each stat once per cohort, retaining stable ties and the first
 * matching name+tag when duplicate identities occur in the input. */
function percentileIndex(cohort: PlayerAggRow[]): Percentiles {
  const result: Percentiles = new Map();
  for (const key of Object.keys(MAX_BENCHMARKS) as ScoreKey[]) {
    const sorted = [...cohort].sort((a, b) => a[key] - b[key]);
    const ranks = new Map<string, number>();
    sorted.forEach((row, index) => {
      const identity = `${row.summoner_name}#${row.tag}`;
      if (!ranks.has(identity)) ranks.set(identity, (index / (sorted.length - 1 || 1)) * 100);
    });
    result.set(key, ranks);
  }
  return result;
}

/** Blend 40% benchmark-normalized value with 60% cohort percentile. */
function weightedScore(percentiles: Percentiles, row: PlayerAggRow, weights: Weights): number {
  const identity = `${row.summoner_name}#${row.tag}`;
  let score = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [ScoreKey, number][]) {
    const invert = key === "avg_deaths";
    const benchmark = MAX_BENCHMARKS[key];
    const value = invert ? benchmark - row[key] : row[key];
    const normalized = Math.max(0, Math.min((value / benchmark) * 100, 100));
    const rank = percentiles.get(key)!.get(identity) ?? 50;
    const percentile = invert ? 100 - rank : rank;
    score += ((normalized * 0.4 + percentile * 0.6) * weight) / 100;
    totalWeight += weight;
  }
  return (score / totalWeight) * 100;
}

// Role-specific weights for calcPowerScore — lines 1496-1503, ported verbatim.
const POWER_WEIGHTS: Record<string, Weights> = {
  TOP: { winrate_pct: 20, kda: 18, avg_dmg_per_min: 18, avg_cs_per_min: 14, avg_kills: 10, avg_deaths: 12, avg_gold_per_min: 8 },
  JUNGLE: { winrate_pct: 22, kda: 18, avg_dmg_per_min: 12, avg_kills: 12, avg_assists: 12, avg_vision_per_min: 12, avg_deaths: 12 },
  MIDDLE: { winrate_pct: 20, kda: 18, avg_dmg_per_min: 20, avg_cs_per_min: 12, avg_kills: 10, avg_deaths: 12, avg_gold_per_min: 8 },
  BOTTOM: { winrate_pct: 20, kda: 16, avg_dmg_per_min: 22, avg_cs_per_min: 14, avg_kills: 10, avg_deaths: 12, avg_gold_per_min: 6 },
  UTILITY: { winrate_pct: 25, kda: 16, avg_assists: 18, avg_vision_per_min: 20, avg_deaths: 14, avg_kills: 4, avg_dmg_per_min: 3 },
};
const POWER_WEIGHTS_DEFAULT: Weights = {
  winrate_pct: 20, kda: 18, avg_dmg_per_min: 15, avg_cs_per_min: 10, avg_kills: 10, avg_deaths: 12, avg_vision_per_min: 8, avg_gold_per_min: 7,
};

/** Rank caller-filtered rows against their role when it has at least four
 * players, otherwise against the full roster. Scores are clamped to 0–100
 * and rounded to one decimal. Min-games filtering belongs to the caller. */
export function powerRanking(rows: PlayerAggRow[]): RankedPlayer[] {
  const roles = new Map<string, PlayerAggRow[]>();
  for (const row of rows) {
    const group = roles.get(row.role_mode);
    if (group) group.push(row);
    else roles.set(row.role_mode, [row]);
  }
  const indexes = new Map<PlayerAggRow[], Percentiles>();
  const ranked: RankedPlayer[] = rows.map((row) => {
    const role = roles.get(row.role_mode)!;
    const cohort = role.length >= 4 ? role : rows;
    let percentiles = indexes.get(cohort);
    if (!percentiles) {
      percentiles = percentileIndex(cohort);
      indexes.set(cohort, percentiles);
    }
    const weights = POWER_WEIGHTS[row.role_mode] ?? POWER_WEIGHTS_DEFAULT;
    const raw = weightedScore(percentiles, row, weights);
    const score = Number(Math.max(0, Math.min(100, raw)).toFixed(1));
    return { ...row, score };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * Games-weighted merge of a player's per-season stats_player_agg rows
 * into a single "All seasons" row. Ports the design documented in
 * `supabase/migrations/20260810100002_stats_views.sql`'s header comment
 * (there is no legacy-dashboard equivalent function: the legacy sheet has
 * no per-season split, so its "All seasons" view is just its one flat
 * RAW dataset re-run through `aggregate()` — see that migration's
 * comment block for why this repo's Supabase-backed data needs a
 * dedicated combiner instead).
 *
 * Rules (per the migration comment, "simple counting columns ... summed
 * directly; rate/average columns ... must NOT be averaged across season
 * rows naively"):
 * - games, wins, total_* counting columns, first_blood_involvements: summed.
 * - avg_* columns (excluding kda): games-weighted mean, i.e.
 *   sum(avg_x_i * games_i) / sum(games_i) — reconstructs the total from
 *   each season's own per-game average times its game count.
 * - winrate_pct: sum(wins) / sum(games) * 100, rounded to 1 decimal
 *   (matches the view's own `round(100.0*wins/games, 1)` shape).
 * - kda: recomputed from summed kills/assists/deaths (reconstructed via
 *   avg_kills/avg_deaths/avg_assists * games per season, then summed),
 *   matching the view's own documented rule that KDA is "computed from
 *   summed kills/deaths/assists across a group (not as an average of
 *   each game's own kda column)" — extended here to the multi-season
 *   case for the same anti-Simpson's-paradox reason.
 * - avg_kp_pct, avg_dmg_share_pct, avg_kda_challenges: games-weighted
 *   mean (same treatment as other avg_* columns; these are themselves
 *   already per-game averages in the source view).
 *
 * `seasonLabel` (final review fix wave): the combined row's `season`
 * field defaults to the "All" sentinel, matching the original "All
 * seasons" caller. But this same combiner is also the right tool for
 * merging a SPECIFIC season's Regular+Playoffs rows when phase="All" is
 * selected (views emit one row per (season, season_phase), so that
 * fetch still returns 2 rows per player) — that merge should keep the
 * real season code, not overwrite it with "All". Pass the season code
 * explicitly for that case.
 */
export function combineSeasonRows(rows: PlayerAggRow[], seasonLabel = "All"): PlayerAggRow {
  if (rows.length === 0) {
    throw new Error("combineSeasonRows: at least one row is required");
  }
  if (rows.length === 1) return rows[0];

  const totalGames = rows.reduce((s, r) => s + r.games, 0);
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);

  const weightedMean = (pick: (r: PlayerAggRow) => number): number => {
    const sum = rows.reduce((s, r) => s + pick(r) * r.games, 0);
    return round2(sum / totalGames);
  };
  const sumOf = (pick: (r: PlayerAggRow) => number): number =>
    rows.reduce((s, r) => s + pick(r), 0);

  const totalKills = sumOf((r) => r.avg_kills * r.games);
  const totalDeaths = sumOf((r) => r.avg_deaths * r.games);
  const totalAssists = sumOf((r) => r.avg_assists * r.games);
  const kda = round2((totalKills + totalAssists) / Math.max(totalDeaths, 1));

  const first = rows[0];
  return {
    ...first,
    season: seasonLabel,
    games: totalGames,
    wins: totalWins,
    winrate_pct: round1((100 * totalWins) / totalGames),
    avg_kills: weightedMean((r) => r.avg_kills),
    avg_deaths: weightedMean((r) => r.avg_deaths),
    avg_assists: weightedMean((r) => r.avg_assists),
    kda,
    avg_kp_pct: weightedMean((r) => r.avg_kp_pct),
    avg_cs_per_min: weightedMean((r) => r.avg_cs_per_min),
    avg_gold_per_min: weightedMean((r) => r.avg_gold_per_min),
    avg_dmg_per_min: weightedMean((r) => r.avg_dmg_per_min),
    avg_dmg_share_pct: weightedMean((r) => r.avg_dmg_share_pct),
    avg_vision_per_min: weightedMean((r) => r.avg_vision_per_min),
    avg_solo_kills: weightedMean((r) => r.avg_solo_kills),
    total_solo_kills: sumOf((r) => r.total_solo_kills),
    total_plates: sumOf((r) => r.total_plates),
    total_doubles: sumOf((r) => r.total_doubles),
    total_triples: sumOf((r) => r.total_triples),
    total_quadras: sumOf((r) => r.total_quadras),
    total_pentas: sumOf((r) => r.total_pentas),
    avg_cs_at_10: weightedMean((r) => r.avg_cs_at_10),
    avg_gold_at_10: weightedMean((r) => r.avg_gold_at_10),
    avg_xp_at_10: weightedMean((r) => r.avg_xp_at_10),
    avg_dmg_taken_per_min: weightedMean((r) => r.avg_dmg_taken_per_min),
    avg_kda_challenges: weightedMean((r) => r.avg_kda_challenges),
    first_blood_involvements: sumOf((r) => r.first_blood_involvements),
    avg_game_duration: weightedMean((r) => r.avg_game_duration),
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Generic group-and-combine: partitions `rows` by `keyFn`, then reduces
 * each group down to one row via `combiner`. Order of the returned array
 * follows first-seen-key order of `rows` (Map insertion order), not
 * combiner-arbitrary order.
 *
 * Centralizes the "group by key, combine each group" pattern every tab
 * (Leaderboard/MVP/Power Rankings/Teams/Champions/Players) previously
 * hand-rolled inline with a `Map` + `for` loop, each keyed only on
 * `season === ALL_SEASONS` — which under-merged whenever a SPECIFIC season
 * was selected together with phase="All" (views emit one row per
 * (season, season_phase), so a single season with both Regular and
 * Playoffs games still returns 2 rows per player/team/champion in that
 * case). Callers now merge whenever the fetch could have spanned more than
 * one (season, season_phase) partition — i.e. `season === ALL_SEASONS ||
 * phase === "All"` — using this helper with the same key/combiner they
 * already had.
 */
export function mergeRows<T>(rows: T[], keyFn: (row: T) => string, combiner: (group: T[]) => T): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return Array.from(groups.values()).map(combiner);
}

/**
 * Games-weighted merge of a team's per-season/-phase stats_team_agg rows
 * into one combined row. Same treatment as `combineSeasonRows` above:
 * counting columns (games, wins, losses) summed; rate columns
 * (winrate_pct, avg_duration_min, dragon_rate, baron_rate,
 * first_blood_rate, first_tower_rate, avg_team_kills) games-weighted mean
 * rather than a naive average, to avoid Simpson's paradox across
 * seasons/phases with different game counts.
 *
 * Moved into formulas.ts from TeamsTab.tsx (final review fix wave) to kill
 * the acknowledged duplication with `combineChampionRows`'s near-identical
 * shape and to make it usable from a shared `mergeRows` call site; result's
 * `season` sentinel is the caller's choice via `seasonLabel` (TeamsTab
 * passes `ALL_SEASONS` for a true "All seasons" merge, but the same
 * combiner also has to run for a single season + phase="All" merge, where
 * the row's own real season code should be kept, not overwritten with the
 * "All seasons" sentinel).
 */
export function combineTeamRows(rows: TeamAggRow[], seasonLabel?: string): TeamAggRow {
  if (rows.length === 0) {
    throw new Error("combineTeamRows: at least one row is required");
  }
  if (rows.length === 1 && seasonLabel === undefined) return rows[0];
  const totalGames = rows.reduce((s, r) => s + r.games, 0);
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);
  const totalLosses = rows.reduce((s, r) => s + r.losses, 0);
  const weightedMean = (pick: (r: TeamAggRow) => number): number => {
    const sum = rows.reduce((s, r) => s + pick(r) * r.games, 0);
    return Math.round((sum / totalGames) * 100) / 100;
  };
  const first = rows[0];
  return {
    ...first,
    season: seasonLabel ?? first.season,
    games: totalGames,
    wins: totalWins,
    losses: totalLosses,
    winrate_pct: Math.round(((100 * totalWins) / totalGames) * 10) / 10,
    avg_duration_min: weightedMean((r) => r.avg_duration_min),
    dragon_rate: weightedMean((r) => r.dragon_rate),
    baron_rate: weightedMean((r) => r.baron_rate),
    first_blood_rate: weightedMean((r) => r.first_blood_rate),
    first_tower_rate: weightedMean((r) => r.first_tower_rate),
    avg_team_kills: weightedMean((r) => r.avg_team_kills),
  };
}

/**
 * Games-weighted-by-picks merge of a champion's per-season/-phase
 * stats_champion_agg rows into one combined row. Same treatment as
 * `combineSeasonRows`/`combineTeamRows`: counting columns (picks, bans,
 * games_in_scope) summed; winrate_pct and avg_kda recomputed from summed
 * totals rather than naively averaged; presence_pct recomputed from summed
 * (picks+bans) over summed games_in_scope, matching the view's own formula.
 *
 * Moved into formulas.ts from ChampionsTab.tsx (final review fix wave),
 * with one correctness fix along the way: `wins` is now summed directly
 * from each row's own `wins` field instead of being reconstructed as
 * `round((winrate_pct/100)*picks)`, which round-trips through an
 * already-rounded percentage and can drift from the true win count by a
 * game or more once multiple rows are combined. `avg_kda` is still
 * weighted by picks (the best available proxy for game count per
 * season/phase — see below) since kda's own deaths denominator isn't
 * reconstructible from the view's exposed columns.
 */
export function combineChampionRows(rows: ChampionAggRow[], seasonLabel?: string): ChampionAggRow {
  if (rows.length === 0) {
    throw new Error("combineChampionRows: at least one row is required");
  }
  if (rows.length === 1 && seasonLabel === undefined) return rows[0];
  const totalPicks = rows.reduce((s, r) => s + r.picks, 0);
  const totalBans = rows.reduce((s, r) => s + r.bans, 0);
  const totalGamesInScope = rows.reduce((s, r) => s + r.games_in_scope, 0);
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);
  // avg_kda per row is (kills+assists)/max(deaths,1) for that row's picks;
  // reconstructing each row's implied deaths from its kda and pick count
  // isn't exact (kda is already rounded), so weight by picks as the best
  // available proxy for game count per season/phase, consistent with the
  // "weighted mean" treatment used elsewhere for average-shaped columns.
  const weightedKda =
    totalPicks > 0 ? rows.reduce((s, r) => s + r.avg_kda * r.picks, 0) / totalPicks : 0;

  const first = rows[0];
  return {
    ...first,
    season: seasonLabel ?? first.season,
    picks: totalPicks,
    bans: totalBans,
    games_in_scope: totalGamesInScope,
    wins: totalWins,
    winrate_pct: totalPicks > 0 ? Math.round(((100 * totalWins) / totalPicks) * 10) / 10 : 0,
    avg_kda: Math.round(weightedKda * 100) / 100,
    presence_pct:
      totalGamesInScope > 0
        ? Math.round((100 * (totalPicks + totalBans)) / totalGamesInScope * 10) / 10
        : 0,
  };
}

/** Raw scouting summary from aggregate stats. Form, consistency, matchup
 * differences and damage-type splits require per-game data and are omitted. */
export function scoutingProfile(row: PlayerAggRow): ScoutingProfile {
  const line = (label: string, value: number, fmt: ScoutingStatLine["fmt"]): ScoutingStatLine => ({ label, value, fmt });

  return {
    player: row.summoner_name,
    role: row.role_mode,
    games: row.games,
    wins: row.wins,
    losses: row.games - row.wins,
    winrate_pct: row.winrate_pct,
    // Core Performance — legacy lines 2881-2887 (statRow calls read
    // p.kda, p.winRate, p.killsPerGame, p.deathsPerGame, p.assistsPerGame;
    // simpleRow calls read colAvg('Solo Kills') and colAvg('Kill
    // Participation %'), mapped to avg_solo_kills / avg_kp_pct).
    core: [
      line("KDA", row.kda, "dec2"),
      line("Win Rate", row.winrate_pct, "pct"),
      line("Kills/Game", row.avg_kills, "dec1"),
      line("Deaths/Game", row.avg_deaths, "dec1"),
      line("Assists/Game", row.avg_assists, "dec1"),
      line("Solo Kills/Game", row.avg_solo_kills, "dec1"),
      line("Kill Participation", row.avg_kp_pct, "pct"),
    ],
    // Damage Profile — legacy line 2892 (p.damagePerMin) and line 2900
    // (colAvg('Damage Taken/min'), mapped to the view's avg_dmg_taken_per_min).
    damage: [
      line("DMG/Min", row.avg_dmg_per_min, "int"),
      line("DMG Taken/Min", row.avg_dmg_taken_per_min, "int"),
    ],
    // Economy — legacy lines 2959-2962 (p.goldPerMin, p.csPerMin, and
    // simpleRow('Turret Plates', colAvg('Turret Plates Destroyed').toFixed(1)+'/g')).
    // The view has no per-game turret-plates average column, only the
    // season/phase sum (total_plates); total_plates / games reconstructs
    // the same per-game mean colAvg('Turret Plates Destroyed') computes
    // over the player's raw rows (sum of a column / row count == mean).
    economy: [
      line("Gold/Min", row.avg_gold_per_min, "dec1"),
      line("CS/Min", row.avg_cs_per_min, "dec1"),
      line("Turret Plates", row.total_plates / row.games, "dec1"),
    ],
    // Vision & Map Control — legacy line 2968 (p.visionPerMin).
    vision: [
      line("Vision/Min", row.avg_vision_per_min, "dec2"),
    ],
  };
}
