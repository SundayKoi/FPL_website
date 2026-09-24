-- The league's expedition of the week (20261103000001): the progress view
-- keeps the Eastern calendar and the league's own season, a goal falls
-- once and pays each contributor one fragment, the Vanguard is the top
-- contributor (ties to the lower discord id), a week two back is closed,
-- and nothing one league walks counts toward the other's goal.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(28);

-- === fixture: four collectors, two leagues ==================================
-- S_TEST_LG plays the Premier season, A_TEST_LG the Academy one. Ann and
-- Bo walk Premier; Dee walks Academy; Ann walks a little of both; Cy
-- only ever runs a rite (no miles, no pushes) until after the fall.
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000a0132'::uuid, 'lg-ann', 'Ann'),
  ('00000000-0000-0000-0000-0000000b0132'::uuid, 'lg-bo', 'Bo'),
  ('00000000-0000-0000-0000-0000000c0132'::uuid, 'lg-cy', 'Cy'),
  ('00000000-0000-0000-0000-0000000d0132'::uuid, 'lg-dee', 'Dee');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('lg-ann', '00000000-0000-0000-0000-0000000a0132'::uuid, 'Ann', 1000),
  ('lg-bo', '00000000-0000-0000-0000-0000000b0132'::uuid, 'Bo', 1000),
  ('lg-cy', '00000000-0000-0000-0000-0000000c0132'::uuid, 'Cy', 1000),
  ('lg-dee', '00000000-0000-0000-0000-0000000d0132'::uuid, 'Dee', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select who, 'S_TEST_LG', who || '-' || n, 'League Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', who || '-' || n)
from generate_series(1, 3) n, (values ('lg-ann'), ('lg-bo'), ('lg-cy'), ('lg-dee')) w(who);

-- Ann already holds two fragments; the others have never found one.
insert into public.expedition_supplies (discord_id, fragments) values ('lg-ann', 2)
  on conflict on constraint expedition_supplies_pkey do update set fragments = 2;

create or replace function tests.lg_squad(p_who text) returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_LG' and discord_id = p_who
$$;

-- The Eastern Monday p_back weeks before this one — the RPC's own
-- calendar, so the window assertions hold whatever day the suite runs.
create or replace function tests.lg_week(p_back int) returns date
language sql stable as $$
  select date_trunc('week', now() at time zone 'America/New_York')::date - 7 * p_back
$$;

-- p_count runs launched at noon ET on the Monday of p_week, each landing
-- p_pushes pushes, claimed that evening unless p_claimed is false.
-- Inserted directly, as 0130 does: the RPCs that launch and claim have
-- suites of their own, and the view only reads the rows they leave.
create or replace function tests.lg_runs(
  p_who text, p_season text, p_tier text, p_week date, p_count int, p_pushes int, p_claimed boolean default true
) returns void
language sql as $$
  insert into public.expedition_runs (discord_id, season, tier, squad, shine, started_at, resolves_at, outcome, claimed_at)
  select p_who, p_season, p_tier, tests.lg_squad(p_who), 10,
         (p_week + time '12:00') at time zone 'America/New_York',
         (p_week + time '20:00') at time zone 'America/New_York',
         jsonb_build_object('grade', 'solid', 'dollars', 100, 'pushes', p_pushes),
         case when p_claimed then (p_week + time '21:00') at time zone 'America/New_York' end
  from generate_series(1, p_count)
$$;

-- === 1-4. the view ===========================================================
-- Two raids either side of midnight ET on Monday 17 August (EDT, UTC-4):
-- 03:30 UTC is still Sunday evening in New York, 04:30 UTC is Monday.
insert into public.expedition_runs (discord_id, season, tier, squad, shine, started_at, resolves_at, outcome, claimed_at) values
  ('lg-ann', 'S_TEST_LG', 'raid', tests.lg_squad('lg-ann'), 10,
   timestamptz '2026-08-17 03:30:00+00', timestamptz '2026-08-18 03:30:00+00',
   '{"grade": "solid", "dollars": 100, "pushes": 2}'::jsonb, timestamptz '2026-08-18 04:00:00+00'),
  -- No `pushes` key at all: a run from before forks reads as none.
  ('lg-ann', 'S_TEST_LG', 'raid', tests.lg_squad('lg-ann'), 10,
   timestamptz '2026-08-17 04:30:00+00', timestamptz '2026-08-18 04:30:00+00',
   '{"grade": "solid", "dollars": 100}'::jsonb, timestamptz '2026-08-18 05:00:00+00');

