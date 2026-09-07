begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(15);

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
  ('S99', 'week_4', 'Premier Alpha', 'Premier Bravo', '2099-09-08 00:00:00+00', 3, 1),
  ('A99', 'week_4', 'Academy Alpha', 'Academy Bravo', '2099-09-08 00:00:00+00', 3, 1);


-- Two fixtures in each league, far in the future so creation remains testable.
insert into public.fixtures(season,stage,team_a,team_b,scheduled_at,best_of,sort_order)
select season,stage,team_b,team_a,scheduled_at,best_of,2 from public.fixtures where season in ('S99','A99');
update public.betting_pickem_bank set balance=777 where id=1;
select public.generate_weekly_betting_markets('2099-09-01 05:00:00+00') as result \gset first_
select is(:'first_result'::jsonb#>>'{pickems,created}', '2', 'generator creates both league pickems');
select is((select count(*) from public.betting_pickems where title='Week 4'),2::bigint,'titles follow week 4 fixture stage');
select is((select count(*) from public.betting_pickem_legs l join public.betting_pickems p on p.id=l.pickem_id where p.title='Week 4'),4::bigint,'all four fixture markets are legs');
select is(public.ensure_weekly_betting_pickems('2099-09-07')->>'existing','2','retry reuses both exact slates');
select is(public.ensure_weekly_betting_pickems('2099-09-07')->>'created','0','retry creates no duplicate');
select is((select sum(carryover) from public.betting_pickems where title='Week 4'),777::numeric,'bank claimed exactly once across leagues and retries');
select is((select balance from public.betting_pickem_bank where id=1),0::bigint,'bank zeroed atomically');
update public.betting_markets set status='LOCKED' where fixture_id in (select id from public.fixtures where season in ('S99','A99'));
select is(public.ensure_weekly_betting_pickems('2099-09-07')->>'existing','2','locked existing pickems remain idempotent');
select is(has_function_privilege('anon','public.ensure_weekly_betting_pickems(date)','execute'),false,'anon denied');
select is(has_function_privilege('authenticated','public.ensure_weekly_betting_pickems(date)','execute'),false,'authenticated denied');
select is(has_function_privilege('service_role','public.ensure_weekly_betting_pickems(date)','execute'),true,'service role allowed');
update public.betting_pickems set title='Week 3' where event_id=(select id from public.betting_events where name='Premier Automation');
select throws_ok($$select public.ensure_weekly_betting_pickems('2099-09-07')$$,null,null,'wrong week is refused');
update public.betting_pickems set title='Week 4' where event_id=(select id from public.betting_events where name='Premier Automation');
delete from public.betting_pickem_legs where market_id=(select min(market_id) from public.betting_pickem_legs);
select throws_ok($$select public.ensure_weekly_betting_pickems('2099-09-07')$$,null,null,'partial existing slate is refused');
select throws_ok($$select public.ensure_weekly_betting_pickems('2099-09-08')$$,null,null,'non Monday target is refused');
update public.fixtures set stage='week_3' where season='S99' and sort_order=2;
select throws_ok($$select public.ensure_weekly_betting_pickems('2099-09-07')$$,null,null,'mixed weeks refused');
select * from finish();
rollback;
