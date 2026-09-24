-- The road ahead is earned (expedition_road_ahead): a map fragment reveals a
-- run's road once, only for the run's owner while the squad is still
-- walking toward a checkpoint it has not reached, never for a road the
-- squad already holds (a campaign's) or one its convoy partner already
-- paid for, and the fragment and the row move together. Only the service
-- role spends; an owner can read their own reveals and nobody else's.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(24);

-- === fixture: three collectors ===============================================
-- Ann holds two fragments, Bo one, Cy has never found any (no supplies row).
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000a0133'::uuid, 'rv-ann', 'Ann'),
  ('00000000-0000-0000-0000-0000000b0133'::uuid, 'rv-bo', 'Bo'),
  ('00000000-0000-0000-0000-0000000c0133'::uuid, 'rv-cy', 'Cy');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('rv-ann', '00000000-0000-0000-0000-0000000a0133'::uuid, 'Ann', 1000),
  ('rv-bo', '00000000-0000-0000-0000-0000000b0133'::uuid, 'Bo', 1000),
  ('rv-cy', '00000000-0000-0000-0000-0000000c0133'::uuid, 'Cy', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select who, 'S_TEST_RV', who || '-' || n, 'Road Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', who || '-' || n)
from generate_series(1, 3) n, (values ('rv-ann'), ('rv-bo'), ('rv-cy')) w(who);

insert into public.expedition_supplies (discord_id, fragments) values ('rv-ann', 2), ('rv-bo', 1)
  on conflict on constraint expedition_supplies_pkey do update set fragments = excluded.fragments;

create or replace function tests.rv_squad(p_who text) returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_RV' and discord_id = p_who
$$;

-- A run inserted directly, as 0130 and 0132 do: the launch has suites of
-- its own, and the reveal only reads the row. `p_label` names it for the
-- lookups below, in a temporary table of its own.
create temporary table rv_runs (label text primary key, run_id bigint) on commit drop;

create or replace function tests.rv_run(
  p_label text, p_who text, p_tier text, p_forks int,
  p_started timestamptz, p_resolves timestamptz,
  p_claimed timestamptz default null, p_road jsonb default null
) returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into public.expedition_runs (discord_id, season, tier, squad, shine, started_at, resolves_at, forks, claimed_at, road, outcome)
  values (p_who, 'S_TEST_RV', p_tier, tests.rv_squad(p_who), 20, p_started, p_resolves, p_forks, p_claimed, p_road,
          case when p_claimed is not null then '{"grade": "solid", "dollars": 100}'::jsonb end)
  returning id into v_id;
  insert into rv_runs values (p_label, v_id);
  return v_id;
end;
$$;

create or replace function tests.rv(p_label text) returns bigint
language sql stable as $$ select run_id from rv_runs where label = p_label $$;

do $$
begin
  -- Ann's Legend Hunt, an hour out of 48: its first checkpoint opens at 12h.
  perform tests.rv_run('walking', 'rv-ann', 'legend', 3, now() - interval '1 hour', now() + interval '47 hours');
  -- Bo's own run, for the ownership check.
  perform tests.rv_run('bos', 'rv-bo', 'legend', 3, now() - interval '1 hour', now() + interval '47 hours');
  -- Ann's run already brought home.
  perform tests.rv_run('claimed', 'rv-ann', 'raid', 2, now() - interval '30 hours', now() - interval '6 hours', now() - interval '5 hours');
  -- Ann's rite: no checkpoints.
  perform tests.rv_run('rite', 'rv-ann', 'exorcism', 0, now() - interval '1 hour', now() + interval '5 hours');
  -- Ann's campaign run: the road was handed down.
  perform tests.rv_run('campaign', 'rv-ann', 'raid', 2, now() - interval '1 hour', now() + interval '23 hours', null, '["reactor", "ridge"]'::jsonb);
  -- Ann's run whose last checkpoint opened four hours ago (36h of 48).
  perform tests.rv_run('walked', 'rv-ann', 'legend', 3, now() - interval '40 hours', now() + interval '8 hours');
  -- Two more of Ann's and one of Cy's, for when the pouch is empty.
  perform tests.rv_run('broke', 'rv-ann', 'raid', 2, now() - interval '1 hour', now() + interval '23 hours');
  perform tests.rv_run('never', 'rv-cy', 'raid', 2, now() - interval '1 hour', now() + interval '23 hours');
end;
$$;

-- === 1-8. refusals before anything is spent ==================================
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('bos')) $$,
  'P0001', 'unknown run', 'another collector''s run is refused');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', 999999999) $$,
  'P0001', 'unknown run', 'a run that does not exist is refused');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('claimed')) $$,
  'P0001', 'already claimed', 'a squad already home has no road left to see');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('rite')) $$,
  'P0001', 'nothing to reveal', 'a run with no checkpoints has nothing to reveal');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('campaign')) $$,
  'P0001', 'road already known', 'a campaign''s road is already the squad''s map');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('walked')) $$,
  'P0001', 'road already walked', 'once the last checkpoint has opened every place is known');