-- The same week, three things that walk nowhere for Premier: a Legend
-- Hunt still out, a hold (a lost card is not a run), and Ann's Academy
-- Legend Hunt, which is Academy's to count.
insert into public.expedition_runs (discord_id, season, tier, squad, shine, started_at, resolves_at, outcome, claimed_at) values
  ('lg-ann', 'S_TEST_LG', 'legend', tests.lg_squad('lg-ann'), 10,
   timestamptz '2026-08-18 16:00:00+00', timestamptz '2026-08-20 16:00:00+00', null, null),
  ('lg-ann', 'S_TEST_LG', 'lost', tests.lg_squad('lg-ann'), 0,
   timestamptz '2026-08-18 16:00:00+00', timestamptz '2026-08-25 16:00:00+00', '{"expired": true}'::jsonb, timestamptz '2026-08-25 16:00:00+00'),
  ('lg-ann', 'A_TEST_LG', 'legend', tests.lg_squad('lg-ann'), 10,
   timestamptz '2026-08-18 16:00:00+00', timestamptz '2026-08-20 16:00:00+00',
   '{"grade": "solid", "dollars": 100, "pushes": 1}'::jsonb, timestamptz '2026-08-20 17:00:00+00');

select is(
  (select string_agg(week_start::text || '=' || miles || '/' || pushes, ',' order by week_start)
     from public.expedition_league_progress
    where season = 'S_TEST_LG' and discord_id = 'lg-ann' and week_start < date '2026-09-01'),
  '2026-08-10=2/2,2026-08-17=2/0',
  'a run counts for the Eastern week it launched in: Sunday 11:30 PM ET is the week before, and a run with no pushes key lands none');
select is(
  (select miles from public.expedition_league_progress
    where season = 'S_TEST_LG' and discord_id = 'lg-ann' and week_start = date '2026-08-17'),
  2,
  'a run still out, a hold and the other league''s run walk nothing for this league');
select is(
  (select miles || '/' || pushes from public.expedition_league_progress
    where season = 'A_TEST_LG' and discord_id = 'lg-ann' and week_start = date '2026-08-17'),
  '3/1',
  'the Academy Legend Hunt counts for the Academy week, on its own row');
select is(
  (select username from public.expedition_league_progress
    where season = 'S_TEST_LG' and discord_id = 'lg-ann' and week_start = date '2026-08-17'),
  'Ann',
  'the row carries the username');

-- === 5-6. below the target, nothing falls ===================================
-- Last week: Ann and Bo walk 12 miles each (24 of 40). Dee walks 24 miles
-- and lands 24 pushes for Academy, and Ann a Legendary route there with
-- no pushes — 28 Academy miles that would tip Premier over 40 if the two
-- leagues' weeks ever mixed. Cy runs one rite: no miles, no pushes.
select tests.lg_runs('lg-ann', 'S_TEST_LG', 'legendary', tests.lg_week(1), 3, 1);
select tests.lg_runs('lg-bo', 'S_TEST_LG', 'legendary', tests.lg_week(1), 3, 2);
select tests.lg_runs('lg-cy', 'S_TEST_LG', 'exorcism', tests.lg_week(1), 1, 0);
select tests.lg_runs('lg-dee', 'A_TEST_LG', 'legendary', tests.lg_week(1), 6, 4);
select tests.lg_runs('lg-ann', 'A_TEST_LG', 'legendary', tests.lg_week(1), 1, 0);

-- Captured rather than called inline: an assertion that repeats its
-- operand would call the RPC twice.
create temporary table lg_below on commit drop as
  select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(1), 'landmark', 40);

select is((select fell::text || ',' || rewarded || ',' || coalesce(top_id, '-') from lg_below), 'false,0,-',
  'below the target the goal stands — and the other league''s miles do not count toward it');
select is(
  (select count(*)::int from public.expedition_league_goals where season = 'S_TEST_LG')
    + (select count(*)::int from public.expedition_league_rewards where season = 'S_TEST_LG'),
  0,
  'and nothing is written');

-- === 7-10. at the target, it falls and pays =================================
-- Two more Legendary routes each: Ann 20, Bo 20 — exactly 40, and a tie
-- at the top.
select tests.lg_runs('lg-ann', 'S_TEST_LG', 'legendary', tests.lg_week(1), 2, 0);
select tests.lg_runs('lg-bo', 'S_TEST_LG', 'legendary', tests.lg_week(1), 2, 0);

create temporary table lg_fall on commit drop as
  select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(1), 'landmark', 40);

select is((select fell::text || ',' || rewarded || ',' || coalesce(top_id, '-') from lg_fall), 'true,2,lg-ann',
  'at the target the goal falls, pays two, and the tie at the top goes to the lower discord id');
select is(
  (select kind || ':' || target || ':' || coalesce(top_id, '-') from public.expedition_league_goals
    where season = 'S_TEST_LG' and week_start = tests.lg_week(1)),
  'landmark:40:lg-ann',
  'the goal row records what fell and its Vanguard');
select is(
  (select string_agg(discord_id || ':' || fragments || ':' || top::text, ',' order by discord_id)
     from public.expedition_league_rewards where season = 'S_TEST_LG' and week_start = tests.lg_week(1)),
  'lg-ann:1:true,lg-bo:1:false',
  'one reward per contributor, the top flagged; a rite that walked no miles is not a contribution');
