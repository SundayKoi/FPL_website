-- ---------------------------------------------------------------------------
-- Final review fix wave, item 2: ingested rows can carry a NULL/empty
-- team_name (the Riot-API ingester has no way to derive an FPL team name
-- from match data alone — see riot_stats_ingest.py's extract_stats(),
-- "team_name": "" -- FPL Team -- not derivable from Riot data). Three tabs
-- read team_name and degrade when it's null/blank:
--   - stats_team_agg (TeamsTab): a null/blank team_name would form its own
--     bogus "team" group, standings-polluting.
--   - stats_game_log (TimelineTab): blue_team/red_team/winner_team can
--     render as blank text.
--
-- This is a minimal responsible guard, NOT a real team-name backfill (that
-- needs the league's roster source to map summoner -> FPL team, tracked
-- separately -- see README's Stats ingestion section and
-- riot_stats_ingest.py's new --team-map flag). Two changes:
--   (a) stats_team_agg: exclude null/blank-team_name rows from its base
--       data entirely, so they can never form a bogus team-standings row.
--       Player-level and champion-level views are untouched -- a raw_stats
--       row with an unset team_name is still a completely valid game for
--       an individual player's or champion's stats, only the *team*
--       rollup is team_name-dependent.
--   (b) stats_game_log: coalesce null/blank team_name to the literal
--       'Unknown' at display time, inside the same aggregation that already
--       picks blue_team/red_team/winner_team by team_side -- so the
--       Timeline tab shows "Unknown" instead of a blank cell/team name,
--       rather than silently excluding a real match from the log.
--
-- `create or replace view` — identical column list/order to the prior
-- definition (20260810100002_stats_views.sql for stats_team_agg,
-- unchanged since; 20260810100002 for stats_game_log too) — only the
-- filtering/coalescing described above changes.
-- ---------------------------------------------------------------------------

create or replace view public.stats_team_agg as
with side_counts as (
  select
    match_id, season, season_phase, team_name, team_side,
    count(*) as n_players,
    bool_or(win) as side_win,
    max(game_duration_min) as game_duration_min,
    max(team_dragons) as team_dragons,
    max(team_barons) as team_barons,
    bool_or(team_first_blood) as team_first_blood,
    bool_or(team_first_tower) as team_first_tower,
    sum(kills) as team_kills
  from public.raw_stats
  where team_name is not null and team_name <> ''
  group by match_id, season, season_phase, team_name, team_side
),
ranked as (
  select
    sc.*,
    row_number() over (
      partition by sc.match_id, sc.team_name
      order by sc.n_players desc
    ) as side_rank,
    max(sc.n_players) over (partition by sc.match_id, sc.team_name) as max_n_players,
    count(*) over (
      partition by sc.match_id, sc.team_name, sc.n_players
    ) as n_sides_with_this_count
  from side_counts sc
),
-- the majority side: the single side with strictly more of the team's
-- players than every other side that match; an exact tie at the max
-- (n_sides_with_this_count > 1 for the max n_players) excludes the match.
majority as (
  select *
  from ranked
  where side_rank = 1
    and not (n_players = max_n_players and n_sides_with_this_count > 1)
)
select
  team_name,
  season,
  season_phase,
  count(*) as games,
  count(*) filter (where side_win) as wins,
  count(*) filter (where not side_win) as losses,
  round(100.0 * count(*) filter (where side_win) / count(*), 1) as winrate_pct,
  round(avg(game_duration_min)::numeric, 2) as avg_duration_min,
  round(100.0 * count(*) filter (where team_dragons > 0) / count(*), 1) as dragon_rate,
  round(100.0 * count(*) filter (where team_barons > 0) / count(*), 1) as baron_rate,
  round(100.0 * count(*) filter (where team_first_blood) / count(*), 1) as first_blood_rate,
  round(100.0 * count(*) filter (where team_first_tower) / count(*), 1) as first_tower_rate,
  round(avg(team_kills)::numeric, 2) as avg_team_kills
from majority
group by team_name, season, season_phase;

grant select on public.stats_team_agg to anon, authenticated;

create or replace view public.stats_game_log as
select
  match_id,
  max(game_date) as game_date,
  max(season) as season,
  max(season_phase) as season_phase,
  max(game_duration_min) as duration_min,
  max(coalesce(nullif(team_name, ''), 'Unknown')) filter (where team_side = 'Blue') as blue_team,
  max(coalesce(nullif(team_name, ''), 'Unknown')) filter (where team_side = 'Red') as red_team,
  case
    when bool_or(win) filter (where team_side = 'Blue')
      then max(coalesce(nullif(team_name, ''), 'Unknown')) filter (where team_side = 'Blue')
    else max(coalesce(nullif(team_name, ''), 'Unknown')) filter (where team_side = 'Red')
  end as winner_team,
  sum(kills) as total_kills
from public.raw_stats
group by match_id;

grant select on public.stats_game_log to anon, authenticated;
