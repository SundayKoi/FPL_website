begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conname = 'higher_lower_daily_runs_run_score_check'
     and conrelid = 'public.higher_lower_daily_runs'::regclass) like '%45%',
  'daily run scores allow 45 correct answers'
);
select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conname = 'higher_lower_daily_runs_round_number_check'
     and conrelid = 'public.higher_lower_daily_runs'::regclass) like '%45%',
  'daily run rounds allow round 45'
);
select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conname = 'higher_lower_weekly_settlements_top_score_check'
     and conrelid = 'public.higher_lower_weekly_settlements'::regclass) like '%45%',
  'weekly top scores allow 45'
);
select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conname = 'higher_lower_weekly_payouts_winning_score_check'
     and conrelid = 'public.higher_lower_weekly_payouts'::regclass) like '%45%',
  'weekly winning scores allow 45'
);

insert into public.higher_lower_daily_candidates (
  puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
)
values
  ('2099-03-02', 'premier', 'HL45', '2099-03-02', 'hl-45-reference', 'Reference', 80, jsonb_build_object('slug', 'hl-45-reference', 'overall', 80)),
  ('2099-03-02', 'premier', 'HL45', '2099-03-02', 'hl-45-band', 'Band Match', 84, jsonb_build_object('slug', 'hl-45-band', 'overall', 84)),
  ('2099-03-02', 'premier', 'HL45', '2099-03-02', 'hl-45-challenger', 'Challenger', 81, jsonb_build_object('slug', 'hl-45-challenger', 'overall', 81));

select is(
  public._higher_lower_pick_challenger(
    '2099-03-02', 'premier', 45, 45, 'hl-45-reference', 80,
    array['hl-45-reference']::text[], 0, 0
  ),
  'hl-45-band',
  'round 45 keeps the existing four-to-nine OVR gap band'
);
select throws_ok(
  $$select public._higher_lower_pick_challenger(
    '2099-03-02', 'premier', 45, 46, 'hl-45-reference', 80,
    array['hl-45-reference']::text[], 0, 0
  )$$,
  'P0001', 'HIGHER_LOWER_INVALID_ROUND', 'challenger selection rejects round 46'
);

insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000777', 'Higher Lower Forty Five');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('higher-lower-0777', '00000000-0000-0000-0000-000000000777', 'Forty Five', 1000);
insert into public.higher_lower_daily_runs (
  puzzle_date, league, profile_id, discord_id, random_seed, run_state,
  run_score, reference_player_slug, challenger_player_slug, recent_player_history,
  round_number, run_version, started_at, round_expires_at
)
values (
  '2099-03-02', 'premier', '00000000-0000-0000-0000-000000000777', 'higher-lower-0777', 45,
  'awaiting_choice', 44, 'hl-45-reference', 'hl-45-challenger', array['hl-45-reference']::text[],
  45, 1, now(), now() + interval '20 seconds'
);

select * from public.submit_higher_lower_choice(
  '2099-03-02', 'premier', '00000000-0000-0000-0000-000000000777', 1, 'higher'
)
\gset perfect_
select is(:'perfect_run_score'::integer, 45, 'round 45 completes with score 45');
select is(:'perfect_run_state'::text, 'perfect', 'score 45 enters the perfect state');
select is(:'perfect_completion_reason'::text, 'perfect', 'score 45 records a perfect completion');

select * from finish();
rollback;
