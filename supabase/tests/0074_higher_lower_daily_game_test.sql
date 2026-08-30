begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

select has_table('public', 'higher_lower_daily_candidates', 'daily candidate snapshots exist');
select has_table('public', 'higher_lower_daily_runs', 'daily run state exists');
select has_table('public', 'higher_lower_weekly_settlements', 'weekly settlements exist');
select has_table('public', 'higher_lower_weekly_payouts', 'weekly payouts exist');
select ok((select relrowsecurity from pg_class where oid = 'public.higher_lower_daily_candidates'::regclass), 'candidate snapshots use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.higher_lower_daily_runs'::regclass), 'daily runs use RLS');
select is(has_table_privilege('anon', 'public.higher_lower_daily_candidates', 'select'), false, 'anon cannot read candidate snapshots');
select is(has_table_privilege('authenticated', 'public.higher_lower_daily_runs', 'select'), false, 'authenticated cannot read daily runs');
select is(has_function_privilege('anon', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), false, 'anon cannot start runs');
select is(has_function_privilege('authenticated', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), false, 'authenticated cannot start runs');
select is(has_function_privilege('service_role', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), true, 'service role can start runs');
select is(has_function_privilege('service_role', 'public.submit_higher_lower_choice(date,text,uuid,integer,text)', 'execute'), true, 'service role can submit choices');
select is(has_function_privilege('service_role', 'public.advance_higher_lower_round(date,text,uuid,integer)', 'execute'), true, 'service role can advance rounds');
select is(has_function_privilege('service_role', 'public.settle_higher_lower_week(date)', 'execute'), true, 'service role can settle weeks');

select throws_ok(
  $$select * from public.settle_higher_lower_week('2099-01-06')$$,
  null, null, 'settlement rejects a non-Monday UTC date'
);

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000741', 'Higher Lower One'),
  ('00000000-0000-0000-0000-000000000742', 'Higher Lower Two'),
  ('00000000-0000-0000-0000-000000000743', 'Higher Lower Three');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values
  ('higher-lower-0741', '00000000-0000-0000-0000-000000000741', 'One', 1000),
  ('higher-lower-0742', '00000000-0000-0000-0000-000000000742', 'Two', 1000),
  ('higher-lower-0743', '00000000-0000-0000-0000-000000000743', 'Three', 1000);

insert into public.card_editions (season, edition_week, slug, player_name, role, overall, tier, card)
values
  ('HL99', '2099-01-05', 'hl-lower-1', 'Lower One', 'mid', 10, 'bronze', jsonb_build_object('slug', 'hl-lower-1', 'name', 'Lower One', 'overall', 10)),
  ('HL99', '2099-01-05', 'hl-lower-2', 'Lower Two', 'mid', 20, 'silver', jsonb_build_object('slug', 'hl-lower-2', 'name', 'Lower Two', 'overall', 20)),
  ('HL99', '2099-01-05', 'hl-mid-1', 'Middle One', 'mid', 40, 'gold', jsonb_build_object('slug', 'hl-mid-1', 'name', 'Middle One', 'overall', 40)),
  ('HL99', '2099-01-05', 'hl-mid-2', 'Middle Two', 'mid', 50, 'gold', jsonb_build_object('slug', 'hl-mid-2', 'name', 'Middle Two', 'overall', 50)),
  ('HL99', '2099-01-05', 'hl-high-1', 'High One', 'mid', 80, 'diamond', jsonb_build_object('slug', 'hl-high-1', 'name', 'High One', 'overall', 80)),
  ('HL99', '2099-01-05', 'hl-high-2', 'High Two', 'mid', 95, 'master', jsonb_build_object('slug', 'hl-high-2', 'name', 'High Two', 'overall', 95));

select public.ensure_higher_lower_daily_candidates('2099-01-05', 'premier', 'HL99', '2099-01-05') as candidate_count
\gset premier_snapshot_
select is(:'premier_snapshot_candidate_count'::integer, 6, 'Premier snapshot copies the full frozen pool');