select is(
  (select string_agg(discord_id || '=' || fragments, ',' order by discord_id)
     from public.expedition_supplies where discord_id in ('lg-ann', 'lg-bo', 'lg-cy', 'lg-dee')),
  'lg-ann=3,lg-bo=1',
  'each contributor''s fragments go up by one, whether or not they held any');

-- === 11-12. it falls once ====================================================
-- Cy walks a Legendary route that left last week and comes home after
-- the fall: the goal has already fallen, and nobody is paid again.
select tests.lg_runs('lg-cy', 'S_TEST_LG', 'legendary', tests.lg_week(1), 1, 0);

create temporary table lg_again on commit drop as
  select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(1), 'landmark', 40);

select is((select fell::text || ',' || rewarded || ',' || coalesce(top_id, '-') from lg_again), 'true,0,lg-ann',
  'a second call says it fell and pays nobody');
select is(
  (select string_agg(discord_id || '=' || fragments, ',' order by discord_id)
     from public.expedition_supplies where discord_id in ('lg-ann', 'lg-bo', 'lg-cy', 'lg-dee')),
  'lg-ann=3,lg-bo=1',
  'no double credit, and a late walker is not paid for a goal that already fell');

-- === 13-15. the other league's week is its own ==============================
select is((select count(*)::int from public.expedition_league_goals where season = 'A_TEST_LG'), 0,
  'the Premier goal falling writes nothing for Academy');

create temporary table lg_academy on commit drop as
  select * from public.fell_expedition_league_goal('A_TEST_LG', tests.lg_week(1), 'boss', 24);

select is((select fell::text || ',' || rewarded || ',' || coalesce(top_id, '-') from lg_academy), 'true,1,lg-dee',
  'a boss counts pushes: Dee''s 24 bring it down, and Ann''s miles with no pushes are not a contribution');
select is(
  (select string_agg(discord_id || '=' || fragments, ',' order by discord_id)
     from public.expedition_supplies where discord_id in ('lg-ann', 'lg-bo', 'lg-cy', 'lg-dee')),
  'lg-ann=3,lg-bo=1,lg-dee=1',
  'Academy pays its own contributor and nobody else');

-- === 16-17. a week two back is closed =======================================
select tests.lg_runs('lg-bo', 'S_TEST_LG', 'legendary', tests.lg_week(2), 11, 0);

create temporary table lg_closed on commit drop as
  select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(2), 'landmark', 40);

select is((select fell::text || ',' || rewarded || ',' || coalesce(top_id, '-') from lg_closed), 'false,0,-',
  'a goal that did not fall by the end of the following week is no longer evaluated, whatever its runs say now');
select is((select count(*)::int from public.expedition_league_goals where season = 'S_TEST_LG' and week_start = tests.lg_week(2)), 0,
  'and nothing is written for it');

-- === 18-22. shape checks =====================================================
select throws_ok($$ select * from public.fell_expedition_league_goal('', tests.lg_week(1), 'landmark', 40) $$,
  'P0001', 'unknown season', 'a goal belongs to a season');
select throws_ok($$ select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(1) + 1, 'landmark', 40) $$,
  'P0001', 'bad week', 'a week is named by its Monday');
select throws_ok($$ select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(0) + 7, 'landmark', 40) $$,
  'P0001', 'bad week', 'next week has not started');
select throws_ok($$ select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(0), 'dragon', 40) $$,
  'P0001', 'bad kind', 'only a landmark or a boss');
select throws_ok($$ select * from public.fell_expedition_league_goal('S_TEST_LG', tests.lg_week(0), 'landmark', 1) $$,
  'P0001', 'bad target', 'a goal of one mile would pay the league every week');

-- === 23-25. only the service role can fell a goal ===========================
select ok(not has_function_privilege('anon', 'public.fell_expedition_league_goal(text, date, text, int)', 'execute'),
  'anon cannot fell a goal');
select ok(not has_function_privilege('authenticated', 'public.fell_expedition_league_goal(text, date, text, int)', 'execute'),
  'authenticated cannot fell a goal');
select ok(has_function_privilege('service_role', 'public.fell_expedition_league_goal(text, date, text, int)', 'execute'),
  'service_role can');

-- === 26-28. league news is public ===========================================
set local role anon;
select is(
  (select miles from public.expedition_league_progress
    where season = 'S_TEST_LG' and discord_id = 'lg-ann' and week_start = date '2026-08-17'),
  2,
  'anon reads the progress view');
select is((select count(*)::int from public.expedition_league_goals where season = 'S_TEST_LG'), 1,
  'anon reads the goals that fell');
select is((select count(*)::int from public.expedition_league_rewards where season = 'S_TEST_LG'), 2,
  'anon reads who was paid');
reset role;

select * from finish();
rollback;
