begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(13);

select has_table('public', 'league_settings', 'league settings table exists');
select has_function('public', 'swap_roster_players', array['uuid', 'uuid'], 'roster swap RPC exists');

create temporary table t as select tests.fixture() as d;
create temporary table teams as
  select id, nomination_position
  from public.teams
  where draft_id = (select d from t);

update public.players
set team_id = (select id from teams where nomination_position = 1), price = 12, acquisition = 'auction'
where display_name = 'Mid1';
update public.players
set team_id = (select id from teams where nomination_position = 2), price = 17, acquisition = 'auction'
where display_name = 'Mid2';
update public.players
set team_id = (select id from teams where nomination_position = 3), price = 8, acquisition = 'auction'
where display_name = 'Support1';

select tests.acting_as(tests.cap(1));
select throws_like(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Mid2')
  )$$,
  'NOT_ADMIN%',
  'captain cannot call the roster swap RPC'
);

select tests.acting_as(tests.admin_id());
select lives_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Mid2')
  )$$,
  'admin can swap same-role non-captains'
);
select is(
  (select team_id from public.players where display_name = 'Mid1'),
  (select id from teams where nomination_position = 2),
  'left player moves to right team'
);
select is(
  (select team_id from public.players where display_name = 'Mid2'),
  (select id from teams where nomination_position = 1),
  'right player moves to left team'
);
select is((select price from public.players where display_name = 'Mid1'), 12, 'left price is unchanged');
select is((select price from public.players where display_name = 'Mid2'), 17, 'right price is unchanged');
select is((select acquisition::text from public.players where display_name = 'Mid1'), 'auction', 'left acquisition is unchanged');
select is((select acquisition::text from public.players where display_name = 'Mid2'), 'auction', 'right acquisition is unchanged');

select throws_like(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Captain 1'),
    (select id from public.players where display_name = 'Captain 2')
  )$$,
  'CAPTAIN_LOCKED%',
  'captains cannot move'
);
select throws_like(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Support1')
  )$$,
  'ROLE_MISMATCH%',
  'different roles cannot swap'
);

select throws_like(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Captain 1'),
    (select id from public.players where display_name = 'FA 1')
  )$$,
  'SAME_TEAM%',
  'players on one team cannot swap'
);

select * from finish();
rollback;
