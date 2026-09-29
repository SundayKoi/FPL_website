begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Execute the actual historical SQL without its prerequisite table. Renaming
-- within this rolled-back transaction preserves dependencies and all data.
alter table public.season_end_releases rename to season_end_releases_replay_test;
\ir helpers/20260922052204_rebuild_season_end_draft_after_hash_fix.sql
select pass('historical draft repair succeeds before the releases table exists');
alter table public.season_end_releases_replay_test rename to season_end_releases;

-- With the schema present and no matching draft, it must remain a no-op.
create temporary table replay_releases_before as
  select * from public.season_end_releases;
\ir helpers/20260922052204_rebuild_season_end_draft_after_hash_fix.sql
select results_eq(
  'select to_jsonb(r) from public.season_end_releases r order by id',
  'select to_jsonb(r) from replay_releases_before r order by id',
  'historical repair preserves releases when there is no matching draft'
);

insert into public.season_end_releases
  (league, season, state, catalog_version, catalog_hash, rules_version, revision_digest, created_by)
values
  ('premier', 'S5', 'draft', 1, 'old', 'replay-test', 'old', 'replay-test'),
  ('premier', 'S5', 'draft', 2, 'old', 'replay-test', 'old', 'replay-test'),
  ('premier', 'S5', 'admin_test', 3, 'old', 'replay-test', 'old', 'replay-test'),
  ('premier', 'S5', 'public', 4, 'old', 'replay-test', 'old', 'replay-test'),
  ('premier', 'S4', 'draft', 1, 'old', 'replay-test', 'old', 'replay-test'),
  ('academy', 'A5', 'draft', 1, 'old', 'replay-test', 'old', 'replay-test');

insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
select r.id, d.kind || n, d.kind,
  jsonb_build_object('designId', d.kind || n, 'releaseId', r.id,
    'league', r.league, 'season', r.season), 20
from public.season_end_releases r
cross join (values ('season'), ('best_of'), ('accolade')) d(kind)
cross join generate_series(1, 2) n
where r.created_by = 'replay-test' and r.league = 'premier'
  and r.season = 'S5' and r.catalog_version = 2;

create temporary table replay_protected_before as
select * from public.season_end_releases
where not (league = 'premier' and season = 'S5' and catalog_version = 2);

\ir helpers/20260922052204_rebuild_season_end_draft_after_hash_fix.sql
select ok((select catalog_hash <> 'old' and revision_digest <> 'old'
  from public.season_end_releases where league = 'premier' and season = 'S5' and catalog_version = 2),
  'existing schema still repairs the latest matching draft');
select results_eq(
  $$select to_jsonb(r) from public.season_end_releases r
    where not (league = 'premier' and season = 'S5' and catalog_version = 2) order by id$$,
  'select to_jsonb(r) from replay_protected_before r order by id',
  'locked releases, older drafts, other leagues and seasons remain unchanged'
);
create temporary table replay_after_first as select * from public.season_end_releases;
\ir helpers/20260922052204_rebuild_season_end_draft_after_hash_fix.sql
select results_eq(
  'select to_jsonb(r) from public.season_end_releases r order by id',
  'select to_jsonb(r) from replay_after_first r order by id',
  'repeating the repair leaves the repaired revision unchanged'
);
select is((select count(*)::int from public.season_end_release_events
  where actor = 'replay-test' and event = 'catalog_replaced'), 1,
  'repeating the repair does not replace the catalog again');

select * from finish();
rollback;
