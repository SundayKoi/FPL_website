-- ---------------------------------------------------------------------------
-- Match-reporting Task 4: captain-page tables (league_team_captains,
-- match_codes, announcements) + sync_league_team_captains() + is_captain_of().
-- See docs/superpowers/specs/2026-08-11-captains-page-design.md ("New tables"
-- + "Access model") and .superpowers/sdd/2026-08-11-match-reporting-auto-
-- ingest/task-4-brief.md.
--
-- match_codes is the only genuinely private table in the app: NO anon grant
-- at all, and its select policy must admit ONLY admins and the two captains
-- of that code's teams. This is the security core of the feature.
--
-- Per the CRITICAL TESTING RULE learned in Task 2: denial assertions below
-- never use `set local row_security = off` (that makes Postgres deny
-- unconditionally, making the assertion pass even for a broken policy). They
-- use tests.acting_as(...) + set local role authenticated and assert the
-- real policy outcome.
-- ---------------------------------------------------------------------------
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(23);

insert into public.profiles (id, display_name, is_admin) values (tests.admin_id(), 'Captain Page Admin', true)
  on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Captain One'),
  (tests.cap(2), 'Captain Two')
  on conflict (id) do nothing;

-- Three league_teams (synthetic names -- see league_config test's 'Zulu
-- Zone' precedent -- so they cannot collide with real seeded teams).
insert into public.league_teams (id, name, abbreviation) values
  ('50000000-0000-0000-0000-000000000001', 'Task4 Alpha FC', 'T4A'),
  ('50000000-0000-0000-0000-000000000002', 'Task4 Bravo FC', 'T4B'),
  ('50000000-0000-0000-0000-000000000003', 'Task4 Gamma FC', 'T4G');

-- tests.cap(1) captains Alpha; tests.cap(2) captains Gamma -- a team
-- unrelated to the Alpha-vs-Bravo match_codes row below -- both for 'ZZ'.
insert into public.league_team_captains (league_team_id, season, profile_id) values
  ('50000000-0000-0000-0000-000000000001', 'ZZ', tests.cap(1)),
  ('50000000-0000-0000-0000-000000000003', 'ZZ', tests.cap(2));

-- A match_codes row for an Alpha-vs-Bravo fixture in season 'ZZ'.
insert into public.match_codes (id, season, team_a_id, team_b_id, game_number, code) values
  ('50000000-0000-0000-0000-000000000010', 'ZZ',
   '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
   1, 'NA1234');

-- A real fixtures row for replace_match_codes below (its match_codes rows
-- need a non-null fixture_id -- match_codes_fixture_game_key is a partial
-- unique index on (fixture_id, game_number) where fixture_id is not null).
insert into public.fixtures (id, stage, team_a, team_b, best_of, season) values
  ('50000000-0000-0000-0000-000000000020', 'week_1', 'Task4 Alpha FC', 'Task4 Bravo FC', 3, 'ZZ');

-- === tables exist ============================================================
select has_table('public', 'league_team_captains', 'league_team_captains exists');
select has_table('public', 'match_codes', 'match_codes exists');
select has_table('public', 'announcements', 'announcements exists');

-- === functions exist =========================================================
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in
     ('sync_league_team_captains', 'is_captain_of', 'replace_match_codes', 'sync_league_teams_from_draft')),
  4,
  'sync_league_team_captains, is_captain_of, replace_match_codes, and sync_league_teams_from_draft all exist'
);

-- === match_codes: no anon grant at all (defence in depth beneath RLS) =======
select ok(not has_table_privilege('anon', 'public.match_codes', 'select'), 'anon cannot select match_codes (no grant at all)');

-- === match_codes: select is admin + the two captains of that fixture, only ==
-- Captain of team_a (Alpha) can select the code.
select tests.acting_as(tests.cap(1));
set local role authenticated;
select ok(
  exists(select 1 from public.match_codes where id = '50000000-0000-0000-0000-000000000010'),
  'captain of team_a can select the match code'
);
reset role;

-- Captain of an unrelated team (Gamma, not Alpha or Bravo) cannot.
select tests.acting_as(tests.cap(2));
set local role authenticated;
select ok(
  not exists(select 1 from public.match_codes where id = '50000000-0000-0000-0000-000000000010'),
  'captain of an unrelated team cannot select the match code'
);
reset role;

-- Admin can.
select tests.acting_as(tests.admin_id());
set local role authenticated;
select ok(
  exists(select 1 from public.match_codes where id = '50000000-0000-0000-0000-000000000010'),
  'admin can select the match code'
);
reset role;

-- === match_codes: writes are admin-only, even for a fixture's own captain ===
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_ok($$
  insert into public.match_codes (season, team_a_id, team_b_id, game_number, code)
  values ('ZZ', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 2, 'NA5678')
$$, '42501', null, 'captain cannot insert match_codes');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$
  insert into public.match_codes (season, team_a_id, team_b_id, game_number, code)
  values ('ZZ', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 2, 'NA5678')
$$, 'admin can insert match_codes');
reset role;

-- === is_captain_of: season-scoped ============================================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select ok(
  not public.is_captain_of('50000000-0000-0000-0000-000000000001', 'WRONG_SEASON'),
  'is_captain_of returns false for the wrong season'
);
reset role;

