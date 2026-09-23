-- The atlas (expedition_atlas): a landmark is named after the first
-- collector whose claimed run stamped the place, once per season, and only
-- from places that run's own stamp lists; a road award pays once per
-- (collector, season, route) and only when the season's stamped places
-- cover the whole road. Only the service role writes either; everyone
-- reads the landmarks, owners read their own awards.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(37);

-- === fixture: three collectors in two leagues ================================
-- S_TEST_AT is the Premier season, A_TEST_AT the Academy's.
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000a0134'::uuid, 'at-ann', 'Ann'),
  ('00000000-0000-0000-0000-0000000b0134'::uuid, 'at-bo', 'Bo'),
  ('00000000-0000-0000-0000-0000000c0134'::uuid, 'at-cy', 'Cy');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('at-ann', '00000000-0000-0000-0000-0000000a0134'::uuid, 'Ann', 1000),
  ('at-bo', '00000000-0000-0000-0000-0000000b0134'::uuid, 'Bo', 1000),
  ('at-cy', '00000000-0000-0000-0000-0000000c0134'::uuid, 'Cy', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select who, 'S_TEST_AT', who || '-' || n, 'Atlas Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', who || '-' || n)
from generate_series(1, 3) n, (values ('at-ann'), ('at-bo'), ('at-cy')) w(who);

insert into public.expedition_supplies (discord_id, fragments) values ('at-ann', 1)
  on conflict on constraint expedition_supplies_pkey do update set fragments = excluded.fragments;

create or replace function tests.at_squad(p_who text) returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_AT' and discord_id = p_who
$$;

-- Runs inserted directly, as 0130 and 0133 do: the claim has suites of its
-- own, and both RPCs only read the row. `p_places` is the stamp the claim
-- writes into outcome.atlas; null writes an outcome without one (a run
-- claimed before the atlas shipped).
create temporary table at_runs (label text primary key, run_id bigint) on commit drop;

create or replace function tests.at_run(
  p_label text, p_who text, p_season text, p_tier text,
  p_places text[], p_claimed boolean default true
) returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into public.expedition_runs (discord_id, season, tier, squad, shine, started_at, resolves_at, forks, claimed_at, outcome)
  values (
    p_who, p_season, p_tier, tests.at_squad(p_who), 20,
    now() - interval '3 days', now() - interval '1 day', coalesce(array_length(p_places, 1), 0),
    case when p_claimed then now() - interval '20 hours' end,
    case
      when not p_claimed and p_places is null then null
      when p_places is null then '{"grade": "solid", "dollars": 100}'::jsonb
      else jsonb_build_object('grade', 'solid', 'dollars', 100,
             'atlas', jsonb_build_object('places', to_jsonb(p_places), 'encounters', '[]'::jsonb, 'ghosts', '[]'::jsonb))
    end
  )
  returning id into v_id;
  insert into at_runs values (p_label, v_id);
  return v_id;
end;
$$;

create or replace function tests.at(p_label text) returns bigint
language sql stable as $$ select run_id from at_runs where label = p_label $$;

do $$
begin
  -- Ann's Legend Hunt road, walked two thirds of the way this season.
  perform tests.at_run('ann-1', 'at-ann', 'S_TEST_AT', 'legend', array['shaft', 'village', 'vault']);
  perform tests.at_run('ann-2', 'at-ann', 'S_TEST_AT', 'legend', array['chapel', 'belltower', 'throne']);
  -- Her third squad is still out.
  perform tests.at_run('ann-3', 'at-ann', 'S_TEST_AT', 'legend', null, false);
  -- A run she brought home before the atlas: no stamp.
  perform tests.at_run('ann-old', 'at-ann', 'S_TEST_AT', 'legend', null);
  -- Her Academy run, the other league's road.
  perform tests.at_run('ann-academy', 'at-ann', 'A_TEST_AT', 'legend', array['shaft', 'chapel', 'furnaces']);
  -- Bo walks the same road a little later.
  perform tests.at_run('bo-1', 'at-bo', 'S_TEST_AT', 'legend', array['shaft', 'chapel', 'furnaces']);
end;
$$;