select public.ensure_higher_lower_daily_candidates('2099-01-05', 'academy', 'HL99', '2099-01-05') as candidate_count
\gset academy_snapshot_
select is(:'academy_snapshot_candidate_count'::integer, 6, 'Academy snapshot is separate from Premier');

update public.card_editions
set player_name = 'Changed Source Name', overall = 99,
    card = jsonb_build_object('slug', 'hl-lower-1', 'name', 'Changed Source Name', 'overall', 99)
where season = 'HL99' and edition_week = '2099-01-05' and slug = 'hl-lower-1';

select public.ensure_higher_lower_daily_candidates('2099-01-05', 'premier', 'HL99', '2099-01-06') as candidate_count
\gset repeated_snapshot_
select is(:'repeated_snapshot_candidate_count'::integer, 6, 'repeating a date and league never refreshes the snapshot');
select is(
  (select player_name from public.higher_lower_daily_candidates
   where puzzle_date = '2099-01-05' and league = 'premier' and player_slug = 'hl-lower-1'),
  'Lower One', 'snapshot keeps the original name');
select is(
  (select overall from public.higher_lower_daily_candidates
   where puzzle_date = '2099-01-05' and league = 'premier' and player_slug = 'hl-lower-1'),
  10, 'snapshot keeps the original OVR');

select * from public.start_higher_lower_run(
  '2099-01-05', 'premier', '00000000-0000-0000-0000-000000000741', 'higher-lower-0741'
)
\gset start_
select is(:'start_run_state'::text, 'awaiting_choice'::text, 'starting creates an awaiting-choice round');
select is(:'start_run_score'::integer, 0, 'a new run starts at zero');
select is(:'start_round_number'::integer, 1, 'a new run starts at round one');
select is(:'start_run_version'::integer, 1, 'a new run starts with version one');
select ok(
  abs((select overall from public.higher_lower_daily_candidates where puzzle_date = '2099-01-05' and league = 'premier' and player_slug = :'start_reference_player_slug')
    - (select overall from public.higher_lower_daily_candidates where puzzle_date = '2099-01-05' and league = 'premier' and player_slug = :'start_challenger_player_slug')) >= 30,
  'first challenger uses the 30-plus difficulty band'
);

select is(
  public._higher_lower_pick_challenger(
    '2099-01-05', 'premier', 7, 6, 'hl-mid-2', 50,
    array['hl-lower-2', 'hl-high-1']::text[], 1, 0
  ),
  'hl-lower-2',
  'cooldown fallback permits the oldest recent card only after the band is exhausted'
);
select is(
  public._higher_lower_pick_challenger(
    '2099-01-05', 'premier', 7, 6, 'hl-high-2', 95,
    array['hl-high-2']::text[], 0, 1
  ),
  'hl-high-1',
  'empty band widens outward one OVR point at a time'
);

select * from public.submit_higher_lower_choice(
  '2099-01-05', 'premier', '00000000-0000-0000-0000-000000000741', 0, 'higher'
)
\gset stale_
select is(:'stale_run_state'::text, 'awaiting_choice'::text, 'stale choice returns authoritative state');
select is(:'stale_run_version'::integer, 1, 'stale choice does not advance the version');

select case when challenger.overall > reference.overall then 'higher' else 'lower' end as choice
from public.higher_lower_daily_candidates reference
join public.higher_lower_daily_candidates challenger
  on challenger.puzzle_date = reference.puzzle_date and challenger.league = reference.league
where reference.puzzle_date = '2099-01-05'
  and reference.league = 'premier'
  and reference.player_slug = :'start_reference_player_slug'
  and challenger.player_slug = :'start_challenger_player_slug'
\gset answer_

