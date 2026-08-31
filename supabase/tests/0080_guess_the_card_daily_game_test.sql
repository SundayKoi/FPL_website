begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

-- === schema and least-privilege boundary ================================
select has_table('public', 'box_score_daily_candidates', 'Guess the Card candidates exist');
select has_table('public', 'box_score_daily_puzzles', 'Guess the Card puzzles exist');
select has_table('public', 'box_score_daily_progress', 'Guess the Card progress exists');
select has_column('public', 'box_score_daily_candidates', 'source_match_id', 'candidate source match is frozen');
select has_column('public', 'box_score_daily_puzzles', 'target_stats', 'target stats are frozen as JSON');
select has_column('public', 'box_score_daily_progress', 'guesses', 'progress stores guesses');
select has_column('public', 'box_score_daily_progress', 'reward_amount', 'progress stores shared reward amount');

select ok((select relrowsecurity from pg_class where oid = 'public.box_score_daily_candidates'::regclass), 'candidate RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.box_score_daily_puzzles'::regclass), 'puzzle RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.box_score_daily_progress'::regclass), 'progress RLS is enabled');

select ok(not has_table_privilege('anon', 'public.box_score_daily_candidates', 'select'), 'anon cannot read candidate labels');
select ok(not has_table_privilege('authenticated', 'public.box_score_daily_candidates', 'select'), 'authenticated cannot read candidate labels');
select ok(not has_table_privilege('anon', 'public.box_score_daily_puzzles', 'select'), 'anon cannot read puzzles');
select ok(not has_table_privilege('authenticated', 'public.box_score_daily_puzzles', 'select'), 'authenticated cannot read puzzles');
select ok(not has_table_privilege('anon', 'public.box_score_daily_progress', 'select'), 'anon cannot read progress');
select ok(not has_table_privilege('authenticated', 'public.box_score_daily_progress', 'select'), 'authenticated cannot read progress');

select ok(not has_function_privilege('anon', 'public.ensure_box_score_daily_puzzle(date,text,text,jsonb)', 'execute'), 'anon cannot create Guess the Card puzzles');
select ok(not has_function_privilege('authenticated', 'public.ensure_box_score_daily_puzzle(date,text,text,jsonb)', 'execute'), 'authenticated cannot create Guess the Card puzzles');
select ok(has_function_privilege('service_role', 'public.ensure_box_score_daily_puzzle(date,text,text,jsonb)', 'execute'), 'service role can create Guess the Card puzzles');
select ok(not has_function_privilege('anon', 'public.record_box_score_guess(date,text,uuid,text,text)', 'execute'), 'anon cannot record Guess the Card guesses');
select ok(not has_function_privilege('authenticated', 'public.record_box_score_guess(date,text,uuid,text,text)', 'execute'), 'authenticated cannot record Guess the Card guesses');
select ok(has_function_privilege('service_role', 'public.record_box_score_guess(date,text,uuid,text,text)', 'execute'), 'service role can record Guess the Card guesses');
select ok(not has_function_privilege('anon', 'public.reset_box_score_daily_puzzle(date,text)', 'execute'), 'anon cannot reset Guess the Card puzzles');
select ok(not has_function_privilege('authenticated', 'public.reset_box_score_daily_puzzle(date,text)', 'execute'), 'authenticated cannot reset Guess the Card puzzles');
select ok(has_function_privilege('service_role', 'public.reset_box_score_daily_puzzle(date,text)', 'execute'), 'service role can reset Guess the Card puzzles');
select ok(has_function_privilege('service_role', 'public.claim_daily_game_reward(date,uuid,text,text,bigint)', 'execute'), 'service role can claim the shared reward for Guess the Card');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000008001', 'Guess the Card Player One'),
  ('00000000-0000-0000-0000-000000008002', 'Guess the Card Player Two');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values
  ('guess-the-card-0801', '00000000-0000-0000-0000-000000008001', 'Card One', 1000),
  ('guess-the-card-0802', '00000000-0000-0000-0000-000000008002', 'Card Two', 1000);

