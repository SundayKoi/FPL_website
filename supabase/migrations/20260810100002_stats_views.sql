-- Stats aggregate views over raw_stats (Task 2 of the stats system).
--
-- Design notes:
-- * Views group by (season, season_phase) so the client filters cheaply by
--   picking rows for a given season, or by aggregating rows across seasons
--   client-side. "All seasons" is NOT a separate SQL variant: there is no
--   extra view for it. The client queries these views without a season
--   filter (or filters phase only) and combines the per-season rows itself.
--   Simple counting columns (games, wins, picks, bans, etc.) can be summed
--   directly; rate/average columns (winrate_pct, avg_*, kda, presence_pct)
--   must NOT be averaged across season rows naively — the client recomputes
--   games-weighted means from the underlying per-season counts/sums in
--   `src/lib/stats/formulas.ts` (`combineSeasonRows`, added in a later task).
-- * `round(...::numeric, 2)` for averages; `round(100.0*wins/games, 1)` for
--   percentages, matching the brief exactly.
-- * KDA is computed from summed kills/deaths/assists across a group (not as
--   an average of each game's own kda column), matching the legacy
--   dashboard's formula: (sum(kills)+sum(assists)) / greatest(sum(deaths),1).
--
-- Grants: views do not inherit table grants in Postgres, so each view gets
-- its own explicit `grant select ... to anon, authenticated;`.

-- ---------------------------------------------------------------------------
-- stats_player_agg — per summoner + season + phase (+ most-played role).
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
  round(avg(r.cs_per_min)::numeric, 2) as avg_cs_per_min,
  round(avg(r.gold_per_min)::numeric, 2) as avg_gold_per_min,
  round(avg(r.damage_per_min)::numeric, 2) as avg_dmg_per_min,
  round(avg(r.damage_share_pct)::numeric, 2) as avg_dmg_share_pct,
  round(avg(r.vision_score_per_min)::numeric, 2) as avg_vision_per_min,
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
  round(avg(r.game_duration_min)::numeric, 2) as avg_game_duration
from public.raw_stats r
join role_mode rm
  on rm.summoner_name = r.summoner_name
 and rm.tag = r.tag
 and rm.season = r.season
 and rm.season_phase = r.season_phase
group by r.summoner_name, r.tag, r.season, r.season_phase, rm.role_mode;

grant select on public.stats_player_agg to anon, authenticated;

-- ---------------------------------------------------------------------------
-- stats_team_agg — per FPL team + season + phase.
-- ---------------------------------------------------------------------------
create or replace view public.stats_team_agg as
with games as (
  -- one row per team per game (dedupe the per-player rows down to one team-game row)
  select distinct
    match_id, season, season_phase, team_name,
    game_duration_min, win,
    team_dragons, team_first_dragon, team_barons, team_first_blood, team_first_tower,
    (select sum(rs2.kills) from public.raw_stats rs2
      where rs2.match_id = rs.match_id and rs2.team_name = rs.team_name) as team_kills
  from public.raw_stats rs
)
select
  team_name,
  season,
  season_phase,
  count(*) as games,
  count(*) filter (where win) as wins,
  count(*) filter (where not win) as losses,
  round(100.0 * count(*) filter (where win) / count(*), 1) as winrate_pct,
  round(avg(game_duration_min)::numeric, 2) as avg_duration_min,
  round(100.0 * count(*) filter (where team_dragons > 0) / count(*), 1) as dragon_rate,
  round(100.0 * count(*) filter (where team_barons > 0) / count(*), 1) as baron_rate,
  round(100.0 * count(*) filter (where team_first_blood) / count(*), 1) as first_blood_rate,
  round(100.0 * count(*) filter (where team_first_tower) / count(*), 1) as first_tower_rate,
  round(avg(team_kills)::numeric, 2) as avg_team_kills
from games
group by team_name, season, season_phase;

grant select on public.stats_team_agg to anon, authenticated;

-- ---------------------------------------------------------------------------
-- stats_champion_agg — per champion + season + phase (picks, wins, bans, presence).
-- ---------------------------------------------------------------------------
create or replace view public.stats_champion_agg as
with picks as (
  select
    champion, season, season_phase,
    count(*) as picks,
    count(*) filter (where win) as wins,
    sum(kills) as sum_kills,
    sum(assists) as sum_assists,
    sum(deaths) as sum_deaths
  from public.raw_stats
  group by champion, season, season_phase
),
bans_deduped as (
  -- Bans repeat across every player-row of a team (same 5 ban slots on each
  -- row for that side), so dedupe to one row per (match_id, ban, season,
  -- season_phase) before counting -- this also naturally handles a champion
  -- being banned by both teams in the same game as 2 distinct ban events,
  -- one per team side, while collapsing the same team's repeated rows to 1.
  select distinct match_id, season, season_phase, team_side, ban
  from public.raw_stats
  cross join lateral (values (ban_1), (ban_2), (ban_3), (ban_4), (ban_5)) as b(ban)
  where ban is not null and ban <> ''
),
bans as (
  select ban as champion, season, season_phase, count(*) as bans
  from bans_deduped
  group by ban, season, season_phase
),
scope as (
  select season, season_phase, count(distinct match_id) as games_in_scope
  from public.raw_stats
  group by season, season_phase
)
select
  coalesce(p.champion, b.champion) as champion,
  coalesce(p.season, b.season) as season,
  coalesce(p.season_phase, b.season_phase) as season_phase,
  coalesce(p.picks, 0) as picks,
  coalesce(p.wins, 0) as wins,
  case when coalesce(p.picks, 0) = 0 then 0.0
       else round(100.0 * p.wins / p.picks, 1) end as winrate_pct,
  case when coalesce(p.picks, 0) = 0 then 0.0
       else round((p.sum_kills + p.sum_assists)::numeric / greatest(p.sum_deaths, 1), 2) end as avg_kda,
  coalesce(b.bans, 0) as bans,
  s.games_in_scope,
  round(
    100.0 * (coalesce(p.picks, 0) + coalesce(b.bans, 0))
      / nullif(s.games_in_scope, 0),
    1
  ) as presence_pct
from picks p
full outer join bans b
  on b.champion = p.champion and b.season = p.season and b.season_phase = p.season_phase
join scope s
  on s.season = coalesce(p.season, b.season) and s.season_phase = coalesce(p.season_phase, b.season_phase);

grant select on public.stats_champion_agg to anon, authenticated;

-- ---------------------------------------------------------------------------
-- stats_records — top-5 single-game bests per category, per season + phase.
-- ---------------------------------------------------------------------------
create or replace view public.stats_records as
with ranked as (
  select 'Most Kills' as category, summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, kills::numeric as value,
         row_number() over (partition by season, season_phase order by kills desc) as rn
  from public.raw_stats
  union all
  select 'Most Deaths', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, deaths::numeric,
         row_number() over (partition by season, season_phase order by deaths desc)
  from public.raw_stats
  union all
  select 'Most Assists', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, assists::numeric,
         row_number() over (partition by season, season_phase order by assists desc)
  from public.raw_stats
  union all
  select 'Highest KDA', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, kda::numeric,
         row_number() over (partition by season, season_phase order by kda desc)
  from public.raw_stats
  union all
  select 'Most Damage to Champions', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, total_damage_to_champions::numeric,
         row_number() over (partition by season, season_phase order by total_damage_to_champions desc)
  from public.raw_stats
  union all
  select 'Highest Damage per Minute', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, damage_per_min::numeric,
         row_number() over (partition by season, season_phase order by damage_per_min desc)
  from public.raw_stats
  union all
  select 'Most CS', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, cs::numeric,
         row_number() over (partition by season, season_phase order by cs desc)
  from public.raw_stats
  union all
  select 'Highest CS per Minute', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, cs_per_min::numeric,
         row_number() over (partition by season, season_phase order by cs_per_min desc)
  from public.raw_stats
  union all
  select 'Most Gold Earned', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, gold_earned::numeric,
         row_number() over (partition by season, season_phase order by gold_earned desc)
  from public.raw_stats
  union all
  select 'Highest Vision Score', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, vision_score::numeric,
         row_number() over (partition by season, season_phase order by vision_score desc)
  from public.raw_stats
  union all
  select 'Most Healing', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, total_healing::numeric,
         row_number() over (partition by season, season_phase order by total_healing desc)
  from public.raw_stats
  union all
  select 'Most Damage Taken', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, damage_taken::numeric,
         row_number() over (partition by season, season_phase order by damage_taken desc)
  from public.raw_stats
  union all
  select 'Most Solo Kills', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, solo_kills::numeric,
         row_number() over (partition by season, season_phase order by solo_kills desc)
  from public.raw_stats
  union all
  select 'Largest Killing Spree', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, largest_killing_spree::numeric,
         row_number() over (partition by season, season_phase order by largest_killing_spree desc)
  from public.raw_stats
  union all
  select 'Largest Multi Kill', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, largest_multi_kill::numeric,
         row_number() over (partition by season, season_phase order by largest_multi_kill desc)
  from public.raw_stats
  union all
  select 'Most Turret Plates Destroyed', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, turret_plates_destroyed::numeric,
         row_number() over (partition by season, season_phase order by turret_plates_destroyed desc)
  from public.raw_stats
)
select category, summoner_name, champion, team_name, season, season_phase, match_id, game_date, value
from ranked
where rn <= 5;

grant select on public.stats_records to anon, authenticated;

-- ---------------------------------------------------------------------------
-- stats_game_log — one row per match (feeds the Timeline tab).
-- ---------------------------------------------------------------------------
create or replace view public.stats_game_log as
select
  match_id,
  max(game_date) as game_date,
  max(season) as season,
  max(season_phase) as season_phase,
  max(game_duration_min) as duration_min,
  max(team_name) filter (where team_side = 'Blue') as blue_team,
  max(team_name) filter (where team_side = 'Red') as red_team,
  case
    when bool_or(win) filter (where team_side = 'Blue') then max(team_name) filter (where team_side = 'Blue')
    else max(team_name) filter (where team_side = 'Red')
  end as winner_team,
  sum(kills) as total_kills
from public.raw_stats
group by match_id;

grant select on public.stats_game_log to anon, authenticated;
