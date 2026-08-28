begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

select has_column(
  'public',
  'fpldle_daily_progress',
  'first_solved_at',
  'progress stores immutable first solve time'
);
select ok(
  exists (
    select 1
    from pg_class index_class
    join pg_index index_meta on index_meta.indexrelid = index_class.oid
    where index_class.relname = 'fpldle_daily_progress_solved_idx'
      and index_meta.indrelid = 'public.fpldle_daily_progress'::regclass
      and pg_get_expr(index_meta.indpred, index_meta.indrelid) like '%first_solved_at%IS NOT NULL%'
  ),
  'solved progress has the partial streak index'
);
select is(
  has_table_privilege('anon', 'public.fpldle_daily_progress', 'select'),
  false,
  'anon cannot read progress'
);
select is(
  has_table_privilege('authenticated', 'public.fpldle_daily_progress', 'select'),
  false,
  'authenticated cannot read progress'
);
select has_function(
  'public',
  'get_fpldle_streak_snapshot',
  array['text', 'date', 'uuid'],
  'streak snapshot RPC exists'
);
select is(
  has_function_privilege('anon', 'public.get_fpldle_streak_snapshot(text,date,uuid)', 'execute'),
  false,
  'anon cannot execute streak snapshot'
);
select is(
  has_function_privilege('authenticated', 'public.get_fpldle_streak_snapshot(text,date,uuid)', 'execute'),
  false,
  'authenticated cannot execute streak snapshot'
);
select is(
  has_function_privilege('service_role', 'public.get_fpldle_streak_snapshot(text,date,uuid)', 'execute'),
  true,
  'service role can execute streak snapshot'
);

insert into public.profiles (id, display_name, avatar_url)
values
  ('00000000-0000-0000-0000-000000000072', 'Streak 1', 'https://example.com/72.png'),
  ('00000000-0000-0000-0000-000000000073', 'Streak 2', null),
  ('00000000-0000-0000-0000-000000000074', 'Streak 3', null),
  ('00000000-0000-0000-0000-000000000075', 'Streak 4', null),
  ('00000000-0000-0000-0000-000000000076', 'Streak 5', null),
  ('00000000-0000-0000-0000-000000000077', 'Streak 6', null),
  ('00000000-0000-0000-0000-000000000078', 'Streak 7', null),
  ('00000000-0000-0000-0000-000000000079', 'Streak 8', null),
  ('00000000-0000-0000-0000-000000000080', 'Streak 9', null),
  ('00000000-0000-0000-0000-000000000081', 'Streak 10', null);

insert into public.betting_profiles (discord_id, profile_id, username, avatar_url, balance)
values
  ('fpldle-streak-1', '00000000-0000-0000-0000-000000000072', 'One', 'https://example.com/one.png', 1000),
  ('fpldle-streak-2', '00000000-0000-0000-0000-000000000073', 'Two', null, 1000),
  ('fpldle-streak-3', '00000000-0000-0000-0000-000000000074', 'Three', null, 1000),
  ('fpldle-streak-4', '00000000-0000-0000-0000-000000000075', 'Four', null, 1000),
  ('fpldle-streak-5', '00000000-0000-0000-0000-000000000076', 'Five', null, 1000),
  ('fpldle-streak-6', '00000000-0000-0000-0000-000000000077', 'Six', null, 1000),
  ('fpldle-streak-7', '00000000-0000-0000-0000-000000000078', 'Seven', null, 1000),
  ('fpldle-streak-8', '00000000-0000-0000-0000-000000000079', 'Eight', null, 1000),
  ('fpldle-streak-9', '00000000-0000-0000-0000-000000000080', 'Nine', null, 1000),
  ('fpldle-streak-10', '00000000-0000-0000-0000-000000000081', 'Ten', null, 1000);

