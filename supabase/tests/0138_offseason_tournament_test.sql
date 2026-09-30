-- The offseason tournament (20261107000001): who may read and write, the
-- sign-up and claim rules, locking a week, a weekly auction that the
-- ordinary draft rules accept, reading it back, results, the ingest's
-- report, and elimination.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(36);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Cap One'), (tests.cap(2), 'Cap Two'), (tests.cap(3), 'Bystander'), (tests.cap(4), 'Latecomer')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name)
  values ('00000000-0000-0000-0000-0000000e0138', 'Test Offseason');

-- Eight pool players staff added by hand: two teams whose captains play top
-- and jungle need one more top and jungle and two of everything else.
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role)
select '00000000-0000-0000-0000-0000000e0138', 'Pool ' || n, 'Pool Player ' || n || '#OS1',
       (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role
from generate_series(1, 8) n;

-- An unlinked row a captain will claim by signing up with its Riot ID.
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role)
  values ('00000000-0000-0000-0000-0000000e0138', 'Placeholder', 'Cap Two#OS1', 'mid');

-- === 1-3. reading and writing ===============================================
set local role anon;
select is((select count(*)::int from public.offseason_events where id = '00000000-0000-0000-0000-0000000e0138'),
          1, 'anyone can read the event');
select throws_ok($$ insert into public.offseason_events (name) values ('Anon event') $$,
                 '42501', null, 'anon cannot create an event');
reset role;

select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_ok($$ insert into public.offseason_events (name) values ('Player event') $$,
                 '42501', null, 'a player cannot create an event');
reset role;

-- === 4-10. signing up ========================================================
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Nobody', 'Nobody#OS1', null, null, 'top', null) $$,
                   'NOT_SIGNED_IN%', 'signing up needs a signed-in profile');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Cap One', 'Cap One#OS1', null, 'Diamond 2', 'jungle', 'top') $$,
                'a signed-in player can sign up');
select lives_ok($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Cap One', 'Cap One#OS1', null, 'Diamond 2', 'top', 'jungle') $$,
                'signing up again edits the same entry');
select throws_like($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Cap One', 'not a riot id', null, null, 'top', null) $$,
                   'RIOT_ID_INVALID%', 'a Riot ID must be Name#TAG');
reset role;
select is((select count(*)::int from public.offseason_entrants where profile_id = tests.cap(1)),
          1, 'one entry per profile, now playing top');

select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Cap Two', 'cap two#OS1', null, null, 'jungle', null) $$,
                'signing up with a staff-added Riot ID claims it');
reset role;
select ok((select profile_id = tests.cap(2) and primary_role = 'jungle' and display_name = 'Cap Two'
             from public.offseason_entrants where lower(riot_id) = 'cap two#os1'),
          'the claimed row is linked, not duplicated');

select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Thief', 'Cap Two#OS1', null, null, 'mid', null) $$,
                   'RIOT_ID_TAKEN%', 'a Riot ID someone has claimed cannot be taken');
reset role;

-- === 11-14. roles and the week's pools =======================================
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_apply_roles('00000000-0000-0000-0000-0000000e0138', '[]'::jsonb) $$,
                   'NOT_ADMIN%', 'a player cannot assign roles');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_apply_roles('00000000-0000-0000-0000-0000000e0138',
            (select jsonb_agg(jsonb_build_object('entrant_id', id, 'role', primary_role, 'status', 'active'))
               from public.offseason_entrants where event_id = '00000000-0000-0000-0000-0000000e0138')),
          10, 'staff assign every role at once');
select lives_ok($$ insert into public.offseason_weeks (id, event_id, week_number)
                   values ('00000000-0000-0000-0000-0000000f0138', '00000000-0000-0000-0000-0000000e0138', 1) $$,
                'staff open week 1');
select is(public.offseason_set_week_entries('00000000-0000-0000-0000-0000000f0138',
            (select jsonb_agg(jsonb_build_object(
                'entrant_id', id, 'tier', 'main',
                'captain_seat', case profile_id when '00000000-0000-0000-0000-000000000001' then 1
                                                when '00000000-0000-0000-0000-000000000002' then 2 end))
               from public.offseason_entrants where event_id = '00000000-0000-0000-0000-0000000e0138')),
          10, 'staff lock the week: ten players, two captains');
reset role;

-- === 15-20. the weekly auction ==============================================
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0138', 'main', 100) $$,
                   'NOT_ADMIN%', 'a player cannot create the week''s draft');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0138', 'main', 100) $$,
                'staff create the week''s auction');
select throws_like($$ select public.offseason_set_week_entries('00000000-0000-0000-0000-0000000f0138', '[]'::jsonb) $$,
                   'WEEK_LOCKED%', 'a week with a draft keeps its pools');
reset role;

