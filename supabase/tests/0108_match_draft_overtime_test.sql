-- Match-draft clocks: signed display state and side-local pick debt.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(27);

\set fixture '''00000000-0000-0000-0000-0000000f0108'''
\set lobby '''00000000-0000-0000-0000-0000000f0208'''

insert into public.profiles (id, display_name, is_admin)
values
  (tests.cap(1), 'Overtime Blue Captain', false),
  (tests.cap(2), 'Overtime Red Captain', false),
  (tests.admin_id(), 'Overtime Admin', true)
on conflict (id) do update set display_name = excluded.display_name, is_admin = excluded.is_admin;

insert into public.league_teams (id, name, abbreviation)
values
  ('00000000-0000-0000-0000-0000000b0108', 'Overtime Blue', 'OTB'),
  ('00000000-0000-0000-0000-0000000c0108', 'Overtime Red', 'OTR');

insert into public.league_team_captains (league_team_id, season, profile_id)
values
  ('00000000-0000-0000-0000-0000000b0108', 'S_OT_0108', tests.cap(1)),
  ('00000000-0000-0000-0000-0000000c0108', 'S_OT_0108', tests.cap(2));

insert into public.fixtures (id, stage, team_a, team_b, best_of, season, sort_order)
values (:fixture, 'week_1', 'Overtime Blue', 'Overtime Red', 3, 'S_OT_0108', 108);

insert into public.open_draft_lobbies
  (id, team_a_name, team_b_name, token_a, token_b, token_spectator)
values (:lobby, 'Open Overtime Blue', 'Open Overtime Red', 'ot-a-0108', 'ot-b-0108', 'ot-s-0108');

-- === schema, pure timing rules, and grants =================================
select has_column('public', 'match_drafts', 'turn_deadline_at', 'fixture rows persist an active deadline');
select has_column('public', 'open_drafts', 'blue_pending_overtime_seconds', 'lobby rows persist blue pick debt');
select is(public.match_draft_turn_allowance_seconds('pick', 'blue', 8, 0), 22, 'eight seconds of blue debt leaves 22 seconds');
select is(public.match_draft_turn_allowance_seconds('pick', 'blue', 38, 0), -8, 'debt larger than the allowance starts the next pick negative');
select is(public.match_draft_turn_allowance_seconds('ban', 'red', 38, 38), 30, 'bans never inherit pick debt');

-- Start a fixture draft, then arrange its first six bans so B1 can be tested
-- without waiting for the real clock.
select tests.acting_as(tests.cap(1));
select public.set_match_draft_ready(:fixture, 1, 'blue', true);
select tests.acting_as(tests.cap(2));
select public.set_match_draft_ready(:fixture, 1, 'red', true);

update public.match_drafts
   set actions = (
         select jsonb_agg(jsonb_build_object(
           'stepIndex', n,
           'side', case when n % 2 = 0 then 'blue' else 'red' end,
           'kind', 'ban',
           'slot', (n / 2) + 1,
           'champion', 'fixture-ban-' || n)
           order by n)
           from generate_series(0, 5) n),
       current_step_index = 6,
       status = 'drafting',
       turn_started_at = clock_timestamp() - interval '8 seconds',
       turn_deadline_at = clock_timestamp() - interval '8 seconds',
       turn_allowance_seconds = 30,
       blue_pending_overtime_seconds = 0,
       red_pending_overtime_seconds = 0
 where fixture_id = :fixture and game_number = 1;

select tests.acting_as(tests.cap(1));
select public.apply_match_draft_action(:fixture, 1, 6, 'fixture-blue-b1');
select ok((select blue_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1) >= 8,
  'fixture B1 records overtime against blue');
select is((select red_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), 0,
  'fixture B1 does not charge red');
select is((select turn_allowance_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), 30,
  'fixture R1 keeps its normal allowance after blue overtime');
select throws_ok($$select public.apply_match_draft_action('00000000-0000-0000-0000-0000000f0108', 1, 6, 'fixture-blue-b1-retry')$$,
  'P0001', 'OUT_OF_TURN: that step is not up', 'a retried fixture submission cannot charge overtime twice');

select tests.acting_as(tests.cap(2));
select public.apply_match_draft_action(:fixture, 1, 7, 'fixture-red-r1');
select public.apply_match_draft_action(:fixture, 1, 8, 'fixture-red-r2');
select is((select blue_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1) >= 8, true,
  'opponent picks do not consume blue debt');
select tests.acting_as(tests.cap(1));
select public.apply_match_draft_action(:fixture, 1, 9, 'fixture-blue-b2');
select is((select blue_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), 0,
  'blue debt is consumed on blue next pick after intervening red turns');
select is((select turn_allowance_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), 30,
  'a consecutive same-team blue pick receives a normal allowance after debt consumption');
select public.apply_match_draft_action(:fixture, 1, 10, 'fixture-blue-b3');
select is((select blue_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), 0,
  'a second consecutive blue pick does not inherit stale debt');

