begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(38);

insert into public.drafts(name) values ('Automation Premier') returning id \gset premier_
insert into public.drafts(name) values ('Automation Academy') returning id \gset academy_

insert into public.teams(draft_id, name, abbreviation, nomination_position)
values
  (:'premier_id', 'Premier Alpha', 'PAL', 1),
  (:'premier_id', 'Premier Bravo', 'PBR', 2),
  (:'academy_id', 'Academy Alpha', 'AAL', 1),
  (:'academy_id', 'Academy Bravo', 'ABR', 2);

update public.league_settings
set current_season = 'S99',
    academy_season = 'A99',
    featured_draft_id = :'premier_id',
    academy_draft_id = :'academy_id'
where id = 1;

insert into public.betting_events(name, league, schedule_season)
values ('Premier Automation', 'premier', 'S99'),
       ('Academy Automation', 'academy', 'A99');

insert into public.betting_teams(name, short_code)
values ('Premier Alpha', 'PAL'),
       ('Premier Bravo', 'PBR'),
       ('Academy Alpha', 'AAL'),
       ('Academy Bravo', 'ABR');

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_1', 'Premier Alpha', 'Premier Bravo', '2026-09-01 00:00:00+00', 3, 1),
  ('A99', 'week_1', 'Academy Alpha', 'Academy Bravo', '2026-09-01 00:00:00+00', 3, 1);

select public.run_weekly_betting_market_cron('2026-08-25 05:00:00+00') as result
\gset first_

select is(:'first_result'::jsonb->>'status', 'created', 'valid EDT run creates a slate');
select is(:'first_result'::jsonb->>'target_monday', '2026-08-31', 'EDT run targets the following Monday');
select is(:'first_result'::jsonb->>'candidates', '2', 'EDT run sees both league fixtures');
select is(:'first_result'::jsonb->>'created', '2', 'EDT run creates both markets');
select is(:'first_result'::jsonb->>'existing', '0', 'EDT run has no existing markets on first pass');
select is((select count(*) from public.betting_markets where fixture_id is not null), 2::bigint,
          'one market is linked to each fixture');
select is((select count(*) from public.betting_markets m join public.betting_events e on e.id = m.event_id
           where e.name = 'Premier Automation'), 1::bigint,
          'Premier market uses the bound Premier event');
select is((select count(*) from public.betting_markets m join public.betting_events e on e.id = m.event_id
           where e.name = 'Academy Automation'), 1::bigint,
          'Academy market uses the bound Academy event');
select is(array(select title from public.betting_markets order by title),
          array['AAL vs ABR', 'PAL vs PBR']::text[],
          'generated titles use schedule-order betting codes');
select is((select count(*) from public.betting_markets where game_at = '2026-09-01 00:00:00+00'), 2::bigint,
          'generated markets use fixture kickoff');
select is((select count(*) from public.betting_markets where lock_at = '2026-08-31 23:55:00+00'), 2::bigint,
          'generated markets lock five minutes before kickoff');
select is((select count(*) from public.betting_markets where rake_bps = 0 and not draw_enabled), 2::bigint,
          'generated markets preserve zero rake and no draw defaults');

select public.generate_weekly_betting_markets('2026-08-25 05:00:00+00') as result
\gset retry_
select is(:'retry_result'::jsonb->>'created', '0', 'retry creates no duplicate markets');
select is(:'retry_result'::jsonb->>'existing', '2', 'retry counts identical linked markets as existing');
select is((select count(*) from public.betting_markets where fixture_id is not null), 2::bigint,
          'retry leaves the one-market-per-fixture count unchanged');

select is((public.run_weekly_betting_market_cron('2026-08-25 06:00:00+00')->>'status'), 'skipped',
          'the nonmatching UTC invocation is a no-op during EDT');
select is((select count(*) from public.betting_markets where fixture_id is not null), 2::bigint,
          'a skipped invocation creates nothing');

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_2', 'Premier Alpha', 'Premier Bravo', '2026-11-10 01:00:00+00', 3, 1),
  ('A99', 'week_2', 'Academy Alpha', 'Academy Bravo', '2026-11-10 01:00:00+00', 3, 1);
select is((public.run_weekly_betting_market_cron('2026-11-03 06:00:00+00')->>'status'), 'created',
          'the EST UTC invocation runs at 1 AM Eastern');
