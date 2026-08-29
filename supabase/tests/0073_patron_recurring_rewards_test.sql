begin;
set local search_path = public, extensions;
select plan(46);

select ok(to_regprocedure('public.calculate_recurring_reward(text,bigint,bigint,integer)') is not null, 'shared recurring reward calculator exists');
select ok((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'daily_banger_votes' and column_name = 'reward_amount') = 1, 'daily banger stores the paid amount');
select is(has_function_privilege('service_role', 'public.calculate_recurring_reward(text,bigint,bigint,integer)', 'execute'), true, 'service role can use the calculator');
select is(has_function_privilege('anon', 'public.calculate_recurring_reward(text,bigint,bigint,integer)', 'execute'), false, 'anonymous users cannot use the calculator');
select is(has_function_privilege('authenticated', 'public.calculate_recurring_reward(text,bigint,bigint,integer)', 'execute'), false, 'authenticated users cannot use the calculator');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000007301', 'FPL normal'),
  ('00000000-0000-0000-0000-000000007302', 'FPL active'),
  ('00000000-0000-0000-0000-000000007303', 'FPL expired');

insert into public.betting_profiles (discord_id, profile_id, username, balance, last_daily, daily_streak, last_weekly, weekly_streak, patron_until)
values
  ('daily-normal-0073', null, 'Daily normal', 1000, now() - interval '25 hours', 2, null, 0, null),
  ('daily-active-0073', null, 'Daily active', 1000, now() - interval '25 hours', 2, null, 0, now() + interval '30 days'),
  ('daily-expired-0073', null, 'Daily expired', 1000, now() - interval '25 hours', 2, null, 0, now() - interval '1 second'),
  ('weekly-normal-0073', null, 'Weekly normal', 1000, null, 0, null, 0, null),
  ('weekly-active-0073', null, 'Weekly active', 1000, null, 0, null, 0, now() + interval '30 days'),
  ('weekly-expired-0073', null, 'Weekly expired', 1000, null, 0, null, 0, now() - interval '1 second'),
  ('fpl-normal-0073', '00000000-0000-0000-0000-000000007301', 'FPL normal', 1000, null, 0, null, 0, null),
  ('fpl-active-0073', '00000000-0000-0000-0000-000000007302', 'FPL active', 1000, null, 0, null, 0, now() + interval '30 days'),
  ('fpl-expired-0073', '00000000-0000-0000-0000-000000007303', 'FPL expired', 1000, null, 0, null, 0, now() - interval '1 second'),
  ('match-normal-0073', null, 'Match normal', 1000, null, 0, null, 0, null),
  ('match-active-0073', null, 'Match active', 1000, null, 0, null, 0, now() + interval '30 days'),
  ('match-expired-0073', null, 'Match expired', 1000, null, 0, null, 0, now() - interval '1 second');

select is(public.calculate_recurring_reward('daily-active-0073', 250, 50, 3), 475::bigint, 'patron multiplier applies to the daily base only');

select is((select amount from public.claim_daily_streak('daily-normal-0073', 250, 50, 7)), 350::bigint, 'normal daily keeps the streak formula');
select is((select amount from public.claim_daily_streak('daily-active-0073', 250, 50, 7)), 475::bigint, 'active patron daily boosts only the base');
select is((select amount from public.claim_daily_streak('daily-expired-0073', 250, 50, 7)), 350::bigint, 'expired patron gets the normal daily amount');

update public.betting_profiles
set last_daily = now() - interval '25 hours', daily_streak = 7
where discord_id = 'daily-active-0073';
select is((select amount from public.claim_daily_streak('daily-active-0073', 250, 50, 7)), 675::bigint, 'patron daily maximum is 675');
select is((select balance - 1000 from public.betting_profiles where discord_id = 'daily-active-0073'), (select coalesce(sum(delta), 0)::bigint from public.betting_ledger where discord_id = 'daily-active-0073' and reason = 'daily'), 'daily wallet equals its daily ledger');