select is((select fragments from public.expedition_supplies where discord_id = 'rv-ann'), 2,
  'no refusal spent a fragment');
select is((select count(*)::int from public.expedition_reveals v join rv_runs l on l.run_id = v.run_id), 0,
  'and none wrote a reveal');

-- === 9-12. the spend ==========================================================
-- Captured rather than called inline: an assertion that repeats its
-- operand would spend twice.
create temporary table rv_first on commit drop as
  select * from public.reveal_expedition_road('rv-ann', tests.rv('walking'));

select is((select fragments from rv_first), 1, 'the reveal answers with the fragments left');
select is((select fragments from public.expedition_supplies where discord_id = 'rv-ann'), 1, 'one fragment is spent');
select is((select discord_id from public.expedition_reveals where run_id = tests.rv('walking')), 'rv-ann',
  'the road is revealed, in the owner''s name');
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('walking')) $$,
  'P0001', 'already revealed', 'a road is paid for once');

-- === 13-16. a convoy walks one road ==========================================
-- Ann hosts, Bo rides along: one convoy, one road, one map.
do $$
declare
  v_convoy bigint;
  v_host   bigint := tests.rv_run('host', 'rv-ann', 'legend', 3, now() - interval '1 hour', now() + interval '47 hours');
  v_guest  bigint := tests.rv_run('guest', 'rv-bo', 'legend', 3, now() - interval '1 hour', now() + interval '47 hours');
begin
  insert into public.expedition_convoys (code, season, tier, host_id, host_run, guest_id, guest_run)
  values ('RVCNVY', 'S_TEST_RV', 'legend', 'rv-ann', v_host, 'rv-bo', v_guest)
  returning id into v_convoy;
  update public.expedition_runs set convoy = v_convoy where id in (v_host, v_guest);
end;
$$;

create temporary table rv_host on commit drop as
  select * from public.reveal_expedition_road('rv-ann', tests.rv('host'));
select is((select fragments from rv_host), 0, 'the host reveals the convoy''s road with her last fragment');
select throws_ok($$ select * from public.reveal_expedition_road('rv-bo', tests.rv('guest')) $$,
  'P0001', 'already revealed', 'the partner''s reveal is the same road: the guest is not charged for it');
select is((select fragments from public.expedition_supplies where discord_id = 'rv-bo'), 1, 'and keeps the fragment');
select is((select count(*)::int from public.expedition_reveals where run_id = tests.rv('guest')), 0, 'and writes no row of his own');

-- === 17-19. no fragment, no reveal ===========================================
select throws_ok($$ select * from public.reveal_expedition_road('rv-ann', tests.rv('broke')) $$,
  'P0001', 'not enough fragments', 'with the pouch empty the road stays dark');
select throws_ok($$ select * from public.reveal_expedition_road('rv-cy', tests.rv('never')) $$,
  'P0001', 'not enough fragments', 'a collector who never found a fragment has none to spend');
select is(
  (select count(*)::int from public.expedition_reveals where run_id in (tests.rv('broke'), tests.rv('never')))
    + (select count(*)::int from public.expedition_supplies where discord_id = 'rv-cy'),
  0,
  'nothing is written for a refused spend, not even an empty pouch');

-- === 20-22. only the service role spends =====================================
select ok(not has_function_privilege('anon', 'public.reveal_expedition_road(text, bigint)', 'execute'),
  'anon cannot reveal a road');
select ok(not has_function_privilege('authenticated', 'public.reveal_expedition_road(text, bigint)', 'execute'),
  'authenticated cannot reveal a road — the server action spends on the caller''s behalf');
select ok(has_function_privilege('service_role', 'public.reveal_expedition_road(text, bigint)', 'execute'),
  'service_role can');

-- === 23-24. owners read their own reveals ====================================
select tests.acting_as('00000000-0000-0000-0000-0000000a0133'::uuid);
set local role authenticated;
select is((select count(*)::int from public.expedition_reveals), 2, 'Ann reads her two reveals');
reset role;

select tests.acting_as('00000000-0000-0000-0000-0000000b0133'::uuid);
set local role authenticated;
select is((select count(*)::int from public.expedition_reveals), 0, 'Bo reads none of hers');
reset role;

select * from finish();
rollback;