-- === 1-3. the sizes and the rewards ==========================================
select results_eq(
  $$ select t, public.expedition_road_size(t) from unnest(array['scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'mythic']) t $$,
  $$ values ('scout', 4), ('gilded', 6), ('raid', 6), ('legend', 9), ('rescue', 3), ('exorcism', 0), ('legendary', 12), ('mythic', 10) $$,
  'every route''s road holds the places routes.ts draws from');
select results_eq(
  $$ select t, r.fragments, r.comp from unnest(array['scout', 'gilded', 'raid', 'legend', 'rescue', 'exorcism', 'legendary', 'mythic']) t,
            lateral public.expedition_road_reward(t) r $$,
  $$ values ('scout', 1, false), ('gilded', 1, false), ('raid', 1, false), ('legend', 2, false), ('rescue', 1, false),
            ('exorcism', 0, false), ('legendary', 2, true), ('mythic', 3, false) $$,
  'and walking the whole of it pays fragments, and the Legendary route a pack');
select ok(public.expedition_road_size('lost') is null and not exists (select 1 from public.expedition_road_reward('lost')),
  'a lost card''s hold is not a route');

-- === 4-8. naming refuses what the run did not walk ===========================
select throws_ok($$ select * from public.name_expedition_landmarks('at-bo', tests.at('ann-1'), array['shaft']) $$,
  'P0001', 'unknown run', 'another collector''s run names nothing');
select throws_ok($$ select * from public.name_expedition_landmarks('at-ann', tests.at('ann-3'), array['sleeper']) $$,
  'P0001', 'run not claimed', 'a squad still out has not reached anywhere yet');
select throws_ok($$ select * from public.name_expedition_landmarks('at-ann', tests.at('ann-1'), array['shaft', 'throne']) $$,
  'P0001', 'places not walked', 'a place the run''s stamp does not list is refused, with the rest of the call');
select throws_ok($$ select * from public.name_expedition_landmarks('at-ann', tests.at('ann-old'), array['shaft']) $$,
  'P0001', 'places not walked', 'a run without a stamp cannot vouch for any place');
select is((select count(*)::int from public.expedition_landmarks where season in ('S_TEST_AT', 'A_TEST_AT')), 0,
  'no refusal named anything');

-- === 9-14. first claim wins ==================================================
-- Captured rather than called inline: an assertion that repeats its
-- operand would name twice.
create temporary table at_ann_named on commit drop as
  select * from public.name_expedition_landmarks('at-ann', tests.at('ann-1'), array['shaft', 'village', 'vault']);
select is((select count(*)::int from at_ann_named), 3, 'Ann is first to all three of her places');
select is(
  (select discord_id || ' ' || run_id::text from public.expedition_landmarks where season = 'S_TEST_AT' and place = 'shaft'),
  'at-ann ' || tests.at('ann-1')::text,
  'the landmark carries her name and the run that reached it');
select is(
  (select reached_at from public.expedition_landmarks where season = 'S_TEST_AT' and place = 'vault'),
  (select claimed_at from public.expedition_runs where id = tests.at('ann-1')),
  'reached when that squad came home');

create temporary table at_bo_named on commit drop as
  select * from public.name_expedition_landmarks('at-bo', tests.at('bo-1'), array['shaft', 'chapel', 'furnaces']);
select is((select array_agg(place order by place) from at_bo_named), array['chapel', 'furnaces'],
  'Bo names only the places nobody reached before him');
select is((select discord_id from public.expedition_landmarks where season = 'S_TEST_AT' and place = 'shaft'), 'at-ann',
  'the shaft stays Ann''s');
select is((select count(*)::int from public.name_expedition_landmarks('at-ann', tests.at('ann-1'), array['shaft', 'village', 'vault'])), 0,
  'naming the same places again creates nothing');

-- === 15-16. one landmark per place per league ================================
create temporary table at_academy_named on commit drop as
  select * from public.name_expedition_landmarks('at-ann', tests.at('ann-academy'), array['shaft', 'chapel', 'furnaces']);
select is((select count(*)::int from at_academy_named), 3,
  'the Academy''s shaft is its own landmark: the Premier league''s namer does not hold it');
select is((select season from at_academy_named limit 1), 'A_TEST_AT',
  'the landmark takes its season from the run that reached it');

-- === 17-19. a road not yet walked end to end =================================
select throws_ok($$ select * from public.award_expedition_road('at-ann', 'S_TEST_AT', 'legend') $$,
  'P0001', 'road not complete', 'six of nine places is not the road');
select throws_ok($$ select * from public.award_expedition_road('at-ann', 'A_TEST_AT', 'legend') $$,
  'P0001', 'road not complete', 'and the other league''s places do not count toward it');
select is((select count(*)::int from public.expedition_atlas_awards where discord_id = 'at-ann'), 0,
  'no award written for a refusal');

-- === 20-25. the road walked, paid once =======================================
update public.expedition_runs
  set claimed_at = now() - interval '1 hour',
      outcome = jsonb_build_object('grade', 'solid', 'dollars', 100,
        'atlas', jsonb_build_object('places', '["furnaces", "checkpoint", "sleeper"]'::jsonb, 'encounters', '[]'::jsonb, 'ghosts', '[]'::jsonb))
  where id = tests.at('ann-3');

create temporary table at_award on commit drop as
  select * from public.award_expedition_road('at-ann', 'S_TEST_AT', 'legend');
select is((select awarded from at_award), true, 'the ninth place completes the Legend Hunt');
select is((select fragments from at_award), 2, 'and says what it paid');
select is((select fragments from public.expedition_supplies where discord_id = 'at-ann'), 3, 'two fragments land in the pouch');
select is(
  (select fragments::text || ' ' || comp::text from public.expedition_atlas_awards where discord_id = 'at-ann' and season = 'S_TEST_AT' and tier = 'legend'),
  '2 false',
  'the award is recorded for that season and route');

create temporary table at_again on commit drop as
  select * from public.award_expedition_road('at-ann', 'S_TEST_AT', 'legend');
select is((select awarded::text || ' ' || fragments::text from at_again), 'false 0', 'a second call pays nothing');
select is((select fragments from public.expedition_supplies where discord_id = 'at-ann'), 3, 'and the pouch is unchanged');

-- === 26-28. the Legendary route pays a pack too ==============================
do $$
begin
  perform tests.at_run('cy-1', 'at-cy', 'S_TEST_AT', 'legendary', array['threshold', 'choir', 'rift', 'table']);
  perform tests.at_run('cy-2', 'at-cy', 'S_TEST_AT', 'legendary', array['stairs', 'mirrors', 'sky', 'home']);
  perform tests.at_run('cy-3', 'at-cy', 'S_TEST_AT', 'legendary', array['doors', 'singing', 'tide', 'keeper']);
end;
$$;

create temporary table at_cy_award on commit drop as
  select * from public.award_expedition_road('at-cy', 'S_TEST_AT', 'legendary');
select is((select awarded::text || ' ' || fragments::text from at_cy_award), 'true 2', 'twelve places complete the Legendary route');
select is((select fragments from public.expedition_supplies where discord_id = 'at-cy'), 2,
  'the fragments open a pouch for a collector who never had one');
select is((select remaining from public.card_pack_comps where discord_id = 'at-cy' and kind = 'standard'), 1,
  'and a free pack is waiting');

-- === 29-31. what never counts ================================================
-- Bo's squad still out carries a stamp it should not have yet: an
-- unclaimed run's places are not walked.
select tests.at_run('bo-out', 'at-bo', 'S_TEST_AT', 'legend', array['village', 'checkpoint', 'belltower', 'vault', 'throne', 'sleeper'], false);
select throws_ok($$ select * from public.award_expedition_road('at-bo', 'S_TEST_AT', 'legend') $$,
  'P0001', 'road not complete', 'places on a run not yet claimed do not count');
select throws_ok($$ select * from public.award_expedition_road('at-ann', 'S_TEST_AT', 'exorcism') $$,
  'P0001', 'no road', 'a rite has no road to walk');
select throws_ok($$ select * from public.award_expedition_road('at-ann', 'S_TEST_AT', 'lost') $$,
  'P0001', 'unknown tier', 'a hold is not a route');

-- === 32-34. only the service role writes =====================================
select ok(
  not has_function_privilege('authenticated', 'public.name_expedition_landmarks(text, bigint, text[])', 'execute')
    and not has_function_privilege('anon', 'public.name_expedition_landmarks(text, bigint, text[])', 'execute'),
  'nobody signed in can name a landmark');
select ok(
  not has_function_privilege('authenticated', 'public.award_expedition_road(text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.award_expedition_road(text, text, text)', 'execute'),
  'nobody signed in can award a road — the claim does it on the collector''s behalf');
select ok(
  has_function_privilege('service_role', 'public.name_expedition_landmarks(text, bigint, text[])', 'execute')
    and has_function_privilege('service_role', 'public.award_expedition_road(text, text, text)', 'execute'),
  'service_role can do both');

-- === 35-37. who reads what ===================================================
set local role anon;
select is((select count(*)::int from public.expedition_landmarks where season in ('S_TEST_AT', 'A_TEST_AT')), 8,
  'landmarks are league news: anyone can read them');
reset role;

-- Awards are the owner's: anon has no grant at all, and a signed-in
-- collector reads only their own.
select tests.acting_as('00000000-0000-0000-0000-0000000b0134'::uuid);
set local role authenticated;
select is(
  (select count(*)::int from public.expedition_atlas_awards)::text
    || ' ' || has_table_privilege('anon', 'public.expedition_atlas_awards', 'select')::text,
  '0 false',
  'Bo reads none of Ann''s or Cy''s awards, and anon reads none at all');
reset role;

select tests.acting_as('00000000-0000-0000-0000-0000000a0134'::uuid);
set local role authenticated;
select is((select string_agg(season || ' ' || tier, ',') from public.expedition_atlas_awards), 'S_TEST_AT legend',
  'Ann reads her own award');
reset role;

select * from finish();
rollback;