select * from public.submit_higher_lower_choice(
  '2099-01-05', 'premier', '00000000-0000-0000-0000-000000000741', 1, :'answer_choice'
)
\gset correct_
select is(:'correct_run_state'::text, 'correct_reveal'::text, 'correct choice enters the reveal state');
select is(:'correct_run_score'::integer, 1, 'correct choice increments score once');
select is(:'correct_run_version'::integer, 2, 'correct choice advances version once');
select ok((select round_expires_at is null from public.higher_lower_daily_runs where id = :'correct_id'), 'reveal state has no active timer');

select * from public.advance_higher_lower_round(
  '2099-01-05', 'premier', '00000000-0000-0000-0000-000000000741', 2
)
\gset advance_
select is(:'advance_run_state'::text, 'awaiting_choice'::text, 'Next Card starts a fresh choice round');
select is(:'advance_round_number'::integer, 2, 'Next Card advances to round two');
select is(:'advance_run_version'::integer, 3, 'Next Card advances version once');
select ok(:'advance_round_expires_at'::timestamptz > now(), 'new choice round has a server expiry');

select * from public.submit_higher_lower_choice(
  '2099-01-05', 'premier', '00000000-0000-0000-0000-000000000741', 3, 'timeout'
)
\gset timeout_
select is(:'timeout_run_state'::text, 'lost'::text, 'timeout ends the run');
select is(:'timeout_completion_reason'::text, 'timeout'::text, 'timeout records its completion reason');

select * from public.start_higher_lower_run(
  '2099-01-05', 'academy', '00000000-0000-0000-0000-000000000741', 'higher-lower-0741'
);
select is((select count(*) from public.higher_lower_daily_runs
  where puzzle_date = '2099-01-05' and profile_id = '00000000-0000-0000-0000-000000000741'), 2::bigint,
  'one member can have one run per league on the same UTC date');

insert into public.higher_lower_daily_runs (
  puzzle_date, league, profile_id, discord_id, random_seed, run_state,
  run_score, round_number, run_version, completed_at, completion_reason
)
values
  ('2099-01-06', 'premier', '00000000-0000-0000-0000-000000000742', 'higher-lower-0742', 2, 'lost', 3, 3, 1, now(), 'incorrect'),
  ('2099-01-07', 'academy', '00000000-0000-0000-0000-000000000743', 'higher-lower-0743', 3, 'lost', 3, 3, 1, now(), 'incorrect'),
  ('2099-01-08', 'academy', '00000000-0000-0000-0000-000000000741', 'higher-lower-0741', 4, 'lost', 3, 3, 1, now(), 'incorrect');

select * from public.settle_higher_lower_week('2099-01-05')
\gset settlement_
select is(:'settlement_top_score'::integer, 3, 'settlement uses the best combined-league run score');
select is(:'settlement_winner_count'::integer, 3, 'tied top scores produce three winners');
select is((select count(*) from public.higher_lower_weekly_payouts), 3::bigint, 'one payout is written per winner');
select is((select sum(award_amount)::bigint from public.higher_lower_weekly_payouts), 2000::bigint, 'remainder distribution pays exactly the fixed 2000 pool');
select is((select count(*) from public.higher_lower_weekly_payouts where award_amount = 667), 2::bigint, 'two winners receive the rounded-up split dollar');
select is((select count(*) from public.higher_lower_weekly_payouts where award_amount = 666), 1::bigint, 'one winner receives the rounded-down split dollar');
select is((select count(*) from public.betting_ledger where reason = 'higher_lower_weekly'), 3::bigint, 'weekly payout ledger rows are written exactly once');

select * from public.settle_higher_lower_week('2099-01-05')
\gset settlement_retry_
select is(:'settlement_retry_top_score'::integer, 3, 'settlement retry returns the recorded result');
select is((select count(*) from public.higher_lower_weekly_payouts), 3::bigint, 'settlement retry does not duplicate payouts');

select * from finish();
rollback;
