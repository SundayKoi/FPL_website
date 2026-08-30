begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is(has_function_privilege('anon', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), false, 'anon cannot freeze multi-week snapshots');
select is(has_function_privilege('authenticated', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), false, 'authenticated cannot freeze multi-week snapshots');
select is(has_function_privilege('service_role', 'public.ensure_higher_lower_daily_candidates_weeks(date,text,text,date[])', 'execute'), true, 'service role can freeze multi-week snapshots');

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

select * from finish();
rollback;
