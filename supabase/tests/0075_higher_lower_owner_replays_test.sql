begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'higher_lower_daily_runs'
     and column_name = 'owner_replay'),
  1::bigint,
  'daily runs record owner replay attempts'
);
select is(has_function_privilege('anon', 'public.start_higher_lower_owner_run(date,text,uuid,text)', 'execute'), false, 'anon cannot start owner runs');
select is(has_function_privilege('authenticated', 'public.start_higher_lower_owner_run(date,text,uuid,text)', 'execute'), false, 'authenticated cannot start owner runs');
select is(has_function_privilege('service_role', 'public.start_higher_lower_owner_run(date,text,uuid,text)', 'execute'), true, 'service role can start owner runs');
select is(has_function_privilege('anon', 'public._start_higher_lower_run(date,text,uuid,text,boolean)', 'execute'), false, 'anon cannot call the owner-aware helper');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000751', 'Higher Lower Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values
  ('higher-lower-0751', '00000000-0000-0000-0000-000000000751', 'Owner', 1000);

insert into public.higher_lower_daily_candidates (
  puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
)
values
  ('2099-02-02', 'premier', 'HL_OWNER', '2099-02-02', 'owner-low', 'Owner Low', 50, jsonb_build_object('slug', 'owner-low', 'name', 'Owner Low', 'overall', 50)),
  ('2099-02-02', 'premier', 'HL_OWNER', '2099-02-02', 'owner-mid', 'Owner Mid', 80, jsonb_build_object('slug', 'owner-mid', 'name', 'Owner Mid', 'overall', 80)),
  ('2099-02-02', 'premier', 'HL_OWNER', '2099-02-02', 'owner-high', 'Owner High', 95, jsonb_build_object('slug', 'owner-high', 'name', 'Owner High', 'overall', 95));

select * from public.start_higher_lower_owner_run(
  '2099-02-02', 'premier', '00000000-0000-0000-0000-000000000751', 'higher-lower-0751'
)
\gset owner_first_
select is(:'owner_first_run_state'::text, 'awaiting_choice'::text, 'owner replay starts a choice round');
select is(:'owner_first_owner_replay'::boolean, true, 'owner run is marked as a replay-capable attempt');

select * from public.start_higher_lower_owner_run(
  '2099-02-02', 'premier', '00000000-0000-0000-0000-000000000751', 'higher-lower-0751'
)
\gset owner_active_
select is((select count(*) from public.higher_lower_daily_runs
  where puzzle_date = '2099-02-02' and league = 'premier'
    and profile_id = '00000000-0000-0000-0000-000000000751'), 1::bigint,
  'starting again during an active owner run does not create a concurrent attempt');
select is(:'owner_active_id'::bigint, :'owner_first_id'::bigint, 'active owner replay returns the current run');

update public.higher_lower_daily_runs
set run_state = 'lost', completed_at = now(), round_expires_at = null, completion_reason = 'incorrect'
where id = :'owner_first_id'::bigint;

select * from public.start_higher_lower_owner_run(
  '2099-02-02', 'premier', '00000000-0000-0000-0000-000000000751', 'higher-lower-0751'
)
\gset owner_second_
select is(:'owner_second_run_state'::text, 'awaiting_choice'::text, 'owner can replay a completed run');
select ok(:'owner_second_id'::bigint <> :'owner_first_id'::bigint, 'owner replay preserves the completed attempt');
select is((select count(*) from public.higher_lower_daily_runs
  where puzzle_date = '2099-02-02' and league = 'premier'
    and profile_id = '00000000-0000-0000-0000-000000000751'), 2::bigint,
  'owner attempts remain available for best-score ranking');

select * from finish();
rollback;
