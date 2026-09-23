-- Expeditions, rules 6: the title a card was minted with becomes its edge
-- on the road.
--
-- All of it lives in the app (src/lib/expeditions/archetypes.ts): the
-- table of 57 edges, one edge per kind counting in a squad, the tent the
-- base camp will pitch, and the checkpoints an edge lets a squad see
-- ahead. The database learns two things.
--
--   1. THE RULEBOOK VERSION moves to 6 (ARCHETYPE_RULES). A run already in
--      the field left without edges: its journal is half written and its
--      rolls are drawn in a fixed order, so an edge that started firing
--      under it would rewrite lines the page already showed. Only a run
--      launched from here on is stamped 6, and only a run stamped 6 walks
--      with edges.
--
--   2. THE APP CAN ASK WHICH RULEBOOK A LAUNCH WILL GET. The Speedrunner's
--      shorter clock is the one edge that acts at launch, and the app
--      passes p_hours before the row exists, so it cannot read `rules` off
--      the run. expedition_rules_version() reads the column default rather
--      than restating a number, so the migration that next moves the
--      default moves the answer with it. An environment without this
--      migration has no function, and fetchRulesVersion reads that as 1:
--      the clock is never cut ahead of the rulebook that pays for it.
--
-- resolve_expedition is not redeclared. Every edge lands inside the loot
-- multiplier cap, the fragment cap, a boolean comp, or the Harvest
-- merchant price the payout ceiling (19050) already carries.

alter table public.expedition_runs alter column rules set default 6;

create or replace function public.expedition_rules_version() returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((regexp_match(column_default, '\d+'))[1]::int, 1)
  from information_schema.columns
  where table_schema = 'public' and table_name = 'expedition_runs' and column_name = 'rules'
$$;

revoke all on function public.expedition_rules_version() from public, anon, authenticated;
grant execute on function public.expedition_rules_version() to service_role;
