-- Offseason champion drafts (20261119000001): the two teams' captains draft
-- each game of a match, staff act for either side, everyone watches, and the
-- match is fearless across its games.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(37);

-- === fixture =================================================================
-- Team A's captain is cap 1 (cap 3 plays for them), team B's is cap 2, cap 4 is a fan.
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Draft A'), (tests.cap(2), 'Draft B'), (tests.cap(3), 'Draft A2'), (tests.cap(4), 'Draft Fan')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e0150', 'Draft Offseason', false, 'running');
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0150', '00000000-0000-0000-0000-0000000e0150', tests.cap(1), 'Draft A', 'Draft A#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000b0150', '00000000-0000-0000-0000-0000000e0150', tests.cap(2), 'Draft B', 'Draft B#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000c0150', '00000000-0000-0000-0000-0000000e0150', tests.cap(3), 'Draft A2', 'Draft A2#OS1', 'mid', 'mid');
insert into public.offseason_weeks (id, event_id, week_number, status)
  values ('00000000-0000-0000-0000-0000000f0150', '00000000-0000-0000-0000-0000000e0150', 1, 'playing');
insert into public.offseason_teams (id, week_id, tier, name, captain_entrant_id) values
  ('00000000-0000-0000-0000-0000001a0150', '00000000-0000-0000-0000-0000000f0150', 'elimination', 'Team A', '00000000-0000-0000-0000-0000000a0150'),
  ('00000000-0000-0000-0000-0000001b0150', '00000000-0000-0000-0000-0000000f0150', 'elimination', 'Team B', '00000000-0000-0000-0000-0000000b0150');
insert into public.offseason_team_members (team_id, entrant_id, role) values
  ('00000000-0000-0000-0000-0000001a0150', '00000000-0000-0000-0000-0000000a0150', 'top'),
  ('00000000-0000-0000-0000-0000001a0150', '00000000-0000-0000-0000-0000000c0150', 'mid'),
  ('00000000-0000-0000-0000-0000001b0150', '00000000-0000-0000-0000-0000000b0150', 'top');
insert into public.offseason_matches (id, week_id, stage, sort_order, team_a_id, team_b_id, best_of) values
  ('00000000-0000-0000-0000-0000002a0150', '00000000-0000-0000-0000-0000000f0150', 'elimination', 1,
   '00000000-0000-0000-0000-0000001a0150', '00000000-0000-0000-0000-0000001b0150', 3);

-- Every step of a game as staff, champions named G<game>C<step>.
create function pg_temp.draft_game(p_game int, p_from int default 0, p_to int default 19) returns void
language plpgsql as $$
begin
  for v_step in p_from..p_to loop
    perform public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', p_game, v_step,
      'G' || p_game || 'C' || v_step, null);
  end loop;
end $$;

-- === 1-4. the table: anyone reads, nobody writes directly, realtime streams it
select ok((select relrowsecurity from pg_class where oid = 'public.offseason_match_drafts'::regclass), 'drafts have RLS on');
set local role anon;
select lives_ok($$ select count(*) from public.offseason_match_drafts $$, 'anyone can watch a draft');
select throws_ok($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'blue', true) $$, '42501', null, 'a visitor cannot draft');
reset role;
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'offseason_match_drafts'),
          'drafts stream over realtime');

-- === 5-9. only the two captains, each for their own side =====================
select tests.acting_as(tests.cap(4));
set local role authenticated;
select throws_like($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'blue', true) $$, 'NOT_A_CAPTAIN%', 'a fan cannot ready up');
select throws_ok($$ insert into public.offseason_match_drafts (match_id, game_number, revision) values ('00000000-0000-0000-0000-0000002a0150', 1, 1) $$,
                 '42501', null, 'nobody writes a draft directly');
reset role;

select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'blue', true) $$, 'NOT_A_CAPTAIN%',
                   'a teammate who isn''t captain watches');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'red', true) $$, 'NOT_YOUR_SIDE%',
                   'team A plays blue in game 1, so its captain can''t ready red');
select lives_ok($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'blue', true) $$, 'team A''s captain readies blue');
reset role;

-- === 10-15. the draft runs in order with its clock ===========================
select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 1, 'red', true) $$, 'team B''s captain readies red');
select throws_like($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 1, 0, 'Ahri', null) $$, 'NOT_YOUR_SIDE%',
                   'red can''t take blue''s first ban');
reset role;
select is((select turn_allowance_seconds from public.offseason_match_drafts where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number = 1), 30,
          'both ready starts a 30 second ban clock');

select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 1, 0, 'G1C0', null) $$, 'blue bans first');
select throws_like($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 1, 2, 'Zed', null) $$, 'OUT_OF_TURN%', 'steps go in order');
reset role;
select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_like($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 1, 1, 'g1c0', null) $$, 'CHAMPION_TAKEN%',
                   'a champion goes once a game');
reset role;