-- Seven users have positive streaks. User 4 ranks sixth, so it exercises the
-- current-user row outside the top five. User 3 missed a full day.
insert into public.fpldle_daily_progress (
  puzzle_date, league, profile_id, discord_id, first_solved_at
)
values
  ('2099-01-01', 'premier', '00000000-0000-0000-0000-000000000072', 'fpldle-streak-1', '2099-01-01 12:00:00+00'),
  ('2099-01-02', 'premier', '00000000-0000-0000-0000-000000000072', 'fpldle-streak-1', '2099-01-02 12:00:00+00'),
  ('2099-01-03', 'premier', '00000000-0000-0000-0000-000000000072', 'fpldle-streak-1', '2099-01-03 12:00:00+00'),
  ('2099-01-01', 'premier', '00000000-0000-0000-0000-000000000073', 'fpldle-streak-2', '2099-01-01 12:00:00+00'),
  ('2099-01-02', 'premier', '00000000-0000-0000-0000-000000000073', 'fpldle-streak-2', '2099-01-02 12:00:00+00'),
  ('2099-01-04', 'premier', '00000000-0000-0000-0000-000000000073', 'fpldle-streak-2', '2099-01-04 12:00:00+00'),
  ('2099-01-01', 'premier', '00000000-0000-0000-0000-000000000074', 'fpldle-streak-3', '2099-01-01 12:00:00+00'),
  ('2099-01-02', 'premier', '00000000-0000-0000-0000-000000000074', 'fpldle-streak-3', '2099-01-02 12:00:00+00'),
  ('2099-01-03', 'premier', '00000000-0000-0000-0000-000000000075', 'fpldle-streak-4', '2099-01-03 12:00:00+00'),
  ('2099-01-02', 'premier', '00000000-0000-0000-0000-000000000076', 'fpldle-streak-5', '2099-01-02 12:00:00+00'),
  ('2099-01-03', 'premier', '00000000-0000-0000-0000-000000000076', 'fpldle-streak-5', '2099-01-03 12:00:00+00'),
  ('2099-01-04', 'premier', '00000000-0000-0000-0000-000000000076', 'fpldle-streak-5', '2099-01-04 12:00:00+00'),
  ('2098-12-28', 'premier', '00000000-0000-0000-0000-000000000077', 'fpldle-streak-6', '2098-12-28 12:00:00+00'),
  ('2098-12-29', 'premier', '00000000-0000-0000-0000-000000000077', 'fpldle-streak-6', '2098-12-29 12:00:00+00'),
  ('2098-12-30', 'premier', '00000000-0000-0000-0000-000000000077', 'fpldle-streak-6', '2098-12-30 12:00:00+00'),
  ('2099-01-04', 'premier', '00000000-0000-0000-0000-000000000077', 'fpldle-streak-6', '2099-01-04 12:00:00+00'),
  ('2099-01-03', 'premier', '00000000-0000-0000-0000-000000000078', 'fpldle-streak-7', '2099-01-03 12:00:00+00'),
  ('2099-01-04', 'premier', '00000000-0000-0000-0000-000000000079', 'fpldle-streak-8', '2099-01-04 12:00:00+00'),
  ('2099-01-03', 'premier', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', '2099-01-03 12:00:00+00');

-- User 7 used all five guesses unsuccessfully today. The prior solve would
-- otherwise leave yesterday's streak active until UTC midnight.
insert into public.fpldle_daily_progress (
  puzzle_date, league, profile_id, discord_id, guesses
)
values (
  '2099-01-04', 'premier', '00000000-0000-0000-0000-000000000078',
  'fpldle-streak-7', array['wrong-1', 'wrong-2', 'wrong-3', 'wrong-4', 'wrong-5']::text[]
);

select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000072') where profile_id = '00000000-0000-0000-0000-000000000072'),
  3,
  'consecutive solves and an unplayed today extend current streak'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000074') where profile_id = '00000000-0000-0000-0000-000000000074'),
  0,
  'missing full UTC day resets current streak'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000073') where profile_id = '00000000-0000-0000-0000-000000000073'),
  1,
  'solving today starts a streak after a gap'
);
select is(
  (select best_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000072') where profile_id = '00000000-0000-0000-0000-000000000072'),
  3,
  'personal best records longest historical island'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000078') where profile_id = '00000000-0000-0000-0000-000000000078'),
  0,
  'fifth wrong guess breaks current streak immediately'
);

update public.fpldle_daily_progress
set first_solved_at = '2100-01-01 00:00:00+00'
where puzzle_date = '2099-01-03'
  and league = 'premier'
  and profile_id = '00000000-0000-0000-0000-000000000072';
select is(
  (select first_solved_at from public.fpldle_daily_progress where puzzle_date = '2099-01-03' and league = 'premier' and profile_id = '00000000-0000-0000-0000-000000000072'),
  '2099-01-03 12:00:00+00'::timestamptz,
  'first solved time is immutable'
);

select is(
  (select count(*) from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000075') where not is_current_user),
  5::bigint,
  'leaderboard returns at most five positive active streaks'
);
select is(
  (select rank from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000075') where profile_id = '00000000-0000-0000-0000-000000000075'),
  6,
  'current user keeps deterministic rank outside top five'
);
select is(
  (select is_current_user from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000075') where profile_id = '00000000-0000-0000-0000-000000000075'),
  true,
  'current user row is marked outside top five'
);
select is(
  (select username from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000072') where profile_id = '00000000-0000-0000-0000-000000000072'),
  'One',
  'snapshot returns betting username'
);
select is(
  (select avatar_url from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000072') where profile_id = '00000000-0000-0000-0000-000000000072'),
  'https://example.com/one.png',
  'snapshot returns avatar URL'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-01-04', '00000000-0000-0000-0000-000000000074') where is_current_user),
  0,
  'current user row remains available with no active streak'
);

-- Exercise the write path that marks a five-wrong loss, rather than only
-- seeding its final array state.
insert into public.fpldle_daily_progress (puzzle_date, league, profile_id, discord_id, first_solved_at)
values ('2099-01-03', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', '2099-01-03 12:00:00+00');
select * from public.record_fpldle_guess('2099-01-04', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', 'wrong-a', false);
select * from public.record_fpldle_guess('2099-01-04', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', 'wrong-b', false);
select * from public.record_fpldle_guess('2099-01-04', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', 'wrong-c', false);
select * from public.record_fpldle_guess('2099-01-04', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', 'wrong-d', false);
select * from public.record_fpldle_guess('2099-01-04', 'academy', '00000000-0000-0000-0000-000000000080', 'fpldle-streak-9', 'wrong-e', false);
select is(
  (select cardinality(guesses) from public.fpldle_daily_progress where puzzle_date = '2099-01-04' and league = 'academy' and profile_id = '00000000-0000-0000-0000-000000000080'),
  5,
  'record path accepts exactly five wrong guesses'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('academy', '2099-01-04', '00000000-0000-0000-0000-000000000080') where is_current_user),
  0,
  'recorded fifth wrong guess resets streak immediately'
);

insert into public.fpldle_daily_progress (puzzle_date, league, profile_id, discord_id, first_solved_at)
values
  ('2099-03-01', 'premier', '00000000-0000-0000-0000-000000000081', 'fpldle-streak-10', '2099-03-01 12:00:00+00'),
  ('2099-02-27', 'academy', '00000000-0000-0000-0000-000000000081', 'fpldle-streak-10', '2099-02-27 12:00:00+00');
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-03-01', '00000000-0000-0000-0000-000000000081') where is_current_user),
  1,
  'Premier streak is independent'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('academy', '2099-03-01', '00000000-0000-0000-0000-000000000081') where is_current_user),
  0,
  'Academy streak is independent'
);

select * from public.record_fpldle_guess('2099-04-01', 'premier', '00000000-0000-0000-0000-000000000081', 'fpldle-streak-10', 'answer', true);
select public.reset_fpldle_daily_puzzle('2099-04-01', 'premier');
select ok(
  (select first_solved_at is not null from public.fpldle_daily_progress where puzzle_date = '2099-04-01' and league = 'premier' and profile_id = '00000000-0000-0000-0000-000000000081'),
  'admin reset preserves earned solve marker'
);
select is(
  (select current_streak from public.get_fpldle_streak_snapshot('premier', '2099-04-01', '00000000-0000-0000-0000-000000000081') where is_current_user),
  1,
  'admin reset preserves earned current streak'
);

set local role anon;
select throws_ok(
  $$select * from public.get_fpldle_streak_snapshot('premier', '2099-01-04', null)$$,
  '42501',
  null,
  'anon snapshot calls are denied'
);
set local role authenticated;
select throws_ok(
  $$select * from public.get_fpldle_streak_snapshot('premier', '2099-01-04', null)$$,
  '42501',
  null,
  'authenticated snapshot calls are denied'
);

select * from finish();
rollback;
