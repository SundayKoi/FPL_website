begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

select has_table('public', 'fpldle_daily_progress', 'FPL''dle progress table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.fpldle_daily_progress'::regclass), 'progress uses RLS');
select is(has_table_privilege('anon', 'public.fpldle_daily_progress', 'select'), false, 'anon cannot read private progress');
select is(has_table_privilege('authenticated', 'public.fpldle_daily_progress', 'select'), false, 'authenticated cannot read private progress');
select is(has_function_privilege('anon', 'public.record_fpldle_guess(date,text,uuid,text,text,boolean)', 'execute'), false, 'anon cannot record progress');
select is(has_function_privilege('authenticated', 'public.record_fpldle_guess(date,text,uuid,text,text,boolean)', 'execute'), false, 'authenticated cannot record progress');
select is(has_function_privilege('service_role', 'public.record_fpldle_guess(date,text,uuid,text,text,boolean)', 'execute'), true, 'service role can record progress');
select is(has_function_privilege('anon', 'public.reset_fpldle_daily_puzzle(date,text)', 'execute'), false, 'anon cannot reset puzzles');
select is(has_function_privilege('authenticated', 'public.reset_fpldle_daily_puzzle(date,text)', 'execute'), false, 'authenticated cannot reset puzzles');
select is(has_function_privilege('service_role', 'public.reset_fpldle_daily_puzzle(date,text)', 'execute'), true, 'service role can reset puzzles');

insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000071', 'FPLdle Tester');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('fpldle-0071', '00000000-0000-0000-0000-000000000071', 'FPLdle Tester', 1000);

select * from public.record_fpldle_guess(
  '2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-one', false
)
\gset first_
select is(:'first_accepted'::boolean, true, 'first guess is accepted');
select is(:'first_guess_count'::int, 1, 'first guess is counted');
select is(:'first_reward_amount'::bigint, 0::bigint, 'wrong guess earns no reward');
select is(:'first_balance'::bigint, 1000::bigint, 'wrong guess does not change balance');

select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-two', false);
select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-three', false);
select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-four', false);
select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-five', false)
\gset fifth_
select is(:'fifth_accepted'::boolean, true, 'fifth guess is accepted');
select is(:'fifth_guess_count'::int, 5, 'five-guess limit is recorded');
select is(:'fifth_reward_amount'::bigint, 0::bigint, 'five wrong guesses earn no reward');
select throws_ok(
  $$select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-six', false)$$,
  null, null, 'a sixth guess is rejected'
);
select throws_ok(
  $$select * from public.record_fpldle_guess('2026-08-28', 'premier', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'guess-one', false)$$,
  null, null, 'a duplicate guess is rejected'
);

select * from public.record_fpldle_guess(
  '2026-08-28', 'academy', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'academy-wrong', false
);
select * from public.record_fpldle_guess(
  '2026-08-28', 'academy', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'academy-answer', true
)
\gset reward_
select is(:'reward_accepted'::boolean, true, 'correct guess is accepted');
select is(:'reward_guess_count'::int, 2, 'correct guess stays within five attempts');
select is(:'reward_reward_amount'::bigint, 200::bigint, 'correct guess earns 200');
select is(:'reward_balance'::bigint, 1200::bigint, 'reward is added to the wallet');
select is((select count(*) from public.betting_ledger where discord_id = 'fpldle-0071' and reason = 'daily_game_reward'), 1::bigint, 'one shared daily-game ledger row is written');

select * from public.record_fpldle_guess(
  '2026-08-28', 'academy', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'academy-answer', true
)
\gset retry_
select is(:'retry_accepted'::boolean, false, 'replayed correct guess is not accepted twice');
select is(:'retry_already_rewarded'::boolean, true, 'replayed correct guess reports the existing reward');
select is((select count(*) from public.betting_ledger where discord_id = 'fpldle-0071' and reason = 'daily_game_reward'), 1::bigint, 'replay does not add another shared-reward ledger row');

select public.reset_fpldle_daily_puzzle('2026-08-28', 'academy');
select is((select cardinality(guesses) from public.fpldle_daily_progress where puzzle_date = '2026-08-28' and league = 'academy' and profile_id = '00000000-0000-0000-0000-000000000071'), 0, 'admin reset clears attempts');
select is((select reward_amount from public.fpldle_daily_progress where puzzle_date = '2026-08-28' and league = 'academy' and profile_id = '00000000-0000-0000-0000-000000000071'), 200::bigint, 'admin reset preserves paid reward');
select * from public.record_fpldle_guess('2026-08-28', 'academy', '00000000-0000-0000-0000-000000000071', 'fpldle-0071', 'academy-new', false)
\gset after_reset_
select is(:'after_reset_accepted'::boolean, true, 'reset allows a fresh attempt list');
select is(:'after_reset_balance'::bigint, 1200::bigint, 'reset cannot pay the same reward twice');

select * from finish();
rollback;
