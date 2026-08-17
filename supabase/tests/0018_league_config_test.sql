begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(32);

-- === tables exist ===========================================================
select has_table('public','league_settings','league_settings exists');
select has_table('public','league_teams','league_teams exists');
select has_table('public','riot_accounts','riot_accounts exists');
select has_table('public','roster_memberships','roster_memberships exists');

select has_column('public','league_settings','current_season','league_settings has current_season');
select has_column('public','league_settings','current_phase','league_settings has current_phase');
select has_column('public','league_teams','active','league_teams has active');
select has_column('public','riot_accounts','display_name','riot_accounts has display_name');

-- === league_settings: singleton row =========================================
-- league_settings pre-exists this task (20260810000001, the site's "featured
-- draft" toggle) and this migration extends it with current_season/current_phase
-- rather than creating a second table under the same name -- see the migration's
-- header comment. It must still hold exactly one row (id=1) once this migration
-- has run, same singleton contract as before.
select is((select count(*)::int from public.league_settings), 1, 'exactly one settings row');
select throws_ok($$ insert into public.league_settings (id, current_season, current_phase) values (2,'S6','Regular') $$,
  null, 'settings table refuses a second row');

-- === league_teams seed function =============================================
-- A bare `supabase db reset` leaves raw_stats EMPTY, so the seed cannot be a
-- one-shot migration-time INSERT -- it must be a re-runnable function the
-- migration calls once (harmless no-op against empty raw_stats) AND that
-- scripts/load-stats.ts calls again after loading. These assertions exercise
-- the function directly against synthetic raw_stats rows inserted inside this
-- transaction, so they hold whether or not real stats have been loaded first.
select has_function('public','sync_league_teams_from_stats','sync_league_teams_from_stats exists');
select ok(not has_function_privilege('anon','public.sync_league_teams_from_stats()','execute'),
  'anon cannot execute sync_league_teams_from_stats');
select ok(not has_function_privilege('authenticated','public.sync_league_teams_from_stats()','execute'),
  'authenticated cannot execute sync_league_teams_from_stats');

insert into public.raw_stats (match_id, team_name, summoner_name)
values ('ZZ_CONFIG_1', 'Zulu Zone', 'ZZTester1');
select public.sync_league_teams_from_stats();
select ok(
  exists(select 1 from public.league_teams where name = 'Zulu Zone' and abbreviation = 'ZZ'),
  'sync_league_teams_from_stats seeds a new team with an initials-derived abbreviation'
);

select lives_ok($$ select public.sync_league_teams_from_stats() $$, 'sync_league_teams_from_stats is safely re-runnable');
select is(
  (select count(*)::int from public.league_teams where name = 'Zulu Zone'),
  1,
  'a second call does not duplicate an already-seeded team'
);

-- Collision + stability: 'Zany Zebras' collides on the same 'ZZ' base but is
-- only added (and only synced) *after* 'Zulu Zone' already owns 'ZZ' -- and it
-- alphabetically sorts *before* 'Zulu Zone'. A naive "recompute row_number()
-- over the whole distinct set every call" seed would, on this exact ordering,
-- try to hand 'ZZ' to 'Zany Zebras' and error out on the abbreviation unique
-- constraint (ON CONFLICT (name) DO NOTHING does not catch a conflict on a
-- *different* unique key). The real function must instead leave the
-- already-seeded 'Zulu Zone' -> 'ZZ' untouched and de-dupe the newcomer to 'ZZ2'.
insert into public.raw_stats (match_id, team_name, summoner_name)
values ('ZZ_CONFIG_2', 'Zany Zebras', 'ZZTester2');
select public.sync_league_teams_from_stats();
select ok(
  (select abbreviation = 'ZZ2' from public.league_teams where name = 'Zany Zebras')
  and (select abbreviation = 'ZZ' from public.league_teams where name = 'Zulu Zone'),
  'a colliding abbreviation for a newly-added team gets a de-duplicated suffix without disturbing the existing team''s abbreviation'
);

select throws_ok($$
  insert into public.league_teams (name, abbreviation)
  select 'Dupe Team ' || id, abbreviation from public.league_teams limit 1
$$, null, 'abbreviation is unique');

-- === riot_accounts: case-insensitive unique key =============================
insert into public.riot_accounts (game_name, tag_line) values ('ZZTest', 'NA1');
select throws_ok($$
  insert into public.riot_accounts (game_name, tag_line) values ('zztest', 'na1')
$$, null, 'riot_accounts key is case-insensitively unique on (game_name, tag_line)');

-- === roster_memberships: one team per riot account per season, cascades =====
-- Season is the synthetic 'ZZ' (matching this file's own "Zulu Zone"/"Zany
-- Zebras" naming), not the real current season ('S5'): the cascade
-- assertion below scans the WHOLE table by season, not just this test's own
-- row, so a real 'S5' scan is not self-contained -- it broke locally the
-- first time real S5 roster_memberships existed in the database (seeded for
-- Task 5's /captain page browser verification, unrelated to this test). A
-- season no real seed data would ever use keeps this test correct
-- regardless of what else is in the database.
insert into public.roster_memberships (riot_account_id, season, league_team_id)
values (
  (select id from public.riot_accounts where game_name = 'ZZTest'),
  'ZZ',
  (select id from public.league_teams where name = 'Zulu Zone')
);
select throws_ok($$
  insert into public.roster_memberships (riot_account_id, season, league_team_id)
  values (
    (select id from public.riot_accounts where game_name = 'ZZTest'),
    'ZZ',
    (select id from public.league_teams where name = 'Zany Zebras')
  )
$$, null, 'roster_memberships allows only one team per riot account per season');

delete from public.riot_accounts where game_name = 'ZZTest';
select ok(
  not exists (select 1 from public.roster_memberships where season = 'ZZ'),
  'deleting a riot_account cascades to its roster_memberships'
);

-- === access: anon reads all four, writes none ===============================
select ok(has_table_privilege('anon','public.league_settings','select'), 'anon reads league_settings');
select ok(has_table_privilege('anon','public.league_teams','select'), 'anon reads league_teams');
select ok(has_table_privilege('anon','public.riot_accounts','select'), 'anon reads riot_accounts');
select ok(has_table_privilege('anon','public.roster_memberships','select'), 'anon reads roster_memberships');

select ok(not has_table_privilege('anon','public.league_settings','insert'), 'anon cannot insert league_settings');
select ok(not has_table_privilege('anon','public.league_teams','insert'), 'anon cannot insert league_teams');
select ok(not has_table_privilege('anon','public.riot_accounts','insert'), 'anon cannot insert riot_accounts');
select ok(not has_table_privilege('anon','public.roster_memberships','insert'), 'anon cannot insert roster_memberships');

select ok(has_table_privilege('authenticated','public.league_teams','insert'),
  'authenticated has the insert grant on league_teams (RLS gates to admins)');

-- === access: owner-only writes (RLS), behaviourally ==========================
-- league_teams became owner-only (task 5, 20260823000010): a plain admin
-- (is_admin without is_owner, as tests.admin_id() is set up here) can no
-- longer write freehand rows, same as a random member.
insert into public.profiles (id, display_name, is_admin) values (tests.admin_id(), 'Config Admin', true)
  on conflict (id) do nothing;
insert into public.profiles (id, display_name) values (tests.cap(1), 'Random Member')
  on conflict (id) do nothing;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_ok(
  $$ insert into public.league_teams (name, abbreviation) values ('Admin Test FC', 'ATF') $$,
  '42501',
  null,
  'a plain admin cannot insert league_teams'
);
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_ok(
  $$ insert into public.league_teams (name, abbreviation) values ('Rogue FC', 'RFC') $$,
  '42501',
  null,
  'non-admin authenticated user cannot insert league_teams'
);
reset role;

select * from finish();
rollback;
