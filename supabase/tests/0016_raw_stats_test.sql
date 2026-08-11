begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_table('public','raw_stats','raw_stats exists');
select ok(has_table_privilege('anon','public.raw_stats','select'), 'anon reads raw_stats');
select ok(not has_table_privilege('anon','public.raw_stats','insert'), 'anon cannot insert raw_stats');
select ok(not has_table_privilege('authenticated','public.raw_stats','insert'), 'authenticated cannot insert raw_stats');

-- RLS is on
select ok((select relrowsecurity from pg_class where oid='public.raw_stats'::regclass), 'raw_stats RLS enabled');

-- unique index on (match_id, summoner_name) exists (the ingester's dedupe key)
select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'raw_stats'
      and indexdef like '%UNIQUE%'
      and indexdef like '%match_id%'
      and indexdef like '%summoner_name%'
  ),
  'unique index on (match_id, summoner_name) exists'
);

select has_column('public','raw_stats','season','season column exists');

select * from finish();
rollback;
