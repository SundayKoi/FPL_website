-- ---------------------------------------------------------------------------
-- stats_player_agg — laning measured against the person you actually laned
-- against, at 10, 15 and 20 minutes.
--
-- Why: "CS @ 10 = 82" is unreadable without knowing the role and the game.
-- A jungler and a mid laner are not on the same scale, and a 40-minute
-- stall and a 22-minute stomp are not either. The diff is the number
-- players already think in — "I was up 14 CS at 15" — and it is
-- self-normalising: the opponent sat in the same game, in the same role,
-- under the same patch.
--
-- No re-ingest is needed for any of this. scripts/riot_stats_ingest.py
-- writes a row for ALL TEN participants of every match (the loop at
-- `for p in participants:`), and TIMELINE_INTERVALS is already
-- [5, 10, 15, 20] — so cs_at_15/gold_at_15/xp_at_15 and the _at_20 columns
-- are populated on rows already in the table. The lane opponent is simply
-- the other row with the same match_id, the same role, and the other
-- team_side.
--
-- The fan-out trap: role comes from Riot's teamPosition and is not
-- guaranteed unique per team per game (an autofilled or unresolved game can
-- leave two rows sharing a role on one side). A plain join on
-- match_id + role would then return two opponent rows for one player row
-- and DOUBLE that game inside every existing aggregate on this view —
-- games, wins, every average. `distinct on (r.id)` makes the lane CTE at
-- most one row per raw_stats row, so the left join below cannot multiply
-- anything. Every pre-existing column in this view is byte-for-byte what
-- 20260810100004 produced.
--
-- avg() ignores nulls, so a game that ended at 17 minutes contributes to
-- the @10 and @15 diffs and simply isn't in the @20 average — rather than
-- dragging it toward zero. lane_games_10/15/20 say how many games each
-- average was actually computed over, which is also what makes the
-- cross-season merge in src/lib/stats/formulas.ts exact: it weights each
-- season's diff by the games that HAD a diff, not by the season's games.
--
-- The at-10 averages stay. They are the input to card ratings
-- (src/lib/cards/build.ts percentiles) and removing them would restat every
-- card in the league; this migration only adds. `create or replace view`
-- therefore appends the twelve new columns at the end and leaves the
-- existing SELECT list untouched.
-- ---------------------------------------------------------------------------
create or replace view public.stats_player_agg as
with role_counts as (
  select
    summoner_name, tag, season, season_phase, role,
    count(*) as role_games,
    row_number() over (
      partition by summoner_name, tag, season, season_phase
      order by count(*) desc, role
    ) as rn
  from public.raw_stats
  group by summoner_name, tag, season, season_phase, role
),
role_mode as (
  select summoner_name, tag, season, season_phase, role as role_mode
  from role_counts
  where rn = 1
),
lane as (
  -- One row per raw_stats row, carrying that game's diff against the lane
  -- opponent. distinct on (r.id) is load-bearing: see the header.
  select distinct on (r.id)
    r.id,
    r.cs_at_10   - o.cs_at_10   as cs_diff_10,
    r.gold_at_10 - o.gold_at_10 as gold_diff_10,
    r.xp_at_10   - o.xp_at_10   as xp_diff_10,
    r.cs_at_15   - o.cs_at_15   as cs_diff_15,
    r.gold_at_15 - o.gold_at_15 as gold_diff_15,
    r.xp_at_15   - o.xp_at_15   as xp_diff_15,
    r.cs_at_20   - o.cs_at_20   as cs_diff_20,
    r.gold_at_20 - o.gold_at_20 as gold_diff_20,
    r.xp_at_20   - o.xp_at_20   as xp_diff_20
  from public.raw_stats r
  join public.raw_stats o
    on o.match_id = r.match_id
   and o.role = r.role
   and o.team_side <> r.team_side
   and o.id <> r.id
  where r.match_id is not null
    and coalesce(r.role, '') <> ''
    and r.team_side in ('Blue', 'Red')
    and o.team_side in ('Blue', 'Red')
  order by r.id, o.id
)
select
  r.summoner_name,
  r.tag,
  r.season,
  r.season_phase,
  rm.role_mode,
  count(*) as games,
  count(*) filter (where r.win) as wins,
  round(100.0 * count(*) filter (where r.win) / count(*), 1) as winrate_pct,
  round(avg(r.kills)::numeric, 2) as avg_kills,
  round(avg(r.deaths)::numeric, 2) as avg_deaths,
  round(avg(r.assists)::numeric, 2) as avg_assists,
  round((sum(r.kills) + sum(r.assists))::numeric / greatest(sum(r.deaths), 1), 2) as kda,
  round(avg(r.kill_participation_pct)::numeric, 2) as avg_kp_pct,
  round(sum(r.cs)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_cs_per_min,
  round(sum(r.gold_earned)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_gold_per_min,
  round(sum(r.total_damage_to_champions)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_dmg_per_min,
  round(avg(r.damage_share_pct)::numeric, 2) as avg_dmg_share_pct,
  round(sum(r.vision_score)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_vision_per_min,
  round(avg(r.solo_kills)::numeric, 2) as avg_solo_kills,
  sum(r.solo_kills) as total_solo_kills,
  sum(r.turret_plates_destroyed) as total_plates,
  sum(r.double_kills) as total_doubles,
  sum(r.triple_kills) as total_triples,
  sum(r.quadra_kills) as total_quadras,
  sum(r.penta_kills) as total_pentas,
  round(avg(r.cs_at_10)::numeric, 2) as avg_cs_at_10,
  round(avg(r.gold_at_10)::numeric, 2) as avg_gold_at_10,
  round(avg(r.xp_at_10)::numeric, 2) as avg_xp_at_10,
  round(avg(r.damage_taken_per_min)::numeric, 2) as avg_dmg_taken_per_min,
  round(avg(r.kda_challenges)::numeric, 2) as avg_kda_challenges,
  count(*) filter (where r.first_blood_kill or r.first_blood_assist) as first_blood_involvements,
  round(avg(r.game_duration_min)::numeric, 2) as avg_game_duration,
  -- ── new: the lane, as a diff ──────────────────────────────────────────
  round(avg(l.cs_diff_10)::numeric, 2) as avg_cs_diff_10,
  round(avg(l.gold_diff_10)::numeric, 2) as avg_gold_diff_10,
  round(avg(l.xp_diff_10)::numeric, 2) as avg_xp_diff_10,
  round(avg(l.cs_diff_15)::numeric, 2) as avg_cs_diff_15,
  round(avg(l.gold_diff_15)::numeric, 2) as avg_gold_diff_15,
  round(avg(l.xp_diff_15)::numeric, 2) as avg_xp_diff_15,
  round(avg(l.cs_diff_20)::numeric, 2) as avg_cs_diff_20,
  round(avg(l.gold_diff_20)::numeric, 2) as avg_gold_diff_20,
  round(avg(l.xp_diff_20)::numeric, 2) as avg_xp_diff_20,
  -- How many games each of those three columns is an average OF. A game
  -- that ended before the mark, or one whose opposite number is missing
  -- from the table, is not counted as a zero — it is not counted at all.
  count(*) filter (where l.gold_diff_10 is not null) as lane_games_10,
  count(*) filter (where l.gold_diff_15 is not null) as lane_games_15,
  count(*) filter (where l.gold_diff_20 is not null) as lane_games_20
from public.raw_stats r
join role_mode rm
  on rm.summoner_name = r.summoner_name
 and rm.tag = r.tag
 and rm.season = r.season
 and rm.season_phase = r.season_phase
left join lane l on l.id = r.id
group by r.summoner_name, r.tag, r.season, r.season_phase, rm.role_mode;

grant select on public.stats_player_agg to anon, authenticated;

-- The lane CTE is a self-join on (match_id, role); without this the planner
-- reads raw_stats twice in full for every query that touches the view.
create index if not exists raw_stats_match_role_side_idx
  on public.raw_stats (match_id, role, team_side);