select is((select amount from public.claim_weekly_streak('weekly-normal-0073', 1000, 250, 4)), 1000::bigint, 'normal weekly pays its base');
select is((select amount from public.claim_weekly_streak('weekly-active-0073', 1000, 250, 4)), 1500::bigint, 'active patron weekly boosts only the base');
select is((select amount from public.claim_weekly_streak('weekly-expired-0073', 1000, 250, 4)), 1000::bigint, 'expired patron gets the normal weekly amount');

update public.betting_profiles
set last_weekly = now() - interval '8 days', weekly_streak = 1
where discord_id = 'weekly-active-0073';
select is((select amount from public.claim_weekly_streak('weekly-active-0073', 1000, 250, 4)), 1750::bigint, 'weekly streak step stays at 250 for patrons');
update public.betting_profiles
set last_weekly = now() - interval '8 days', weekly_streak = 4
where discord_id = 'weekly-active-0073';
select is((select amount from public.claim_weekly_streak('weekly-active-0073', 1000, 250, 4)), 2250::bigint, 'patron weekly maximum is 2250');
select is((select balance - 1000 from public.betting_profiles where discord_id = 'weekly-active-0073'), (select coalesce(sum(delta), 0)::bigint from public.betting_ledger where discord_id = 'weekly-active-0073' and reason = 'weekly'), 'weekly wallet equals its weekly ledger');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000007401'::uuid, 'authenticated', 'authenticated', 'daily-normal-0073@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000007402'::uuid, 'authenticated', 'authenticated', 'daily-active-0073@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000007403'::uuid, 'authenticated', 'authenticated', 'daily-expired-0073@example.test', '', now(), now(), now());
insert into public.banger_posts (id, body, published_at, x_url)
values ('banger-daily-0073', 'Patron reward regression fixture', now(), 'https://example.test/banger-daily-0073');
insert into public.daily_banger_checks (check_date, post_id, starts_at, ends_at)
values (
  timezone('utc', now())::date,
  'banger-daily-0073',
  date_trunc('day', timezone('utc', now())) at time zone 'utc',
  (date_trunc('day', timezone('utc', now())) + interval '1 day') at time zone 'utc'
);

select is((select reward_amount from public.vote_daily_banger('banger-daily-0073', '00000000-0000-0000-0000-000000007401'::uuid, 'daily-normal-0073', 'banger')), 200::bigint, 'normal Daily Stu pays 200');
select is((select reward_amount from public.vote_daily_banger('banger-daily-0073', '00000000-0000-0000-0000-000000007402'::uuid, 'daily-active-0073', 'mid')), 300::bigint, 'active patron Daily Stu pays 300');
select is((select reward_amount from public.vote_daily_banger('banger-daily-0073', '00000000-0000-0000-0000-000000007403'::uuid, 'daily-expired-0073', 'stinker')), 200::bigint, 'expired patron Daily Stu pays 200');
select is((select reward_amount from public.daily_banger_votes where discord_id = 'daily-active-0073'), 300::bigint, 'Daily Stu claim row stores the actual patron amount');
select is((select reward_amount from public.vote_daily_banger('banger-daily-0073', '00000000-0000-0000-0000-000000007402'::uuid, 'daily-active-0073', 'mid')), 0::bigint, 'replayed Daily Stu claim pays nothing');
select is((select already_voted from public.vote_daily_banger('banger-daily-0073', '00000000-0000-0000-0000-000000007402'::uuid, 'daily-active-0073', 'mid')), true, 'replayed Daily Stu claim reports the duplicate');
select is((select count(*) from public.betting_ledger where discord_id = 'daily-active-0073' and reason = 'daily_banger_vote'), 1::bigint, 'replayed Daily Stu claim writes one ledger row');

