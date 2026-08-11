-- Season scoping for fixtures: keep every split's schedule (and results)
-- instead of deleting rows when a new split starts. Naming follows the
-- stats pipeline's season labels ("S5" — see riot_stats_ingest.py's
-- --season flag) so the schedule and stats pages speak the same season
-- vocabulary. The default keeps existing Split 5 rows and makes the column
-- optional for admin inserts during the current split.
alter table public.fixtures
  add column season text not null default 'S5';

drop index if exists fixtures_stage_idx;
create index fixtures_season_stage_idx on public.fixtures (season, stage, sort_order);
