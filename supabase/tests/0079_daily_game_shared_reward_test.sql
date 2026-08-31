begin;
set local search_path = public, extensions;
select plan(31);

select has_table('public', 'daily_game_rewards', 'shared daily-game reward claims exist');
select is((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'higher_lower_daily_runs' and column_name = 'reward_amount'), 1::bigint, 'Higher or Lower stores the shared reward amount');
select ok((select relrowsecurity from pg_class where oid = 'public.daily_game_rewards'::regclass), 'shared reward claims use RLS');
select is(has_table_privilege('anon', 'public.daily_game_rewards', 'select'), false, 'anonymous users cannot read shared reward claims');
select is(has_table_privilege('authenticated', 'public.daily_game_rewards', 'select'), false, 'authenticated users cannot read shared reward claims');
select is(has_function_privilege('anon', 'public.claim_daily_game_reward(date,uuid,text,text,bigint)', 'execute'), false, 'anonymous users cannot claim the shared reward');
select is(has_function_privilege('authenticated', 'public.claim_daily_game_reward(date,uuid,text,text,bigint)', 'execute'), false, 'authenticated users cannot claim the shared reward');
select is(has_function_privilege('service_role', 'public.claim_daily_game_reward(date,uuid,text,text,bigint)', 'execute'), true, 'service role can claim the shared reward');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000791', 'Shared Reward Normal'),
  ('00000000-0000-0000-0000-000000000792', 'Shared Reward Patron'),
  ('00000000-0000-0000-0000-000000000793', 'Shared Reward Higher Lower');
insert into public.betting_profiles (discord_id, profile_id, username, balance, patron_until)
values
  ('shared-reward-0791', '00000000-0000-0000-0000-000000000791', 'Normal', 1000, null),
  ('shared-reward-0792', '00000000-0000-0000-0000-000000000792', 'Patron', 1000, now() + interval '30 days'),
  ('shared-reward-0793', '00000000-0000-0000-0000-000000000793', 'Higher Lower', 1000, null);

select * from public.claim_daily_game_reward(
  '2099-02-01', '00000000-0000-0000-0000-000000000791', 'shared-reward-0791', 'fpldle', 101
)
\gset normal_first_
select is(:'normal_first_amount'::bigint, 200::bigint, 'normal first daily game pays 200');
select is(:'normal_first_balance'::bigint, 1200::bigint, 'normal first daily game returns the credited balance');
select is(:'normal_first_already_claimed'::boolean, false, 'normal first daily game is the shared claim');

select * from public.claim_daily_game_reward(
  '2099-02-01', '00000000-0000-0000-0000-000000000791', 'shared-reward-0791', 'higher_lower', 102
)
\gset normal_second_
select is(:'normal_second_amount'::bigint, 200::bigint, 'normal second daily game keeps the same amount');
select is(:'normal_second_already_claimed'::boolean, true, 'normal second daily game reports the existing shared claim');
select is((select count(*) from public.daily_game_rewards where profile_id = '00000000-0000-0000-0000-000000000791'), 1::bigint, 'normal member has one shared reward row');
select is((select count(*) from public.betting_ledger where discord_id = 'shared-reward-0791' and reason = 'daily_game_reward'), 1::bigint, 'normal member has one shared reward ledger row');

select * from public.claim_daily_game_reward(
  '2099-02-02', '00000000-0000-0000-0000-000000000792', 'shared-reward-0792', 'higher_lower', 201
)
\gset patron_first_
select is(:'patron_first_amount'::bigint, 300::bigint, 'active patron first daily game pays 300');
select is(:'patron_first_already_claimed'::boolean, false, 'active patron first daily game is the shared claim');

select * from public.claim_daily_game_reward(
  '2099-02-02', '00000000-0000-0000-0000-000000000792', 'shared-reward-0792', 'fpldle', 202
)
\gset patron_second_
select is(:'patron_second_amount'::bigint, 300::bigint, 'active patron second daily game keeps the same amount');
select is(:'patron_second_already_claimed'::boolean, true, 'active patron second daily game reports the existing shared claim');
select is((select count(*) from public.betting_ledger where discord_id = 'shared-reward-0792' and reason = 'daily_game_reward'), 1::bigint, 'active patron has one shared reward ledger row');

insert into public.higher_lower_daily_candidates (
  puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
)
values
  ('2099-02-04', 'premier', 'SHARED_REWARD', '2099-02-04', 'shared-low', 'Shared Low', 50, jsonb_build_object('slug', 'shared-low', 'name', 'Shared Low', 'overall', 50)),
  ('2099-02-04', 'premier', 'SHARED_REWARD', '2099-02-04', 'shared-mid', 'Shared Mid', 80, jsonb_build_object('slug', 'shared-mid', 'name', 'Shared Mid', 'overall', 80)),
  ('2099-02-04', 'premier', 'SHARED_REWARD', '2099-02-04', 'shared-high', 'Shared High', 95, jsonb_build_object('slug', 'shared-high', 'name', 'Shared High', 'overall', 95));

select * from public.start_higher_lower_run(
  '2099-02-04', 'premier', '00000000-0000-0000-0000-000000000793', 'shared-reward-0793'
)
\gset higher_lower_start_
select is(:'higher_lower_start_run_state'::text, 'awaiting_choice'::text, 'Higher or Lower starts a daily run');

select * from public.submit_higher_lower_choice(
  '2099-02-04', 'premier', '00000000-0000-0000-0000-000000000793', :'higher_lower_start_run_version'::integer, 'timeout'
)
\gset higher_lower_finish_
select is(:'higher_lower_finish_run_state'::text, 'lost'::text, 'a timed-out Higher or Lower run completes');
select is(:'higher_lower_finish_reward_amount'::bigint, 200::bigint, 'Higher or Lower completion pays the shared normal amount');
select is(:'higher_lower_finish_reward_already_claimed'::boolean, false, 'Higher or Lower completion claims the reward first');
select is((select balance from public.betting_profiles where discord_id = 'shared-reward-0793'), 1200::bigint, 'Higher or Lower credits the wallet');

select * from public.record_fpldle_guess(
  '2099-02-04', 'premier', '00000000-0000-0000-0000-000000000793', 'shared-reward-0793', 'shared-answer', true
)
\gset fpldle_after_higher_lower_
select is(:'fpldle_after_higher_lower_reward_amount'::bigint, 200::bigint, 'FPL''dle returns the existing shared amount');
select is(:'fpldle_after_higher_lower_already_rewarded'::boolean, true, 'FPL''dle reports that Higher or Lower claimed first');
select is(:'fpldle_after_higher_lower_balance'::bigint, 1200::bigint, 'FPL''dle does not credit the wallet twice');
select is((select source from public.daily_game_rewards where profile_id = '00000000-0000-0000-0000-000000000793' and puzzle_date = '2099-02-04'), 'higher_lower', 'the first completed game remains the reward source');
select is((select count(*) from public.betting_ledger where discord_id = 'shared-reward-0793' and reason = 'daily_game_reward'), 1::bigint, 'cross-game completion writes one shared reward ledger row');
select is((select reward_amount from public.fpldle_daily_progress where profile_id = '00000000-0000-0000-0000-000000000793' and puzzle_date = '2099-02-04' and league = 'premier'), 200::bigint, 'FPL''dle progress stores the shared amount');

select * from finish();
rollback;
