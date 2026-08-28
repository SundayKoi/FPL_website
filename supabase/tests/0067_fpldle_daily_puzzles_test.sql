begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

select has_table('public', 'fpldle_daily_candidates', 'candidate snapshot table exists');
select has_table('public', 'fpldle_daily_puzzles', 'daily puzzle table exists');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fpldle_daily_candidates'::regclass
      and contype = 'p'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.fpldle_daily_candidates'::regclass and attname = 'puzzle_date'),
        (select attnum from pg_attribute where attrelid = 'public.fpldle_daily_candidates'::regclass and attname = 'league'),
        (select attnum from pg_attribute where attrelid = 'public.fpldle_daily_candidates'::regclass and attname = 'player_slug')
      ]::smallint[]
  ),
  'candidate key is date + league + player'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fpldle_daily_puzzles'::regclass
      and contype = 'p'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.fpldle_daily_puzzles'::regclass and attname = 'puzzle_date'),
        (select attnum from pg_attribute where attrelid = 'public.fpldle_daily_puzzles'::regclass and attname = 'league')
      ]::smallint[]
  ),
  'puzzle key is date + league'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fpldle_daily_puzzles'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like '%(puzzle_date, league, answer_slug)%'
  ),
  'puzzle answer references its candidate snapshot'
);
select ok((select relrowsecurity from pg_class where oid = 'public.fpldle_daily_candidates'::regclass), 'candidates use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.fpldle_daily_puzzles'::regclass), 'puzzles use RLS');
select is(has_table_privilege('anon', 'public.fpldle_daily_candidates', 'select'), false, 'anon cannot read candidate labels');
select is(has_table_privilege('authenticated', 'public.fpldle_daily_candidates', 'select'), true, 'authenticated can read candidate labels');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fpldle_daily_candidates'
      and policyname = 'fpldle_daily_candidates_admin_read'
      and 'authenticated' = any(roles)
      and qual like '%is_admin%'
  ),
  'candidate reads require site admin RLS'
);
select is(has_table_privilege('anon', 'public.fpldle_daily_puzzles', 'select'), false, 'anon cannot read answers');
select is(has_table_privilege('authenticated', 'public.fpldle_daily_puzzles', 'select'), false, 'authenticated cannot read answers');
select is(has_function_privilege('anon', 'public.ensure_fpldle_daily_puzzle(date,text,text,date,jsonb)', 'execute'), false, 'anon cannot create puzzles');
select is(has_function_privilege('authenticated', 'public.ensure_fpldle_daily_puzzle(date,text,text,date,jsonb)', 'execute'), false, 'authenticated cannot create puzzles');
select is(has_function_privilege('service_role', 'public.ensure_fpldle_daily_puzzle(date,text,text,date,jsonb)', 'execute'), true, 'service role can create puzzles');

select public.ensure_fpldle_daily_puzzle(
  '2026-08-27', 'premier', 'S99', '2026-08-24',
  '[
    {"player_slug":"repeat-player","player_name":"Repeat Player","player_tag":"NA1","team":"Alpha","position":"Top","champion":"Ahri","overall":80},
    {"player_slug":"yesterday-only","player_name":"Yesterday Only","player_tag":"NA1","team":"Bravo","position":"Mid","champion":"Orianna","overall":81}
  ]'::jsonb
);

select public.ensure_fpldle_daily_puzzle(
  '2026-08-28', 'premier', 'S99', '2026-08-24',
  '[
    {"player_slug":"repeat-player","player_name":"Repeat Player","player_tag":"NA1","team":"Alpha","position":"Top","champion":"Ahri","overall":80},
    {"player_slug":"new-player","player_name":"New Player","player_tag":"NA1","team":"Charlie","position":"Bot","champion":"Jinx","overall":82},
    {"player_slug":"incomplete-player","player_name":"Incomplete Player","player_tag":"NA1","team":"Charlie","position":"Bot","champion":null,"overall":82}
  ]'::jsonb
);

select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2026-08-28' and league = 'premier'), 2::bigint, 'only complete candidates enter snapshot');
select is((select count(*) from public.fpldle_daily_puzzles where puzzle_date = '2026-08-28' and league = 'premier'), 1::bigint, 'one Premier puzzle exists for the date');
select is((select answer_slug from public.fpldle_daily_puzzles where puzzle_date = '2026-08-28' and league = 'premier'), 'new-player', 'previous Premier answer is avoided when alternatives exist');

select public.ensure_fpldle_daily_puzzle(
  '2026-08-28', 'academy', 'A99', '2026-08-24',
  '[{"player_slug":"repeat-player","player_name":"Academy Player","player_tag":"NA1","team":"Academy","position":"Support","champion":"Lulu","overall":70}]'::jsonb
);
select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2026-08-28'), 3::bigint, 'Premier and Academy snapshots stay isolated');
select is((select answer_slug from public.fpldle_daily_puzzles where puzzle_date = '2026-08-28' and league = 'academy'), 'repeat-player', 'Academy selects only from its own pool');

select public.ensure_fpldle_daily_puzzle(
  '2026-08-28', 'premier', 'CHANGED', '2026-08-31',
  '[{"player_slug":"different-player","player_name":"Different Player","player_tag":"NA1","team":"Delta","position":"Jungle","champion":"Vi","overall":90}]'::jsonb
);
select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2026-08-28' and league = 'premier'), 2::bigint, 'repeated creation does not add candidates');
select is((select season from public.fpldle_daily_candidates where puzzle_date = '2026-08-28' and league = 'premier' and player_slug = 'repeat-player'), 'S99', 'repeated creation preserves first snapshot');
select is((select count(*) from public.fpldle_daily_puzzles where puzzle_date = '2026-08-28' and league = 'premier'), 1::bigint, 'repeated creation stays idempotent');
select is((select reset_at from public.fpldle_daily_puzzles where puzzle_date = '2026-08-28' and league = 'premier'), '2026-08-29 00:00:00+00'::timestamptz, 'reset is next UTC midnight');

set local role anon;
select throws_ok($$select answer_slug from public.fpldle_daily_puzzles$$, '42501', null, 'anon answer reads are denied by grant');
select throws_ok($$select player_name from public.fpldle_daily_candidates$$, '42501', null, 'anon candidate reads are denied by grant');

select * from finish();
rollback;
