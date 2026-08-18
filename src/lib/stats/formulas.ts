import type {
  ChampionAggRow,
  PlayerAggRow,
  RankedPlayer,
  ScoutingProfile,
  ScoutingStatLine,
  TeamAggRow,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Legacy source: docs/reference/FPL_Stats_legacy.html
//
// Its `aggregate()` (lines 885-892) builds the per-player object (`p`)
// that every formula below reads from. Field-name mapping to PlayerAggRow
// (this module's input shape), confirmed against that function's
// property list (line 891):
//
//   legacy `p.*`        PlayerAggRow column
//   -------------------  -------------------
//   winRate           -> winrate_pct
//   kda               -> kda
//   damagePerMin      -> avg_dmg_per_min
//   csPerMin          -> avg_cs_per_min
//   goldPerMin        -> avg_gold_per_min
//   killsPerGame      -> avg_kills
//   deathsPerGame     -> avg_deaths
//   assistsPerGame    -> avg_assists
//   visionPerMin      -> avg_vision_per_min
//   mainRole          -> role_mode
//   player            -> summoner_name
//   games             -> games
//
// All fields both formulas need are present on the view (Task 2), so no
// NEEDS_CONTEXT gap exists for Power Rankings or MVP.
// ─────────────────────────────────────────────────────────────────────────

/** A stat key on PlayerAggRow usable in the blended percentile+normalized scoring. */
type ScoreKey = "winrate_pct" | "kda" | "avg_dmg_per_min" | "avg_cs_per_min"
  | "avg_gold_per_min" | "avg_kills" | "avg_deaths" | "avg_assists" | "avg_vision_per_min";

type Weights = Partial<Record<ScoreKey, number>>;

// maxBenchmarks — from calcPowerScore (line 1504-1507); calcMVPScore's
// table (line 1275-1278) was byte-identical minus goldPerMin:450, but the
// MVP tab was folded into Power Rankings (see StatsTabs.tsx), so only
// powerRanking reads this now.
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

/**
 * Percentile of `row` within `cohort` for `key`, ascending sort (worst=0,
 * best≈100), inverted for "lower is better" keys (deaths).
 * Ports calcMVPScore's / calcPowerScore's `pctile()` (lines 1239-1245 /
 * 1480-1486) — byte-identical in both. `findIndex` matches on
 * `summoner_name` in the legacy sheet (legacy matches on `player`, which
 * carries no tag disambiguation there); this repo's data has 6 real
 * shared-summoner_name pairs across distinct tags (different real
 * players, e.g. Aura#5950 vs Aura#RGB0 — see stats_records' `tag` column
 * fix), so matching on `summoner_name` alone can find the WRONG row's
 * index when two same-named players are both in `cohort`. Matched on
 * `${summoner_name}#${tag}` instead — unique per real player, behavior
 * otherwise unchanged (still first-matching-index, ties not deduplicated).
 */
function pctile(cohort: PlayerAggRow[], row: PlayerAggRow, key: ScoreKey, invert: boolean): number {
  const sorted = [...cohort].sort((a, b) => a[key] - b[key]);
  const rowKey = `${row.summoner_name}#${row.tag}`;
  const idx = sorted.findIndex((x) => `${x.summoner_name}#${x.tag}` === rowKey);
  if (idx === -1) return 50;
  const pc = (idx / (sorted.length - 1 || 1)) * 100;
  return invert ? 100 - pc : pc;
}

/**
 * Normalizes `val` onto a 0-100 scale against `maxGood` (the "perfect"
 * benchmark), clamped. Ports `normVal()` — calcMVPScore lines 1249-1253,
 * calcPowerScore lines 1487-1490 (calcMVPScore's version has a redundant
 * `invert?n:n` branch that always returns `n`; both are equivalent to
 * this single clamp).
 */
function normVal(val: number, maxGood: number, invert: boolean): number {
  const v = invert ? maxGood - val : val;
  return Math.max(0, Math.min((v / maxGood) * 100, 100));
}

/**
 * Blend: 40% raw normalized value + 60% role-cohort percentile. Ports
 * `blendedScore()`/`blended()` (calcMVPScore lines 1257-1261,
 * calcPowerScore lines 1491-1493) — identical 0.4/0.6 split in both.
 */
function blended(cohort: PlayerAggRow[], row: PlayerAggRow, key: ScoreKey, invert: boolean): number {
  const maxGood = MAX_BENCHMARKS[key];
  const raw = normVal(row[key], maxGood, invert);
  const pct = pctile(cohort, row, key, invert);
  return raw * 0.4 + pct * 0.6;
}

/** deathsPerGame (avg_deaths) is the only inverted key in both weight tables (lower is better). */
function isInverted(key: ScoreKey): boolean {
  return key === "avg_deaths";
}

/**
 * Weighted composite score over `weights`, gated per-key by `blended()`:
 * `sum(blended*weight)/100 / totalWeight*100`, before powerRanking's final
 * rounding/clamp step (0-100, 1 decimal). The retired mvpScores shared this
 * until the MVP tab was folded into Power Rankings — see StatsTabs.tsx.
 */
function weightedScore(cohort: PlayerAggRow[], row: PlayerAggRow, weights: Weights): number {
  let score = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights) as [ScoreKey, number][]) {
    score += (blended(cohort, row, key, isInverted(key)) * weight) / 100;
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

/**
 * Same-role cohort with a >=4-member fallback to the full roster. Ports
 * calcPowerScore's `sameRole` (lines 1478-1479): powerRanking passes
 * `minGames: null` since its caller renderPower already pre-filters `all`
 * by the page's own min-games <select>. The `minGames` gate existed for
 * calcMVPScore's `sameRole` (lines 1234-1236, `games>=minG` with minG=5
 * inline) — retired along with mvpScores when the MVP tab was folded into
 * Power Rankings.
 */
function sameRoleCohort(cohort: PlayerAggRow[], row: PlayerAggRow, minGames: number | null): PlayerAggRow[] {
  const base = minGames === null ? cohort : cohort.filter((r) => r.games >= minGames);
  let sameRole = base.filter((r) => r.role_mode === row.role_mode);
  if (sameRole.length < 4) sameRole = base;
  return sameRole;
}

/**
 * Power Rankings. Ports `calcPowerScore(p, all)` (lines 1473-1516) +
 * `renderPower`'s sort/rank (line 1517: `el.sort((a,b)=>b.powerScore-a.powerScore)`).
 *
 * Does NOT apply renderPower's `prMinG` filter (default 5+, line 803
 * `<option value="5" selected>`) — that is a page-level UI control, not
 * part of the formula; callers pass the already-filtered rows they want
 * ranked, matching how `calcPowerScore(p, all)` is called with `all`
 * already pre-filtered by `renderPower`'s own `el=PD.filter(p=>p.games>=mg)`
 * (line 1517) before `el.forEach(p=>p.powerScore=calcPowerScore(p,el))`.
 *
 * Rounding: `+(...).toFixed(1)` (line 1515) -> 1 decimal place, clamped to
 * [0, 100].
 */
export function powerRanking(rows: PlayerAggRow[]): RankedPlayer[] {
  const ranked: RankedPlayer[] = rows.map((row) => {
    const cohort = sameRoleCohort(rows, row, null);
    const weights = POWER_WEIGHTS[row.role_mode] ?? POWER_WEIGHTS_DEFAULT;
    const raw = weightedScore(cohort, row, weights);
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

// ─────────────────────────────────────────────────────────────────────────
// scoutingProfile — SEE the NEEDS_CONTEXT note in formulas.test.ts above
// this export's tests for the full rationale. Summary: the legacy
// dashboard's real scouting-specific derived metrics — getConsistency()
// (lines 3930-3946), getFormRating() (lines 3951-3987), the Laning Phase
// diffs (lines 2904-2928), the damage type split (lines 2895-2899), and
// getTeamRelativeStats() (lines 3765-3833) — all require either per-game
// raw_stats rows or a same-role cohort, neither of which this function's
// signature (`row: PlayerAggRow`, a single pre-aggregated row) provides.
// Porting them here would mean either silently approximating with the
// wrong inputs or changing the exported signature the brief specifies
// (Task 4-7 import this exact shape) — so instead this ports only the
// subset of the legacy Scouting report genuinely computable from one
// PlayerAggRow: the raw (non-percentile) values shown in the "Core
// Performance" (lines 2880-2888, all 7 rows: KDA, Win Rate, Kills/Game,
// Deaths/Game, Assists/Game, Solo Kills/Game, Kill Participation),
// "Damage Profile" (lines 2890-2892, 2900 — DMG/Min and DMG Taken/Min
// only; the physical/magic/true split and DMG Per Gold on lines
// 2893-2899 need raw_stats columns the view doesn't expose), "Economy"
// (lines 2958-2962 — Gold/Min, CS/Min, and Turret Plates; Gold Share on
// line 2961 and Bounty Gold on line 2963 need columns the view doesn't
// expose), and "Vision & Map Control" (line 2968 — Vision/Min only) cards.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Single-row scouting summary: the legacy Scouting report's raw
 * (non-percentile, non-per-game) stat lines. See the block comment above
 * for exactly which legacy card rows are and are not ported, and why.
 */
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