select is((select reward_amount from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000007301'::uuid, 'fpl-normal-0073', 'normal-answer', true)), 200::bigint, 'normal FPL''dle pays 200');
select is((select reward_amount from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000007302'::uuid, 'fpl-active-0073', 'active-answer', true)), 300::bigint, 'active patron FPL''dle pays 300');
select is((select reward_amount from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000007303'::uuid, 'fpl-expired-0073', 'expired-answer', true)), 200::bigint, 'expired patron FPL''dle pays 200');
select is((select reward_amount from public.fpldle_daily_progress where discord_id = 'fpl-active-0073'), 300::bigint, 'FPL''dle progress stores the actual patron amount');
select is((select accepted from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000007302'::uuid, 'fpl-active-0073', 'active-answer', true)), false, 'replayed FPL''dle solve is not accepted twice');
select is((select reward_amount from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000007302'::uuid, 'fpl-active-0073', 'active-answer', true)), 300::bigint, 'replayed FPL''dle solve returns the existing reward');
select is((select count(*) from public.betting_ledger where discord_id = 'fpl-active-0073' and reason = 'fpldle_completion'), 1::bigint, 'replayed FPL''dle solve writes one ledger row');

insert into public.fixtures (id, season, stage, team_a, team_b, best_of, sort_order)
values ('00000000-0000-0000-0000-000000007501'::uuid, 'PATRON_0073', 'week_1', 'A', 'B', 3, 7301);
select is((select amount from public.pay_match_win('00000000-0000-0000-0000-000000007501'::uuid, 'match-normal-0073', 'PATRON_0073', date '2026-08-24', 200)), 200::bigint, 'normal scheduled match win pays 200');
select is((select amount from public.pay_match_win('00000000-0000-0000-0000-000000007501'::uuid, 'match-active-0073', 'PATRON_0073', date '2026-08-24', 200)), 300::bigint, 'active patron scheduled match win pays 300');
select is((select amount from public.pay_match_win('00000000-0000-0000-0000-000000007501'::uuid, 'match-expired-0073', 'PATRON_0073', date '2026-08-24', 200)), 200::bigint, 'expired patron scheduled match win pays 200');
select is((select amount from public.match_win_payouts where discord_id = 'match-active-0073'), 300::bigint, 'scheduled match payout stores the actual patron amount');
select is((select paid from public.pay_match_win('00000000-0000-0000-0000-000000007501'::uuid, 'match-active-0073', 'PATRON_0073', date '2026-08-24', 200)), false, 'replayed scheduled match win is not paid twice');
select is((select amount from public.pay_match_win('00000000-0000-0000-0000-000000007501'::uuid, 'match-active-0073', 'PATRON_0073', date '2026-08-24', 200)), 0::bigint, 'replayed scheduled match win returns zero amount');
select is((select count(*) from public.betting_ledger where discord_id = 'match-active-0073' and reason = 'match_win'), 1::bigint, 'replayed scheduled match win writes one ledger row');

select is((select balance - 1000 from public.betting_profiles where discord_id = 'fpl-active-0073'), (select coalesce(sum(delta), 0)::bigint from public.betting_ledger where discord_id = 'fpl-active-0073'), 'FPL''dle wallet equals its ledger');
select is((select balance - 1000 from public.betting_profiles where discord_id = 'match-active-0073'), (select coalesce(sum(delta), 0)::bigint from public.betting_ledger where discord_id = 'match-active-0073'), 'match wallet equals its ledger');

select is(has_function_privilege('anon', 'public.claim_daily_streak(text,bigint,bigint,integer)', 'execute'), false, 'anonymous users cannot call daily claims');
select is(has_function_privilege('service_role', 'public.claim_daily_streak(text,bigint,bigint,integer)', 'execute'), true, 'service role can call daily claims');
select is(has_function_privilege('authenticated', 'public.claim_weekly_streak(text,bigint,bigint,integer)', 'execute'), false, 'authenticated users cannot call weekly claims');
select is(has_function_privilege('service_role', 'public.vote_daily_banger(text,uuid,text,text)', 'execute'), true, 'service role can call Daily Stu claims');
select is(has_function_privilege('service_role', 'public.record_fpldle_guess(date,text,uuid,text,text,boolean)', 'execute'), true, 'service role can call FPL''dle claims');
select is(has_function_privilege('service_role', 'public.pay_match_win(uuid,text,text,date,bigint)', 'execute'), true, 'service role can call scheduled match payouts');

select * from finish();
rollback;
