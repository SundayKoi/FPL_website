begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into public.betting_events(name)
values ('Kickoff Lock Test')
returning id \gset event_

insert into public.betting_teams(name, short_code)
values ('Kickoff Alpha', 'KLA')
returning id \gset team_a_

insert into public.betting_teams(name, short_code)
values ('Kickoff Bravo', 'KLB')
returning id \gset team_b_

insert into public.betting_profiles(discord_id, username)
values ('lock-test', 'Kickoff Lock Test');

select public.create_market_admin(
  'lock-test', :'event_id', :'team_a_id', :'team_b_id',
  'KLA vs KLB', null, '2026-09-08 00:00:00+00', 0
) as id \gset market_

select is(
  (select lock_at from public.betting_markets where id = :'market_id'),
  '2026-09-08 00:00:00+00'::timestamptz,
  'manual markets lock exactly at their game time'
);
select is(
  (select lock_at from public.betting_markets where id = :'market_id'),
  (select game_at from public.betting_markets where id = :'market_id'),
  'manual market lock and game timestamps match'
);
select is(has_function_privilege(
  'service_role',
  'public.create_market_admin(text,bigint,bigint,bigint,text,text,timestamptz,integer,numeric,boolean)',
  'execute'
), true, 'service_role can execute the manual market creator');
select ok(not exists(
  select 1 from public.betting_markets
  where id = :'market_id' and lock_at <> game_at
), 'manual market never stores an early lock time');

select * from finish();
rollback;
