begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is(has_function_privilege('anon', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), false, 'anon cannot start Premium runs');
select is(has_function_privilege('authenticated', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), false, 'authenticated cannot start Premium runs');
select is(has_function_privilege('service_role', 'public.start_higher_lower_run(date,text,uuid,text)', 'execute'), true, 'service role can start Premium runs');
select is(has_function_privilege('anon', 'public._start_higher_lower_run(date,text,uuid,text,boolean)', 'execute'), false, 'anon cannot call the replay-aware helper');

insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000781', 'Higher Lower Premium');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('higher-lower-0781', '00000000-0000-0000-0000-000000000781', 'Premium', 1000);

insert into public.higher_lower_daily_candidates (
  puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
)
values
  ('2099-02-03', 'premier', 'HL_PREMIUM', '2099-02-03', 'premium-low', 'Premium Low', 50, jsonb_build_object('slug', 'premium-low', 'name', 'Premium Low', 'overall', 50)),
  ('2099-02-03', 'premier', 'HL_PREMIUM', '2099-02-03', 'premium-mid', 'Premium Mid', 80, jsonb_build_object('slug', 'premium-mid', 'name', 'Premium Mid', 'overall', 80)),
  ('2099-02-03', 'premier', 'HL_PREMIUM', '2099-02-03', 'premium-high', 'Premium High', 95, jsonb_build_object('slug', 'premium-high', 'name', 'Premium High', 'overall', 95));

select * from public.start_higher_lower_run(
  '2099-02-03', 'premier', '00000000-0000-0000-0000-000000000781', 'higher-lower-0781'
)
\gset premium_first_
select is(:'premium_first_run_state'::text, 'awaiting_choice'::text, 'Premium member starts a choice round');
select is(:'premium_first_owner_replay'::boolean, true, 'Premium member attempt is marked for unlimited replay');

select * from public.start_higher_lower_run(
  '2099-02-03', 'premier', '00000000-0000-0000-0000-000000000781', 'higher-lower-0781'
)
\gset premium_active_
select is((select count(*) from public.higher_lower_daily_runs
  where puzzle_date = '2099-02-03' and league = 'premier'
    and profile_id = '00000000-0000-0000-0000-000000000781'), 1::bigint,
  'starting again during an active Premium run does not create a concurrent attempt');
select is(:'premium_active_id'::bigint, :'premium_first_id'::bigint, 'active Premium replay returns the current run');

update public.higher_lower_daily_runs
set run_state = 'lost', completed_at = now(), round_expires_at = null, completion_reason = 'incorrect'
where id = :'premium_first_id'::bigint;

select * from public.start_higher_lower_run(
  '2099-02-03', 'premier', '00000000-0000-0000-0000-000000000781', 'higher-lower-0781'
)
\gset premium_second_
select is(:'premium_second_run_state'::text, 'awaiting_choice'::text, 'Premium member can replay a completed run');
select ok(:'premium_second_id'::bigint <> :'premium_first_id'::bigint, 'Premium replay preserves the completed attempt');
select is((select count(*) from public.higher_lower_daily_runs
  where puzzle_date = '2099-02-03' and league = 'premier'
    and profile_id = '00000000-0000-0000-0000-000000000781'), 2::bigint,
  'Premium attempts remain available for best-score ranking');
select is((select owner_replay from public.higher_lower_daily_runs
  where id = :'premium_second_id'::bigint), true, 'replayed attempts carry the unlimited marker');

select * from finish();
rollback;
