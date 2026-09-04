// Row shapes for the five stats aggregate views defined in
// supabase/migrations/20260810100002_stats_views.sql (Task 2). Field names
// and nullability mirror the view's SELECT list exactly — see that
// migration's column list (also echoed in
// .superpowers/sdd/2026-08-10-stats-system/task-2-brief.md) for the
// source of truth. Do not rename fields here without updating the view.

/** One row of `stats_player_agg`: per summoner + season + phase (+ most-played role). */
export interface PlayerAggRow {
  summoner_name: string;
  tag: string;
  season: string;
  season_phase: string;
  role_mode: string;
  games: number;
  wins: number;
  winrate_pct: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda: number;
  avg_kp_pct: number;
  avg_cs_per_min: number;
  avg_gold_per_min: number;
  avg_dmg_per_min: number;
  avg_dmg_share_pct: number;
  avg_vision_per_min: number;
  avg_solo_kills: number;
  total_solo_kills: number;
  total_plates: number;
  total_doubles: number;
  total_triples: number;
  total_quadras: number;
  total_pentas: number;
  avg_cs_at_10: number;
  avg_gold_at_10: number;
  avg_xp_at_10: number;
  avg_dmg_taken_per_min: number;
  avg_kda_challenges: number;
  first_blood_involvements: number;
  avg_game_duration: number;
}

/** One row of `stats_team_agg`: per FPL team + season + phase. */
export interface TeamAggRow {
  team_name: string;
  season: string;
  season_phase: string;
  games: number;
  wins: number;
  losses: number;
  winrate_pct: number;
  avg_duration_min: number;
  dragon_rate: number;
  baron_rate: number;
  first_blood_rate: number;
  first_tower_rate: number;
  avg_team_kills: number;
  /** Games won or lost by forfeit, laid over the played games by
   *  applyForfeits (src/lib/stats/forfeits.ts). Absent on a raw view row. */
  forfeit_wins?: number;
  forfeit_losses?: number;
}

/** One row of `stats_champion_agg`: per champion + season + phase. */
export interface ChampionAggRow {
  champion: string;
  season: string;
  season_phase: string;
  picks: number;
  wins: number;
  winrate_pct: number;
  avg_kda: number;
  bans: number;
  games_in_scope: number;
  presence_pct: number;
}

/**
 * One row of `stats_records`: top-5 single-game bests per category. Per
 * Task 3 brief's note on Task 2: category labels are whatever the view
 * emits — render verbatim, do not re-map or re-title them here.
 *
 * `tag` added in the Task 7 fix round (migration
 * 20260810100003_records_tag.sql): `summoner_name` alone collides for the 6
 * shared-name/different-tag pairs in raw_stats (e.g. Aura#5950 vs
 * Aura#RGB0), so record attribution needs both fields.
 */
export interface RecordRow {
  category: string;
  summoner_name: string;
  tag: string;
  champion: string;
  team_name: string;
  season: string;
  season_phase: string;
  match_id: string;
  game_date: string;
  value: number;
}

/** One row of `stats_game_log`: per match_id, feeds the Timeline tab. */
export interface GameLogRow {
  match_id: string;
  game_date: string;
  season: string;
  season_phase: string;
  duration_min: number;
  blue_team: string;
  red_team: string;
  winner_team: string;
  total_kills: number;
}

/** A player row ranked by Power Ranking score, with the score attached. */
export interface RankedPlayer extends PlayerAggRow {
  score: number;
}

/**
 * A single scouting stat line: raw value plus formatting hint. No
 * percentile/cohort-relative fields — see formulas.ts doc comment on
 * `scoutingProfile` for why the legacy dashboard's percentile bars,
 * laning diffs, consistency and form rating are NOT ported here.
 */
export interface ScoutingStatLine {
  label: string;
  value: number;
  fmt: "pct" | "dec1" | "dec2" | "int";
}

/** Output of `scoutingProfile`: the subset of the legacy Scouting report computable from one PlayerAggRow. */
export interface ScoutingProfile {
  player: string;
  role: string;
  games: number;
  wins: number;
  losses: number;
  winrate_pct: number;
  core: ScoutingStatLine[];
  damage: ScoutingStatLine[];
  economy: ScoutingStatLine[];
  vision: ScoutingStatLine[];
}
