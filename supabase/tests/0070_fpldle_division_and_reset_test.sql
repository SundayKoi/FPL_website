begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select has_column('public', 'fpldle_daily_candidates', 'team_logo_url', 'candidate snapshots store frozen team logos');
select has_column('public', 'fpldle_daily_candidates', 'division', 'candidate snapshots store divisions');
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fpldle_daily_candidates'::regclass
      and conname = 'fpldle_daily_candidates_division_check'
  ),
  'candidate divisions are limited to Solari and Lunari'
);
select has_function('public', 'reset_fpldle_daily_puzzle', array['date', 'text'], 'reset RPC exists');
select is(has_function_privilege('service_role', 'public.reset_fpldle_daily_puzzle(date,text)', 'execute'), true, 'service role can reset puzzles');
select is(has_function_privilege('anon', 'public.reset_fpldle_daily_puzzle(date,text)', 'execute'), false, 'anon cannot reset puzzles');

select public.ensure_fpldle_daily_puzzle(
  '2099-01-02', 'premier', 'S99', '2098-12-29',
  '[
    {"player_slug":"division-one","player_name":"Division One","player_tag":"NA1","team":"Alpha","team_logo_url":"https://example.com/alpha.png","position":"Top","champion":"Ahri","overall":80,"division":"Solari"},
    {"player_slug":"division-two","player_name":"Division Two","player_tag":"NA1","team":"Beta","team_logo_url":null,"position":"Jungle","champion":"Vi","overall":81,"division":"Lunari"}
  ]'::jsonb
);

select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2099-01-02' and league = 'premier'), 2::bigint, 'reset test snapshot contains both candidates');
select is((select team_logo_url from public.fpldle_daily_candidates where puzzle_date = '2099-01-02' and league = 'premier' and player_slug = 'division-one'), 'https://example.com/alpha.png', 'team logo is snapshotted');
select is((select division from public.fpldle_daily_candidates where puzzle_date = '2099-01-02' and league = 'premier' and player_slug = 'division-two'), 'Lunari', 'division is snapshotted');

select public.ensure_fpldle_daily_puzzle(
  '2099-01-02', 'premier', 'CHANGED', '2099-01-05',
  '[{"player_slug":"different-player","player_name":"Different Player","player_tag":"NA1","team":"Gamma","team_logo_url":null,"position":"Mid","champion":"Orianna","overall":90,"division":"Solari"}]'::jsonb
);
select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2099-01-02' and league = 'premier'), 2::bigint, 'repeated creation remains idempotent');

select public.reset_fpldle_daily_puzzle('2099-01-02', 'premier');
select is((select count(*) from public.fpldle_daily_puzzles where puzzle_date = '2099-01-02' and league = 'premier'), 0::bigint, 'reset removes the puzzle row');
select is((select count(*) from public.fpldle_daily_candidates where puzzle_date = '2099-01-02' and league = 'premier'), 0::bigint, 'reset removes only that snapshot');

set local role anon;
select throws_ok($$select public.reset_fpldle_daily_puzzle('2099-01-02', 'premier')$$, '42501', null, 'anon reset calls are denied');

select * from finish();
rollback;
