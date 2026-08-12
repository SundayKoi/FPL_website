-- Season scoping for fixtures: keep every split's schedule (and results)
-- instead of deleting rows when a new split starts. Naming follows the
-- stats pipeline's season labels ("S5" — see riot_stats_ingest.py's
-- --season flag) so the schedule and stats pages speak the same season
-- vocabulary. The default keeps existing Split 5 rows and makes the column
-- optional for admin inserts during the current split.
-- Guarded because this version number sorts BEFORE 20260811000003_fixtures.sql,
-- which creates the table: on databases where both were already applied (the
-- files were renumbered after the fact) this still runs exactly as before, but
-- on a fresh `supabase db reset` it no-ops and 20260811000003 creates the
-- table with `season` already present.
do $$
begin
  if to_regclass('public.fixtures') is not null then
    alter table public.fixtures
      add column if not exists season text not null default 'S5';

    drop index if exists fixtures_stage_idx;
    create index if not exists fixtures_season_stage_idx
      on public.fixtures (season, stage, sort_order);
  end if;
end $$;