-- === 16-18. a match has as many games as its best_of, and staff draft for either side
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 4, 'blue', true) $$, 'BAD_GAME%', 'a Bo3 has no game 4');
select lives_ok($$ select pg_temp.draft_game(1, 1) $$, 'staff draft the rest of game 1 for both sides');
reset role;
select results_eq($$ select status::text, jsonb_array_length(actions), current_step_index from public.offseason_match_drafts
                     where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number = 1 $$,
                  $$ values ('complete'::text, 20, 19) $$, 'twenty steps complete the game');

-- === 19-21. fearless: game 1's picks are out for the rest of the match =====
select tests.acting_as(tests.admin_id());
set local role authenticated;
select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 2, 'blue', true);
select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 2, 'red', true);
select pg_temp.draft_game(2, 0, 5);
select throws_like($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 2, 6, 'G1C6', null) $$, 'FEARLESS_BLOCKED%',
                   'a champion picked in game 1 can''t be picked in game 2');
select lives_ok($$ select public.apply_offseason_draft_action('00000000-0000-0000-0000-0000002a0150', 2, 6, 'G1C0', null) $$,
                'a champion only banned in game 1 can be picked');
reset role;
select is((select actions->-1->>'playerName' from public.offseason_match_drafts where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number = 2), null,
          'a pick records the player name it was given');

-- === 22-25. roles and the room's result after the draft =====================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.set_offseason_draft_positions('00000000-0000-0000-0000-0000002a0150', 1, 'blue', '["G1C10","G1C9","G1C6","G1C18","G1C17"]'::jsonb) $$,
                'blue''s captain confirms blue''s roles');
select throws_like($$ select public.set_offseason_draft_positions('00000000-0000-0000-0000-0000002a0150', 1, 'red', '["G1C7","G1C8","G1C11","G1C16","G1C19"]'::jsonb) $$,
                   'NOT_YOUR_SIDE%', 'but not red''s');
select lives_ok($$ select public.set_offseason_draft_winner('00000000-0000-0000-0000-0000002a0150', 1, 'team a') $$, 'a captain records who won');
select throws_like($$ select public.set_offseason_draft_winner('00000000-0000-0000-0000-0000002a0150', 1, 'Team C') $$, 'BAD_REQUEST%', 'only one of the two teams');
reset role;

-- === 26-29. a change request reopens a step, with the other team's approval ==
select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.request_offseason_draft_change('00000000-0000-0000-0000-0000002a0150', 1, 7) $$, 'red asks to redo its first pick');
select throws_like($$ select public.respond_offseason_draft_change('00000000-0000-0000-0000-0000002a0150', 1, true) $$, 'NOT_YOUR_CALL%',
                   'the asking team can''t approve its own request');
reset role;
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.respond_offseason_draft_change('00000000-0000-0000-0000-0000002a0150', 1, true) $$, 'blue approves');
reset role;
select results_eq($$ select status::text, current_step_index, positions is null and winner_team is null and change_request is null
                     from public.offseason_match_drafts where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number = 1 $$,
                  $$ values ('drafting'::text, 7, true) $$, 'the step is up again, and the roles and result are cleared');

-- === 30-34. sides for a later game, and passing a ban ========================
select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.choose_offseason_draft_blue('00000000-0000-0000-0000-0000002a0150', 3, 'Team B') $$, 'a captain puts team B on blue for game 3');
select lives_ok($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 3, 'blue', true) $$, 'team B''s captain now readies blue');
reset role;
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.set_offseason_draft_ready('00000000-0000-0000-0000-0000002a0150', 3, 'red', true) $$, 'and team A''s readies red');
select throws_like($$ select public.skip_offseason_draft_step('00000000-0000-0000-0000-0000002a0150', 3) $$, 'TOO_SOON%', 'a ban is only skipped once its clock runs out');
reset role;

select tests.acting_as(tests.cap(2));
set local role authenticated;
select public.pass_offseason_draft_step('00000000-0000-0000-0000-0000002a0150', 3);
reset role;
select is((select (actions->0->>'skipped')::boolean from public.offseason_match_drafts where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number = 3), true,
          'blue passed its first ban');

-- === 35-37. staff undo and reset; captains can't ===========================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.undo_offseason_draft_last('00000000-0000-0000-0000-0000002a0150', 2) $$, 'STAFF_ONLY%', 'captains can''t undo');
select throws_like($$ select public.reset_offseason_draft('00000000-0000-0000-0000-0000002a0150', 2) $$, 'STAFF_ONLY%', 'or reset');
reset role;
select tests.acting_as(tests.admin_id());
set local role authenticated;
select public.undo_offseason_draft_last('00000000-0000-0000-0000-0000002a0150', 2);
select public.reset_offseason_draft('00000000-0000-0000-0000-0000002a0150', 3);
reset role;
select results_eq($$ select game_number, jsonb_array_length(actions), blue_team_name from public.offseason_match_drafts
                     where match_id = '00000000-0000-0000-0000-0000002a0150' and game_number in (2, 3) order by game_number $$,
                  $$ values (2, 6, null::text), (3, 0, null::text) $$, 'undo takes back the last step; reset clears a game and its sides');

select * from finish();
rollback;
