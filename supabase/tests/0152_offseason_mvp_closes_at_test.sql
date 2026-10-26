-- Offseason MVP voting deadline (20261122000001): staff can end a week's vote
-- at a set time instead of when the next week is complete; an older week never
-- reopens, and only staff set the deadline.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(8);

insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values (tests.cap(1), 'Deadline Fan') on conflict (id) do nothing;
insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e0152', 'Deadline Offseason', false, 'running');
insert into public.offseason_entrants (id, event_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0152', '00000000-0000-0000-0000-0000000e0152', 'Ace', 'Ace#OS1', 'mid', 'mid'),
  ('00000000-0000-0000-0000-0000000b0152', '00000000-0000-0000-0000-0000000e0152', 'Bolt', 'Bolt#OS1', 'top', 'top');
insert into public.offseason_weeks (id, event_id, week_number, status) values
  ('00000000-0000-0000-0000-0000000f0152', '00000000-0000-0000-0000-0000000e0152', 1, 'complete'),
  ('00000000-0000-0000-0000-0000001f0152', '00000000-0000-0000-0000-0000000e0152', 2, 'complete');
insert into public.offseason_teams (id, week_id, tier, name)
  values ('00000000-0000-0000-0000-0000000d0152', '00000000-0000-0000-0000-0000001f0152', 'main', 'Team Ace');
insert into public.offseason_team_members (team_id, entrant_id, role) values
  ('00000000-0000-0000-0000-0000000d0152', '00000000-0000-0000-0000-0000000a0152', 'mid'),
  ('00000000-0000-0000-0000-0000000d0152', '00000000-0000-0000-0000-0000000b0152', 'top');
insert into public.offseason_mvp_nominees (week_id, entrant_id, position) values
  ('00000000-0000-0000-0000-0000001f0152', '00000000-0000-0000-0000-0000000a0152', 1),
  ('00000000-0000-0000-0000-0000001f0152', '00000000-0000-0000-0000-0000000b0152', 2);

select is(public._offseason_mvp_open_week('00000000-0000-0000-0000-0000000e0152'), '00000000-0000-0000-0000-0000001f0152'::uuid,
          'without a deadline the newest complete week is open');

-- A fan can't set the deadline: only staff write weeks.
select tests.acting_as(tests.cap(1));
set local role authenticated;
update public.offseason_weeks set mvp_closes_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000001f0152';
reset role;
select is((select mvp_closes_at from public.offseason_weeks where id = '00000000-0000-0000-0000-0000001f0152'), null,
          'a fan can''t set a deadline');

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ update public.offseason_weeks set mvp_closes_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000001f0152' $$,
                'staff set a deadline');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000001f0152', '00000000-0000-0000-0000-0000000a0152') $$,
                'voting stays open before the deadline');
reset role;

update public.offseason_weeks set mvp_closes_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000001f0152';
select is(public._offseason_mvp_open_week('00000000-0000-0000-0000-0000000e0152'), null,
          'once the deadline passes no week is open, and an older one doesn''t reopen');
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000001f0152', '00000000-0000-0000-0000-0000000b0152') $$,
                   'VOTING_CLOSED%', 'and nobody can vote');
reset role;

set local role anon;
select results_eq($$ select week_id, entrant_id, votes, final from public.offseason_mvp_results('00000000-0000-0000-0000-0000000e0152') $$,
                  $$ values ('00000000-0000-0000-0000-0000001f0152'::uuid, '00000000-0000-0000-0000-0000000a0152'::uuid, 1, true) $$,
                  'the closed week''s count shows');
reset role;

-- A later week completing opens its own vote as before.
insert into public.offseason_weeks (id, event_id, week_number, status) values
  ('00000000-0000-0000-0000-0000002f0152', '00000000-0000-0000-0000-0000000e0152', 3, 'complete');
select is(public._offseason_mvp_open_week('00000000-0000-0000-0000-0000000e0152'), '00000000-0000-0000-0000-0000002f0152'::uuid,
          'the next complete week opens its own vote');

select * from finish();
rollback;
