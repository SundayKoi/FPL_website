-- ---------------------------------------------------------------------------
-- stats_records — add `tag` so record rows can be attributed to the exact
-- player (summoner_name + tag), not summoner_name alone.
--
-- Fix round: reviewer found 6 summoner_names shared by two distinct tags in
-- raw_stats (Aura#5950/Aura#RGB0, Fox#1Fox/Fox#NA215, FriskyMMO#Fluf/
-- FriskyMMO#NA1, Humble#6969/Humble#BTC, TMinusBOOM#BOOM/TMinusBOOM#NA1,
-- Winter#Ashtn/Winter#DOTA) — different real people. Without `tag`,
-- PlayerDetail's "records held" (filtered by summoner_name only) attributed
-- Aura#5950's S4 records to Aura#RGB0's detail page too, a real collision.
--
-- `create or replace view` — identical shape to the view in
-- 20260810100002_stats_views.sql, with `tag` threaded through every
-- per-category select and the final projection. Partition keys (season,
-- season_phase) are unchanged: rankings still run per season/phase across
-- ALL players regardless of tag, only the row's own identity gains `tag`.
--
-- `tag` is appended as the LAST column of every inner select (and the
-- final projection), not inserted after summoner_name where it would read
-- more naturally: Postgres's `create or replace view` only allows
-- *appending* columns, not inserting/renaming/reordering existing ones
-- (attempting to insert it earlier fails with "cannot change name of view
-- column ... to ..." because every column after the insertion point
-- shifts position). Confirmed via `npx supabase db reset` locally.
-- ---------------------------------------------------------------------------
create or replace view public.stats_records as
with ranked as (
  select 'Most Kills' as category, summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, kills::numeric as value,
         row_number() over (partition by season, season_phase order by kills desc) as rn,
         tag
  from public.raw_stats
  union all
  select 'Most Deaths', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, deaths::numeric,
         row_number() over (partition by season, season_phase order by deaths desc),
         tag
  from public.raw_stats
  union all
  select 'Most Assists', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, assists::numeric,
         row_number() over (partition by season, season_phase order by assists desc),
         tag
  from public.raw_stats
  union all
  select 'Highest KDA', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, kda::numeric,
         row_number() over (partition by season, season_phase order by kda desc),
         tag
  from public.raw_stats
  union all
  select 'Most Damage to Champions', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, total_damage_to_champions::numeric,
         row_number() over (partition by season, season_phase order by total_damage_to_champions desc),
         tag
  from public.raw_stats
  union all
  select 'Highest Damage per Minute', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, damage_per_min::numeric,
         row_number() over (partition by season, season_phase order by damage_per_min desc),
         tag
  from public.raw_stats
  union all
  select 'Most CS', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, cs::numeric,
         row_number() over (partition by season, season_phase order by cs desc),
         tag
  from public.raw_stats
  union all
  select 'Highest CS per Minute', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, cs_per_min::numeric,
         row_number() over (partition by season, season_phase order by cs_per_min desc),
         tag
  from public.raw_stats
  union all
  select 'Most Gold Earned', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, gold_earned::numeric,
         row_number() over (partition by season, season_phase order by gold_earned desc),
         tag
  from public.raw_stats
  union all
  select 'Highest Vision Score', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, vision_score::numeric,
         row_number() over (partition by season, season_phase order by vision_score desc),
         tag
  from public.raw_stats
  union all
  select 'Most Healing', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, total_healing::numeric,
         row_number() over (partition by season, season_phase order by total_healing desc),
         tag
  from public.raw_stats
  union all
  select 'Most Damage Taken', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, damage_taken::numeric,
         row_number() over (partition by season, season_phase order by damage_taken desc),
         tag
  from public.raw_stats
  union all
  select 'Most Solo Kills', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, solo_kills::numeric,
         row_number() over (partition by season, season_phase order by solo_kills desc),
         tag
  from public.raw_stats
  union all
  select 'Largest Killing Spree', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, largest_killing_spree::numeric,
         row_number() over (partition by season, season_phase order by largest_killing_spree desc),
         tag
  from public.raw_stats
  union all
  select 'Largest Multi Kill', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, largest_multi_kill::numeric,
         row_number() over (partition by season, season_phase order by largest_multi_kill desc),
         tag
  from public.raw_stats
  union all
  select 'Most Turret Plates Destroyed', summoner_name, champion, team_name, season, season_phase,
         match_id, game_date, turret_plates_destroyed::numeric,
         row_number() over (partition by season, season_phase order by turret_plates_destroyed desc),
         tag
  from public.raw_stats
)
select category, summoner_name, champion, team_name, season, season_phase, match_id, game_date, value, tag
from ranked
where rn <= 5;

-- create or replace view does not preserve grants in Postgres when the
-- underlying view definition is dropped and recreated in some toolchains,
-- so re-grant explicitly (same as the original migration) rather than
-- assume it survived the replace. Verified: still present after reset (see
-- fix-round report), but re-granting is a harmless no-op if it did survive.
grant select on public.stats_records to anon, authenticated;
