-- Weekly offseason MVP (20261113000002): anyone signed in votes for one of
-- the open week's players, never themselves, and the count shows once voting
-- on that week closes.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(16);

-- === fixture =================================================================
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Playing Voter'), (tests.cap(2), 'Fan One'), (tests.cap(3), 'Fan Two')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e0145', 'MVP Offseason', false, 'running');
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role)
values
  ('00000000-0000-0000-0000-0000000a0145', '00000000-0000-0000-0000-0000000e0145', tests.cap(1), 'Star', 'Star#OS1', 'mid', 'mid'),
  ('00000000-0000-0000-0000-0000000b0145', '00000000-0000-0000-0000-0000000e0145', null, 'Rookie', 'Rookie#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000c0145', '00000000-0000-0000-0000-0000000e0145', null, 'Benchwarmer', 'Bench#OS1', 'adc', 'adc');
insert into public.offseason_weeks (id, event_id, week_number, status) values
  ('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000e0145', 1, 'drafting');
insert into public.offseason_teams (id, week_id, tier, name)
  values ('00000000-0000-0000-0000-0000000d0145', '00000000-0000-0000-0000-0000000f0145', 'main', 'Team Star');
insert into public.offseason_team_members (team_id, entrant_id, role) values
  ('00000000-0000-0000-0000-0000000d0145', '00000000-0000-0000-0000-0000000a0145', 'mid'),
  ('00000000-0000-0000-0000-0000000d0145', '00000000-0000-0000-0000-0000000b0145', 'top');

-- === 1-2. voting waits for the games =========================================
set local role anon;
select throws_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000b0145') $$,
                 '42501', null, 'a visitor cannot vote');
reset role;

select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000a0145') $$,
                   'VOTING_CLOSED%', 'voting opens once the week''s games start');
reset role;

update public.offseason_weeks set status = 'playing' where id = '00000000-0000-0000-0000-0000000f0145';

-- === 3-6. a player votes, never for themselves ===============================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000a0145') $$,
                   'SELF_VOTE%', 'a player cannot vote for themselves');
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000c0145') $$,
                   'NOT_PLAYING%', 'only that week''s players can be picked');
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000b0145') $$,
                'a player votes for a teammate');
select throws_ok($$ insert into public.offseason_mvp_votes (week_id, voter_id, entrant_id) values ('00000000-0000-0000-0000-0000000f0145', auth.uid(), '00000000-0000-0000-0000-0000000a0145') $$,
                 '42501', null, 'nobody writes votes directly');
reset role;

-- === 7-10. fans vote and change their minds ==================================
select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000b0145') $$,
                'a fan votes');
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000a0145') $$,
                'and changes their vote');
select is((select count(*)::int from public.offseason_mvp_votes), 1, 'a voter sees only their own vote');
reset role;

select tests.acting_as(tests.cap(3));
set local role authenticated;
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000a0145') $$,
                'another fan votes');
reset role;

-- === 11-12. the count is hidden while voting is open =========================
set local role anon;
select results_eq($$ select entrant_id, votes, final from public.offseason_mvp_results('00000000-0000-0000-0000-0000000e0145') $$,
                  $$ values (null::uuid, 3, false) $$, 'an open week shows only how many have voted');
reset role;
select is((select count(*)::int from public.offseason_mvp_votes where week_id = '00000000-0000-0000-0000-0000000f0145'), 3,
          'one vote per voter, however often they change it');

-- === 13-16. the next week's games close it ===================================
insert into public.offseason_weeks (id, event_id, week_number, status) values
  ('00000000-0000-0000-0000-0000000f1145', '00000000-0000-0000-0000-0000000e0145', 2, 'drafting');
select tests.acting_as(tests.cap(3));
set local role authenticated;
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000b0145') $$,
                'a week stays open while the next one drafts');
reset role;

update public.offseason_weeks set status = 'playing' where id = '00000000-0000-0000-0000-0000000f1145';
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0145', '00000000-0000-0000-0000-0000000a0145') $$,
                   'VOTING_CLOSED%', 'and closes when the next week''s games start');
reset role;

set local role anon;
select results_eq($$ select week_id, entrant_id, votes, final from public.offseason_mvp_results('00000000-0000-0000-0000-0000000e0145') where final order by votes desc $$,
                  $$ values ('00000000-0000-0000-0000-0000000f0145'::uuid, '00000000-0000-0000-0000-0000000b0145'::uuid, 2, true),
                            ('00000000-0000-0000-0000-0000000f0145'::uuid, '00000000-0000-0000-0000-0000000a0145'::uuid, 1, true) $$,
                  'a closed week shows its count');
reset role;

update public.offseason_events set status = 'complete' where id = '00000000-0000-0000-0000-0000000e0145';
select is((select count(*)::int from public.offseason_mvp_results('00000000-0000-0000-0000-0000000e0145') where not final), 0,
          'nothing is open once the event ends');

select * from finish();
rollback;