select ok((select count(*) = 2 and bool_and(captain_profile_id in (tests.cap(1), tests.cap(2))) and bool_and(budget_start = 100)
             from public.teams where draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0138')),
          'one team per captain, seated by profile, with the budget');
select is((select count(*)::int from public.players
             where draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0138')
               and team_id is null),
          8, 'the other eight are the pool');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.start_draft((select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0138')) $$,
                'the ordinary start_draft accepts the offseason auction');

-- === 21-24. reading the auction back ========================================
set local role authenticated;
select throws_like($$ select public.offseason_import_week_draft('00000000-0000-0000-0000-0000000f0138', 'main') $$,
                   'DRAFT_NOT_FINISHED%', 'an unfinished auction cannot be imported');
reset role;

-- Finish it: each team buys the pool player for every role it lacks.
do $$
declare
  v_team record;
  r public.lol_role;
  v_player uuid;
  v_draft uuid := (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0138');
begin
  for v_team in select id from public.teams where draft_id = v_draft order by nomination_position loop
    foreach r in array public.open_roles(v_team.id) loop
      select id into v_player from public.players
        where draft_id = v_draft and role = r and team_id is null order by display_name limit 1;
      update public.players set team_id = v_team.id, acquisition = 'auction', price = 7 where id = v_player;
    end loop;
  end loop;
end $$;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_import_week_draft('00000000-0000-0000-0000-0000000f0138', 'main'),
          2, 'a finished auction becomes two offseason teams');
select throws_like($$ select public.offseason_import_week_draft('00000000-0000-0000-0000-0000000f0138', 'main') $$,
                   'ALREADY_IMPORTED%', 'importing twice is refused');
reset role;
select ok((select count(*) = 10 and count(distinct m.team_id) = 2
             from public.offseason_team_members m
             join public.offseason_teams t on t.id = m.team_id
            where t.week_id = '00000000-0000-0000-0000-0000000f0138'),
          'both rosters come across whole, captains included');
select is((select status from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0138'),
          'playing', 'the week moves on to play');

-- === 25-29. results ==========================================================
insert into public.offseason_matches (id, week_id, stage, team_a_id, team_b_id, best_of)
select '00000000-0000-0000-0000-0000000a0138', '00000000-0000-0000-0000-0000000f0138', 'round_robin',
       (array_agg(id order by name))[1], (array_agg(id order by name))[2], 1
from public.offseason_teams where week_id = '00000000-0000-0000-0000-0000000f0138';

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_set_game('00000000-0000-0000-0000-0000000a0138', 1, ' na1_5012345678 ',
                     (select team_a_id from public.offseason_matches where id = '00000000-0000-0000-0000-0000000a0138')) $$,
                'staff record a game with its Riot match id');
select throws_like($$ select public.offseason_set_game('00000000-0000-0000-0000-0000000a0138', 1, null, '00000000-0000-0000-0000-000000000001') $$,
                   'WINNER_INVALID%', 'the winner must be one of the two teams');
select throws_like($$ select public.offseason_set_game('00000000-0000-0000-0000-0000000a0138', 1, 'not-a-match', null) $$,
                   'RIOT_MATCH_INVALID%', 'a Riot match id must look like one');
select throws_ok($$ select public.offseason_record_ingest((select id from public.offseason_games limit 1), null, null) $$,
                 '42501', null, 'only the service-role ingest reports on games');
reset role;
select ok((select m.winner_team_id = m.team_a_id and g.riot_match_id = 'NA1_5012345678'
             from public.offseason_matches m join public.offseason_games g on g.match_id = m.id
            where m.id = '00000000-0000-0000-0000-0000000a0138'),
          'the Bo1 winner is the match winner, and the id is stored normalized');

-- === 30-32. elimination ======================================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_set_team_eliminated(
                        (select team_a_id from public.offseason_matches where id = '00000000-0000-0000-0000-0000000a0138'), true) $$,
                   'TEAM_INVALID%', 'only an elimination-tier team can be eliminated');
reset role;

insert into public.offseason_teams (id, week_id, tier, name)
  values ('00000000-0000-0000-0000-0000000b0138', '00000000-0000-0000-0000-0000000f0138', 'elimination', 'Bottom Team');
insert into public.offseason_team_members (team_id, entrant_id, role)
select '00000000-0000-0000-0000-0000000b0138', id, 'mid'
from public.offseason_entrants where display_name = 'Pool 3';

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_set_team_eliminated('00000000-0000-0000-0000-0000000b0138', true) $$,
                'staff eliminate a losing elimination team');
reset role;
select ok((select status = 'eliminated' and eliminated_week = 1 from public.offseason_entrants where display_name = 'Pool 3'),
          'its players are out as of this week');

-- === 33-34. stats and closing sign-ups ======================================
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_ok($$ insert into public.offseason_stats (match_id, summoner_name) values ('NA1_1', 'Someone') $$,
                 '42501', null, 'only the ingest writes offseason stats');
reset role;

update public.offseason_events set signups_open = false where id = '00000000-0000-0000-0000-0000000e0138';
select tests.acting_as(tests.cap(4));
set local role authenticated;
select throws_like($$ select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0138', 'Late', 'Late Comer#OS1', null, null, 'top', null) $$,
                   'SIGNUPS_CLOSED%', 'nobody joins once sign-ups close');
reset role;

select * from finish();
rollback;