select is((select count(*) from public.betting_markets where fixture_id is not null), 4::bigint,
          'the EST invocation creates the second complete slate');

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_3', 'Premier Missing', 'Premier Alpha', '2026-09-08 00:00:00+00', 3, 1),
  ('A99', 'week_3', 'Academy Alpha', 'Academy Bravo', '2026-09-08 00:00:00+00', 3, 1);
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-09-01 05:00:00+00') $$,
  null, null, 'a missing fixture team mapping aborts the whole run'
);
select is((select count(*) from public.betting_markets where game_at = '2026-09-08 00:00:00+00'), 0::bigint,
          'a mapping error leaves both league markets uninserted');

update public.league_settings set featured_draft_id = null where id = 1;
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-09-08 05:00:00+00') $$,
  null, null, 'a missing active draft aborts generation'
);
update public.league_settings set featured_draft_id = :'premier_id' where id = 1;

insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_4', 'Premier Alpha', 'Premier Bravo', '2026-09-22 00:00:00+00', 3, 1),
  ('A99', 'week_4', 'Academy Alpha', 'Academy Bravo', null, 3, 1);
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-09-15 05:00:00+00') $$,
  null, null, 'a missing kickoff aborts generation'
);

update public.betting_events
set league = null, schedule_season = null
where name = 'Academy Automation';
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-09-22 05:00:00+00') $$,
  null, null, 'a missing bound event aborts generation'
);
update public.betting_events
set league = 'academy', schedule_season = 'A99'
where name = 'Academy Automation';

insert into public.betting_teams(name, short_code) values ('Duplicate Premier Alpha', 'PAL');
insert into public.fixtures(season, stage, team_a, team_b, scheduled_at, best_of, sort_order)
values
  ('S99', 'week_5', 'Premier Alpha', 'Premier Bravo', '2026-09-29 00:00:00+00', 3, 1),
  ('A99', 'week_5', 'Academy Alpha', 'Academy Bravo', '2026-09-29 00:00:00+00', 3, 1);
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-09-22 05:00:00+00') $$,
  null, null, 'an ambiguous betting code aborts generation'
);

update public.betting_markets
set title = 'WRONG'
where game_at = '2026-09-01 00:00:00+00'
  and title = 'PAL vs PBR';
select throws_ok(
  $$ select public.generate_weekly_betting_markets('2026-08-25 05:00:00+00') $$,
  null, null, 'a linked market mismatch aborts rather than updates'
);
select is((select title from public.betting_markets where game_at = '2026-09-01 00:00:00+00' and title = 'WRONG'),
          'WRONG', 'a mismatch is not silently changed');

select is(has_function_privilege('anon', 'public.generate_weekly_betting_markets(timestamptz)', 'execute'), false,
          'anon cannot execute the generator');
select is(has_function_privilege('authenticated', 'public.generate_weekly_betting_markets(timestamptz)', 'execute'), false,
          'authenticated cannot execute the generator');
select is(has_function_privilege('service_role', 'public.generate_weekly_betting_markets(timestamptz)', 'execute'), true,
          'service_role can execute the generator');
select is(has_function_privilege('anon', 'public.run_weekly_betting_market_cron(timestamptz)', 'execute'), false,
          'anon cannot execute the Cron wrapper');
select is(has_function_privilege('authenticated', 'public.run_weekly_betting_market_cron(timestamptz)', 'execute'), false,
          'authenticated cannot execute the Cron wrapper');
select is(has_function_privilege('service_role', 'public.run_weekly_betting_market_cron(timestamptz)', 'execute'), true,
          'service_role can execute the Cron wrapper');

select ok(exists(select 1 from cron.job where jobname = 'weekly-betting-markets-edt'),
          'the EDT weekly Cron job exists');
select is((select schedule from cron.job where jobname = 'weekly-betting-markets-edt'), '0 5 * * 2',
          'the EDT weekly Cron job runs at 05:00 UTC');
select ok(exists(select 1 from cron.job where jobname = 'weekly-betting-markets-est'),
          'the EST weekly Cron job exists');
select is((select schedule from cron.job where jobname = 'weekly-betting-markets-est'), '0 6 * * 2',
          'the EST weekly Cron job runs at 06:00 UTC');
select is((select count(*) from cron.job
           where jobname in ('weekly-betting-markets-edt', 'weekly-betting-markets-est')
             and command like '%run_weekly_betting_market_cron%'), 2::bigint,
          'both weekly Cron jobs call the guarded wrapper');

select * from finish();
rollback;