-- B5 starts negative with more than one full allowance of debt, but remains
-- selectable. Then make R5 negative too and finish the game normally.
update public.match_drafts
   set actions = (
         select jsonb_agg(jsonb_build_object(
           'stepIndex', n,
           'side', case when n % 2 = 0 then 'blue' else 'red' end,
           'kind', case when n >= 6 and n <= 11 then 'pick' else 'ban' end,
           'slot', (n / 2) + 1,
           'champion', 'fixture-late-' || n)
           order by n)
           from generate_series(0, 17) n),
       current_step_index = 18,
       status = 'drafting',
       turn_started_at = clock_timestamp() - interval '8 seconds',
       turn_deadline_at = clock_timestamp() - interval '8 seconds',
       turn_allowance_seconds = -8,
       blue_pending_overtime_seconds = 38,
       red_pending_overtime_seconds = 0
 where fixture_id = :fixture and game_number = 1;

select is((select turn_allowance_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1), -8,
  'B5 can begin with a negative allowance');
select tests.acting_as(tests.cap(1));
select public.apply_match_draft_action(:fixture, 1, 18, 'fixture-blue-b5');
select ok((select blue_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 1) >= 8,
  'B5 remains selectable and records its negative-clock overtime');

update public.match_drafts
   set turn_started_at = clock_timestamp() - interval '8 seconds',
       turn_deadline_at = clock_timestamp() - interval '8 seconds',
       turn_allowance_seconds = -8,
       red_pending_overtime_seconds = 38
 where fixture_id = :fixture and game_number = 1;
select ok((select turn_deadline_at < clock_timestamp() from public.match_drafts where fixture_id = :fixture and game_number = 1),
  'R5 can also remain visibly negative until selected');
select tests.acting_as(tests.cap(2));
select public.apply_match_draft_action(:fixture, 1, 19, 'fixture-red-r5');
select is((select status::text from public.match_drafts where fixture_id = :fixture and game_number = 1), 'complete',
  'R5 completes normally after overtime');

select tests.acting_as(tests.cap(1));
select public.set_match_draft_ready(:fixture, 2, 'blue', true);
select tests.acting_as(tests.cap(2));
select public.set_match_draft_ready(:fixture, 2, 'red', true);
select is((select blue_pending_overtime_seconds + red_pending_overtime_seconds from public.match_drafts where fixture_id = :fixture and game_number = 2), 0,
  'a new game resets both sides'' timing debt');

-- === public-lobby twin ======================================================
select public.set_open_draft_ready('ot-a-0108', 1, 'blue', true);
select public.set_open_draft_ready('ot-b-0108', 1, 'red', true);
update public.open_drafts
   set actions = (
         select jsonb_agg(jsonb_build_object(
           'stepIndex', n,
           'side', case when n % 2 = 0 then 'blue' else 'red' end,
           'kind', 'ban',
           'slot', (n / 2) + 1,
           'champion', 'lobby-ban-' || n)
           order by n)
           from generate_series(0, 5) n),
       current_step_index = 6,
       status = 'drafting',
       turn_started_at = clock_timestamp() - interval '8 seconds',
       turn_deadline_at = clock_timestamp() - interval '8 seconds',
       turn_allowance_seconds = 30,
       blue_pending_overtime_seconds = 0,
       red_pending_overtime_seconds = 0
 where lobby_id = :lobby and game_number = 1;

select public.apply_open_draft_action('ot-a-0108', 1, 6, 'lobby-blue-b1');
select ok((select blue_pending_overtime_seconds from public.open_drafts where lobby_id = :lobby and game_number = 1) >= 8,
  'public-lobby B1 records blue overtime');
select is((select red_pending_overtime_seconds from public.open_drafts where lobby_id = :lobby and game_number = 1), 0,
  'public-lobby B1 does not charge red');
select public.apply_open_draft_action('ot-b-0108', 1, 7, 'lobby-red-r1');
select public.apply_open_draft_action('ot-b-0108', 1, 8, 'lobby-red-r2');
select throws_ok($$select public.skip_open_draft_step('ot-a-0108', 1)$$,
  'P0001', 'PICKS_CANNOT_BE_SKIPPED: picks stay selectable during overtime',
  'public-lobby timeout behavior never skips an overtime pick');
select public.apply_open_draft_action('ot-a-0108', 1, 9, 'lobby-blue-b2');
select ok((select blue_pending_overtime_seconds from public.open_drafts where lobby_id = :lobby and game_number = 1) = 0,
  'public-lobby debt is consumed only on that side''s next pick');
select throws_ok($$select public.apply_open_draft_action('ot-a-0108', 1, 6, 'lobby-blue-b1-retry')$$,
  'P0001', 'OUT_OF_TURN: that step is not up', 'a retried lobby submission cannot charge twice');

-- The row lock is part of both authoritative transition functions, and only
-- authenticated callers can reach the fixture RPCs.
select ok((select prosrc ilike '%for update%' from pg_proc where oid = 'public.apply_match_draft_action(uuid,integer,integer,text,text)'::regprocedure),
  'fixture action transition locks its draft row');
select ok((select prosrc ilike '%for update%' from pg_proc where oid = 'public.apply_open_draft_action(text,integer,integer,text,text)'::regprocedure),
  'public-lobby action transition locks its draft row');
select ok(has_function_privilege('authenticated', 'public.apply_match_draft_action(uuid,integer,integer,text,text)', 'execute'),
  'authenticated callers can use fixture action RPC');
select ok(not has_function_privilege('anon', 'public.apply_match_draft_action(uuid,integer,integer,text,text)', 'execute'),
  'anonymous callers cannot use fixture action RPC');

select * from finish();
rollback;
