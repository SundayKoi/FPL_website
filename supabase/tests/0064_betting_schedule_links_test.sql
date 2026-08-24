begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select has_column('public', 'betting_events', 'league',
                 'betting events can bind to a league');
select has_column('public', 'betting_events', 'schedule_season',
                 'betting events can bind to a fixture season');
select has_column('public', 'betting_markets', 'fixture_id',
                 'betting markets record their source fixture');

insert into public.betting_events(name, league, schedule_season)
values ('Unbound event', null, null), ('Premier Test', 'premier', 'S99');

select lives_ok(
  $$ insert into public.betting_events(name) values ('Manual props') $$,
  'manual events remain unbound'
);
select throws_ok(
  $$ insert into public.betting_events(name, league) values ('Half bound', 'academy') $$,
  '23514', null, 'an event cannot bind only a league'
);
select throws_ok(
  $$ insert into public.betting_events(name, schedule_season) values ('Half bound', 'A99') $$,
  '23514', null, 'an event cannot bind only a season'
);
select throws_ok(
  $$ insert into public.betting_events(name, league, schedule_season)
     values ('Bad league', 'challenger', 'S99') $$,
  '23514', null, 'only Premier and Academy are accepted'
);
select throws_ok(
  $$ insert into public.betting_events(name, league, schedule_season)
     values ('Duplicate binding', 'premier', 'S99') $$,
  '23505', null, 'one event owns a league-season binding'
);

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of)
values ('S99', 'week_1', 'Alpha', 'Bravo', '2026-09-08 00:00:00+00', 3)
returning id \gset source_

insert into public.betting_teams(name, short_code)
values ('Alpha', 'ALP')
returning id \gset a_
insert into public.betting_teams(name, short_code)
values ('Bravo', 'BRV')
returning id \gset b_

insert into public.betting_markets(
  event_id, team_a_id, team_b_id, title, game_at, lock_at, fixture_id
)
select id, :a_id, :b_id, 'ALP vs BRV',
       '2026-09-08 00:00:00+00', '2026-09-07 23:55:00+00', :'source_id'
from public.betting_events
where name = 'Premier Test';

select throws_ok(
  $$ insert into public.betting_markets(
       event_id, team_a_id, team_b_id, title, game_at, lock_at, fixture_id
     )
     select id,
            (select id from public.betting_teams where short_code = 'ALP'),
            (select id from public.betting_teams where short_code = 'BRV'),
            'duplicate', '2026-09-08 00:00:00+00',
            '2026-09-07 23:55:00+00',
            (select id from public.fixtures where team_a = 'Alpha')
     from public.betting_events where name = 'Premier Test' $$,
  '23505', null, 'one automated market is allowed per fixture'
);

delete from public.fixtures where id = :'source_id';
select is(
  (select fixture_id from public.betting_markets where title = 'ALP vs BRV'),
  null::uuid,
  'deleting a fixture preserves market history and clears provenance'
);
select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'betting_events_schedule_binding_uidx'
  ),
  'event bindings have a partial unique index'
);
select ok(
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'betting_markets_fixture_id_uidx'
  ),
  'fixture provenance has an indexed unique lookup'
);
select is(
  (select count(*)
   from public.betting_events
   where league is null
     and schedule_season is null
     and name in ('Unbound event', 'Manual props')),
  2::bigint,
  'unbound event rows remain valid'
);

select * from finish();
rollback;