-- Three complete rows: two Premier candidates and one Academy candidate.
insert into public.raw_stats (
  match_id, game_date, game_duration_min, team_side, team_name,
  summoner_name, tag, champion, role, kills, deaths, assists, kda,
  solo_kills, kill_participation_pct, double_kills, triple_kills,
  quadra_kills, penta_kills, total_damage_to_champions, damage_per_min,
  damage_share_pct, damage_taken, damage_mitigated, total_healing,
  gold_earned, gold_per_min, cs, cs_per_min, cs_at_10, gold_at_10,
  vision_score, dragon_kills, baron_kills, objectives_stolen,
  objective_damage, turret_damage, game_ended_in_early_surrender, win, season
)
values
  ('BS_MATCH_ONE', '2099-02-07 12:00:00', 35, 'Blue', 'Guess the Card FC',
   'BS Player One', 'NA1', 'Ahri', 'mid', 8, 2, 11, 9.5,
   2, 72, 2, 1, 0, 0, 24000, 685, 28, 12000, 6000, 900,
   14000, 400, 280, 8, 82, 3200, 31, 1, 1, 0, 2400, 1800, false, true, 'BS_TEST'),
  ('BS_MATCH_TWO', '2099-02-06 12:00:00', 38, 'Red', 'Guess the Card United',
   'BS Player Two', 'NA1', 'Orianna', 'mid', 3, 5, 14, 3.4,
   0, 61, 1, 0, 0, 0, 18000, 473, 22, 15000, 7000, 1200,
   13200, 347, 250, 6.6, 76, 2900, 26, 0, 0, 1, 1700, 1100, false, false, 'BS_TEST'),
  ('BS_MATCH_ACADEMY', '2099-02-05 12:00:00', 31, 'Blue', 'Academy FC',
   'Academy Player', 'NA1', 'Syndra', 'mid', 6, 3, 9, 5,
   1, 67, 1, 0, 0, 0, 20000, 645, 25, 13000, 6500, 800,
   12500, 403, 220, 7.1, 70, 2700, 24, 1, 0, 0, 1900, 1300, false, true, 'BS_TEST');

insert into public.box_score_daily_candidates (
  puzzle_date, league, season, player_slug, player_name, player_tag, role, source_match_id
)
values ('2099-02-07', 'premier', 'BS_TEST', 'bs-player-one-na1', 'BS Player One', 'NA1', 'Mid', 'BS_MATCH_ONE');
insert into public.box_score_daily_puzzles (
  puzzle_date, league, season, answer_slug, target_stats, target_game_id, reset_at
)
values ('2099-02-07', 'premier', 'BS_TEST', 'bs-player-one-na1', '{}'::jsonb, 'BS_MATCH_ONE', '2099-02-08 00:00:00+00');

