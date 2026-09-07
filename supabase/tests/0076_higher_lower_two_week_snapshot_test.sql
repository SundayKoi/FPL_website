begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

select is(has_function_privilege('anon', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), false, 'anon cannot freeze multi-week snapshots');
select is(has_function_privilege('authenticated', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), false, 'authenticated cannot freeze multi-week snapshots');
select is(has_function_privilege('service_role', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), true, 'service role can freeze multi-week snapshots');
select is(has_table_privilege('anon', 'public.higher_lower_daily_candidates', 'select'), false, 'anon cannot read hidden candidates');
select is(has_table_privilege('authenticated', 'public.higher_lower_daily_candidates', 'select'), false, 'authenticated cannot read hidden candidates');

insert into public.card_editions (season, edition_week, slug, player_name, role, overall, tier, card)
values
  ('HL76', '2099-02-09', 'repeat-player', 'Repeat Player', 'mid', 80, 'gold', jsonb_build_object('slug', 'repeat-player', 'name', 'Repeat Player', 'overall', 80)),
  ('HL76', '2099-02-09', 'newer-player', 'Newer Player', 'top', 92, 'diamond', jsonb_build_object('slug', 'newer-player', 'name', 'Newer Player', 'overall', 92)),
  ('HL76', '2099-01-30', 'repeat-player', 'Repeat Player — Older Card', 'mid', 72, 'silver', jsonb_build_object('slug', 'repeat-player', 'name', 'Repeat Player — Older Card', 'overall', 72)),
  ('HL76', '2099-01-30', 'older-player', 'Older Player', 'jungle', 45, 'bronze', jsonb_build_object('slug', 'older-player', 'name', 'Older Player', 'overall', 45));

select public.ensure_higher_lower_daily_candidates_weeks(
  '2099-02-10', 'premier', 'HL76', array['2099-02-09'::date, '2099-01-30'::date]
) as candidate_count
\gset snapshot_
select is(:'snapshot_candidate_count'::integer, 4, 'snapshot includes both archived weeks');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and edition_week = '2099-02-09'), 2::bigint,
  'newer archive cards are included');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and edition_week = '2099-01-30'), 2::bigint,
  'older archive cards are included');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-02-09:repeat-player'), 1::bigint,
  'newer repeated player keeps a week-specific identity');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-01-30:repeat-player'), 1::bigint,
  'older repeated player keeps a week-specific identity');
select is((select edition_week from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-02-09:repeat-player'),
  '2099-02-09'::date, 'candidate rows retain their card archive week');
select is((select player_name from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-01-30:repeat-player'),
  'Repeat Player — Older Card', 'older card data stays attached to its week');

select public.ensure_higher_lower_daily_candidates_weeks(
  '2099-02-10', 'premier', 'HL76', array['2099-02-09'::date, '2099-01-30'::date]
) as repeated_count
\gset repeated_
select is(:'repeated_repeated_count'::integer, 4, 'repeating the freeze is idempotent');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier'), 4::bigint,
  'repeating the freeze does not duplicate cards');

insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000761', 'Higher Lower Refresh');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('higher-lower-0761', '00000000-0000-0000-0000-000000000761', 'Refresh', 1000);

select * from public.start_higher_lower_run(
  '2099-02-10', 'premier', '00000000-0000-0000-0000-000000000761', 'higher-lower-0761'
)
\gset refreshed_run_
select is(:'refreshed_run_run_state'::text, 'awaiting_choice'::text, 'an existing run starts before the pool refresh');

-- A refresh after a new archive extends the existing date without rewriting
-- the two weeks that were already frozen. The run state machine continues to
-- refer to its original week-prefixed candidate identifiers.
insert into public.card_editions (season, edition_week, slug, player_name, role, overall, tier, card)
values
  ('HL76', '2099-02-17', 'repeat-player', 'Repeat Player — Newest Card', 'mid', 88, 'diamond', jsonb_build_object('slug', 'repeat-player', 'name', 'Repeat Player — Newest Card', 'overall', 88));

select public.ensure_higher_lower_daily_candidates_weeks(
  '2099-02-10', 'premier', 'HL76', array['2099-02-17'::date, '2099-02-09'::date]
) as additive_count
\gset additive_
select is(:'additive_additive_count'::integer, 5, 'a newly archived week is added to an existing daily pool');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier'), 5::bigint,
  'additive refresh preserves the existing candidate rows');
select is((select count(distinct edition_week) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier'), 3::bigint,
  'an existing date may temporarily contain three archived weeks');
select is((select overall from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-02-09:repeat-player'), 80,
  'additive refresh preserves a prior candidate rating');
select is((select card from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and player_slug = '2099-02-09:repeat-player'),
  jsonb_build_object('slug', 'repeat-player', 'name', 'Repeat Player', 'overall', 80),
  'additive refresh preserves a prior candidate card JSON');
select public.ensure_higher_lower_daily_candidates_weeks(
  '2099-02-10', 'premier', 'HL76', array['2099-02-17'::date, '2099-02-09'::date]
) as additive_retry_count
\gset additive_retry_
select is(:'additive_retry_additive_retry_count'::integer, 5, 'repeating an additive refresh is idempotent');
select is((select count(*) from public.higher_lower_daily_candidates
  where puzzle_date = '2099-02-10' and league = 'premier' and edition_week = '2099-02-17'), 1::bigint,
  'repeating an additive refresh does not duplicate the new week');

select case when reference.overall < challenger.overall then 'higher' else 'lower' end as choice
from public.higher_lower_daily_candidates reference
join public.higher_lower_daily_candidates challenger
  on challenger.puzzle_date = reference.puzzle_date and challenger.league = reference.league
where reference.puzzle_date = '2099-02-10'
  and reference.league = 'premier'
  and reference.player_slug = :'refreshed_run_reference_player_slug'
  and challenger.player_slug = :'refreshed_run_challenger_player_slug'
\gset refreshed_choice_

select * from public.submit_higher_lower_choice(
  '2099-02-10', 'premier', '00000000-0000-0000-0000-000000000761', 1, :'refreshed_choice_choice'
)
\gset after_refresh_
select is(:'after_refresh_run_state'::text, 'correct_reveal'::text, 'an existing run can submit after a pool refresh');

select * from public.advance_higher_lower_round(
  '2099-02-10', 'premier', '00000000-0000-0000-0000-000000000761', :'after_refresh_run_version'
)
\gset advanced_refresh_
select is(:'advanced_refresh_run_state'::text, 'awaiting_choice'::text, 'an ongoing run can advance after a pool refresh');

select * from finish();
rollback;