-- === sync_league_teams_from_draft: seeds league_teams from the featured =====
-- draft's own teams, independent of raw_stats history (the rollout gap this
-- migration fixes -- most draft team names never appear in raw_stats yet).
-- A synthetic one-off draft (not tests.fixture()'s, which is used below and
-- has its own teams) with two teams: 'Task9 Delta FC' absent from
-- league_teams, and a case/whitespace variant of the already-seeded 'Task4
-- Alpha FC' (inserted above) -- so the "not duplicated" assertion is real.
insert into public.drafts (id, name) values ('50000000-0000-0000-0000-000000000090', 'Task9 Draft');
insert into public.teams (id, draft_id, name, abbreviation, nomination_position) values
  ('50000000-0000-0000-0000-000000000091', '50000000-0000-0000-0000-000000000090', 'Task9 Delta FC', 'T9D', 1),
  ('50000000-0000-0000-0000-000000000092', '50000000-0000-0000-0000-000000000090', '  task4 alpha fc  ', 'T9A', 2);
update public.league_settings set featured_draft_id = '50000000-0000-0000-0000-000000000090' where id = 1;

-- Non-admin caller cannot sync teams from the draft.
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$
  select public.sync_league_teams_from_draft()
$$, 'NOT_ADMIN%', 'a non-admin caller cannot call sync_league_teams_from_draft');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(
  public.sync_league_teams_from_draft(), 1,
  'sync_league_teams_from_draft inserts only the genuinely new team (the case/whitespace variant of an existing team is skipped) and returns 1'
);
select is(
  (select count(*)::int from public.league_teams where lower(trim(name)) = lower(trim('Task9 Delta FC'))),
  1,
  'Task9 Delta FC now exists exactly once in league_teams'
);
select is(
  (select count(*)::int from public.league_teams where lower(trim(name)) = lower(trim('Task4 Alpha FC'))),
  1,
  'the case/whitespace variant of an existing team was NOT duplicated in league_teams'
);
select is(
  public.sync_league_teams_from_draft(), 0,
  'sync_league_teams_from_draft is re-runnable: second call inserts nothing new'
);
reset role;

-- === sync_league_team_captains: matches by name, re-runnable ================
-- tests.fixture() builds a draft with teams 'Team A'..'Team D' captained by
-- tests.cap(1..4). Rename 'Team C' (captained by tests.cap(3), otherwise
-- uninvolved above) so it case/whitespace-insensitively matches Bravo, then
-- feature that draft, so the first sync call has a real row to insert --
-- making the second call's "0" a genuine idempotency proof rather than a
-- vacuous one.
select tests.fixture();
update public.teams set name = '  task4 bravo fc  '
  where captain_profile_id = tests.cap(3)
    and draft_id = (select id from public.drafts where name = 'Test Draft');
update public.league_settings set featured_draft_id = (select id from public.drafts where name = 'Test Draft')
  where id = 1;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select public.sync_league_team_captains('ZZ');
select is(public.sync_league_team_captains('ZZ'), 0, 'sync_league_team_captains is re-runnable: second call inserts nothing new');
reset role;

-- === replace_match_codes: atomic delete+insert, admin-only ==================
-- Fix round (Task 6): AdminCodeEditor previously did delete-then-insert as
-- two separate client round-trips, which could leave a fixture with zero
-- codes if the insert failed after the delete succeeded. Folded into one
-- SECURITY DEFINER RPC -- see supabase/migrations/20260811100005_replace_
-- match_codes.sql.
select tests.acting_as(tests.admin_id());
select is(
  public.replace_match_codes(
    '50000000-0000-0000-0000-000000000020', 'ZZ',
    '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
    array['CODE1', 'CODE2']::text[]
  ),
  2,
  'replace_match_codes inserts 2 codes and returns the inserted count'
);
select is(
  (select count(*)::int from public.match_codes where fixture_id = '50000000-0000-0000-0000-000000000020'),
  2,
  'exactly 2 match_codes rows exist for the fixture after the first replace'
);
select is(
  public.replace_match_codes(
    '50000000-0000-0000-0000-000000000020', 'ZZ',
    '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002',
    array['CODEA', 'CODEB', 'CODEC']::text[]
  ),
  3,
  'replace_match_codes replaces the set: second call returns 3'
);
select is(
  (select count(*)::int from public.match_codes where fixture_id = '50000000-0000-0000-0000-000000000020'),
  3,
  'exactly 3 rows remain -- the prior 2 were deleted, not accumulated to 5'
);
select is(
  (select array_agg(game_number order by game_number) from public.match_codes
   where fixture_id = '50000000-0000-0000-0000-000000000020'),
  array[1, 2, 3],
  'the 3 replacement codes are numbered 1..3 in array order'
);

-- A non-admin captain (of one of the fixture's own teams, no less) cannot
-- call replace_match_codes -- writes to match_codes stay admin-only.
select tests.acting_as(tests.cap(1));
select throws_like($$
  select public.replace_match_codes(
    '50000000-0000-0000-0000-000000000020'::uuid, 'ZZ',
    '50000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000002'::uuid,
    array['X']::text[]
  )
$$, 'NOT_ADMIN%', 'a non-admin captain cannot call replace_match_codes');

select * from finish();
rollback;