select public.ensure_box_score_daily_puzzle(
  '2099-02-08', 'premier', 'BS_TEST',
  jsonb_build_array(
    jsonb_build_object('player_slug', 'bs-player-one-na1', 'player_name', 'BS Player One', 'player_tag', 'NA1', 'role', 'Mid', 'source_match_id', 'BS_MATCH_ONE'),
    jsonb_build_object('player_slug', 'bs-player-two-na1', 'player_name', 'BS Player Two', 'player_tag', 'NA1', 'role', 'Mid', 'source_match_id', 'BS_MATCH_TWO')
  )
);
select ok(exists(select 1 from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'), 'Premier puzzle is frozen');
select is((select count(*)::int from public.box_score_daily_candidates where puzzle_date = '2099-02-08' and league = 'premier'), 2, 'Premier stores only its candidate labels');
select ok((select puzzle.target_stats ?& array['role', 'champion', 'kills', 'damageSharePct', 'csAt10', 'team', 'date', 'objectives'] from public.box_score_daily_puzzles puzzle where puzzle.puzzle_date = '2099-02-08' and puzzle.league = 'premier'), 'target stores staged game-stat fields, not internal raw columns');
select is((select target_game_id from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'), 'BS_MATCH_TWO', 'yesterday''s player is avoided when another eligible player exists');

select answer_slug from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'
\gset premier_before_
select public.ensure_box_score_daily_puzzle(
  '2099-02-08', 'premier', 'OTHER_SEASON',
  jsonb_build_array(jsonb_build_object('player_slug', 'replacement', 'player_name', 'Replacement', 'player_tag', 'NA1', 'role', 'Top', 'source_match_id', 'BS_MATCH_ONE'))
);
select is((select answer_slug from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'), :'premier_before_answer_slug', 'same date and league restores the frozen answer');

select public.ensure_box_score_daily_puzzle(
  '2099-02-08', 'academy', 'BS_TEST',
  jsonb_build_array(jsonb_build_object('player_slug', 'academy-player-na1', 'player_name', 'Academy Player', 'player_tag', 'NA1', 'role', 'Mid', 'source_match_id', 'BS_MATCH_ACADEMY'))
);
select ok(exists(select 1 from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'academy'), 'Academy puzzle is frozen separately');
select is((select count(*)::int from public.box_score_daily_candidates where puzzle_date = '2099-02-08' and league = 'academy'), 1, 'Academy candidate list does not include Premier rows');

select case when :'premier_before_answer_slug' = 'bs-player-one-na1' then 'bs-player-two-na1' else 'bs-player-one-na1' end as wrong_slug
\gset premier_
select * from public.record_box_score_guess(
  '2099-02-08', 'premier', '00000000-0000-0000-0000-000000008002', 'guess-the-card-0802', :'premier_wrong_slug'
)
\gset other_user_
select is(:'other_user_status'::text, 'playing', 'a second user gets independent Guess the Card progress');
select is((select count(*)::int from public.box_score_daily_progress where profile_id = '00000000-0000-0000-0000-000000008002' and puzzle_date = '2099-02-08' and league = 'premier'), 1, 'second user progress is stored separately');
select is((select reward_amount from public.box_score_daily_progress where profile_id = '00000000-0000-0000-0000-000000008002' and puzzle_date = '2099-02-08' and league = 'premier'), 0::bigint, 'second user does not inherit the first user reward');
select * from public.record_box_score_guess(
  '2099-02-08', 'premier', '00000000-0000-0000-0000-000000008001', 'guess-the-card-0801', :'premier_wrong_slug'
)
\gset wrong_
select is(:'wrong_correct'::boolean, false, 'wrong guess is evaluated server-side');
select is(:'wrong_guess_count'::int, 1, 'first wrong guess advances progress');
select is(:'wrong_status'::text, 'playing', 'first wrong guess leaves game active');

select * from public.record_box_score_guess(
  '2099-02-08', 'premier', '00000000-0000-0000-0000-000000008001', 'guess-the-card-0801', :'premier_before_answer_slug'
)
\gset correct_
select is(:'correct_correct'::boolean, true, 'correctness is calculated against the hidden answer');
select is(:'correct_status'::text, 'won', 'correct guess completes the game');
select is(:'correct_guess_count'::int, 2, 'correct guess preserves exact progress count');
select is(:'correct_reward_amount'::bigint, 200::bigint, 'Guess the Card claims the normal shared reward');
select is((select count(*)::int from public.daily_game_rewards where profile_id = '00000000-0000-0000-0000-000000008001' and puzzle_date = '2099-02-08'), 1, 'Guess the Card creates one shared reward claim');

select * from public.claim_daily_game_reward(
  '2099-02-08', '00000000-0000-0000-0000-000000008001', 'guess-the-card-0801', 'fpldle', 8001
)
\gset cross_game_
select is(:'cross_game_already_claimed'::boolean, true, 'another daily game sees the existing Guess the Card reward');
select is((select count(*)::int from public.betting_ledger where discord_id = 'guess-the-card-0801' and reason = 'daily_game_reward'), 1, 'cross-game completion does not pay twice');

select throws_ok($$
  select * from public.record_box_score_guess(
    '2099-02-08', 'premier', '00000000-0000-0000-0000-000000008001', 'guess-the-card-0801', 'bs-player-one-na1'
  )
$$, null, 'duplicate or post-completion guess is rejected');
select throws_ok($$
  insert into public.box_score_daily_progress (puzzle_date, league, profile_id, discord_id, guesses)
  values ('2099-02-08', 'academy', '00000000-0000-0000-0000-000000008002', 'guess-the-card-0802', array['a', 'b', 'c', 'd', 'e', 'f'])
$$, '23514', null, 'sixth guess cannot be stored in progress');

select public.reset_box_score_daily_puzzle('2099-02-08', 'premier');
select is((select status from public.box_score_daily_progress where profile_id = '00000000-0000-0000-0000-000000008001' and puzzle_date = '2099-02-08' and league = 'premier'), 'playing', 'admin reset reopens progress');
select is((select cardinality(guesses) from public.box_score_daily_progress where profile_id = '00000000-0000-0000-0000-000000008001' and puzzle_date = '2099-02-08' and league = 'premier'), 0, 'admin reset clears guesses');
select is((select count(*)::int from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'), 0, 'admin reset removes the frozen puzzle for testing');

select public.ensure_box_score_daily_puzzle(
  '2099-02-08', 'premier', 'BS_TEST',
  jsonb_build_array(
    jsonb_build_object('player_slug', 'bs-player-one-na1', 'player_name', 'BS Player One', 'player_tag', 'NA1', 'role', 'Mid', 'source_match_id', 'BS_MATCH_ONE'),
    jsonb_build_object('player_slug', 'bs-player-two-na1', 'player_name', 'BS Player Two', 'player_tag', 'NA1', 'role', 'Mid', 'source_match_id', 'BS_MATCH_TWO')
  )
);
select ok(exists(select 1 from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'), 'reset puzzle can be lazily recreated');
select answer_slug from public.box_score_daily_puzzles where puzzle_date = '2099-02-08' and league = 'premier'
\gset premier_after_
select * from public.record_box_score_guess(
  '2099-02-08', 'premier', '00000000-0000-0000-0000-000000008001', 'guess-the-card-0801', :'premier_after_answer_slug'
)
\gset replay_
select is(:'replay_already_rewarded'::boolean, true, 'reset replay keeps shared reward idempotent');
select is((select count(*)::int from public.betting_ledger where discord_id = 'guess-the-card-0801' and reason = 'daily_game_reward'), 1, 'reset replay does not add a second reward ledger row');

select * from finish();
rollback;
