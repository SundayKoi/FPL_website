begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

-- An Academy draft with the six real team names.
create temporary table t as select tests.fixture() as d;
create temporary table a as
with ins as (insert into public.drafts (name) values ('Academy Test') returning id)
select id as adraft from ins;

-- Names and abbreviations exactly as production has them: the display names
-- carry an "Esports" qualifier the published schedule graphic omits, which is
-- why the seeder matches on abbreviation.
insert into public.teams (draft_id, name, abbreviation, nomination_position, budget_start, points_remaining)
select (select adraft from a), name, abbrev, row_number() over (order by name), 100, 100
from (values
  ('Astronauts', 'AST'), ('Divine Ascension', 'DA'), ('Flannel Esports Love Tap', 'FELT'),
  ('Flannel Esports Requiem', 'FNLR'), ('Free People Legion', 'FPL'), ('The Strokers', 'STRK')
) as v(name, abbrev);

update public.league_settings set academy_draft_id = (select adraft from a) where id = 1;

-- === the round robin ========================================================
select is(public._seed_academy_regular_season(), 15, 'writes all fifteen matchups');

select is((select count(*) from public.fixtures f
           join public.league_settings s on s.id = 1
           where f.season = s.academy_season
             and f.stage in ('week_1','week_2','week_3','week_4','week_5')),
          15::bigint, 'the Academy regular season holds fifteen fixtures');

select is((select count(distinct stage) from public.fixtures f
           join public.league_settings s on s.id = 1
           where f.season = s.academy_season), 5::bigint, 'spread across five weeks');

-- Every team plays every other exactly once.
select is((select count(*) from (
             select least(team_a, team_b) as x, greatest(team_a, team_b) as y
             from public.fixtures f join public.league_settings s on s.id = 1
             where f.season = s.academy_season
             group by 1, 2 having count(*) > 1) dupes),
          0::bigint, 'no pair meets twice');

select is((select count(*) from (
             select team_a as name from public.fixtures f join public.league_settings s on s.id = 1
               where f.season = s.academy_season
             union all
             select team_b from public.fixtures f join public.league_settings s on s.id = 1
               where f.season = s.academy_season) all_slots
           where name = 'Astronauts'), 5::bigint, 'each team plays five games');

select is((select count(*) from public.fixtures f join public.league_settings s on s.id = 1
           where f.season = s.academy_season and f.stage = 'week_1'), 3::bigint,
          'three series a week');

-- Kickoffs land on the league's Monday 8pm ET slot.
select is((select distinct scheduled_at at time zone 'America/New_York'
           from public.fixtures f join public.league_settings s on s.id = 1
           where f.season = s.academy_season and f.stage = 'week_1'),
          timestamp '2026-08-17 20:00:00', 'week 1 is Monday 17 Aug, 8pm ET');

select is((select count(*) from public.fixtures f join public.league_settings s on s.id = 1
           where f.season = s.academy_season and f.stage in ('gauntlet_r1','gauntlet_r2')),
          0::bigint, 'no gauntlet is scheduled for the Academy');

-- Fixtures must carry the draft's full display name, not the abbreviation the
-- schedule is keyed on, or the Academy pages will not match them to a team.
select is((select count(*) from public.fixtures f join public.league_settings s on s.id = 1
           where f.season = s.academy_season
             and (f.team_a like 'Flannel Esports%' or f.team_b like 'Flannel Esports%')),
          -- 5 games each, meeting once in week 1: 5 + 5 - 1.
          9::bigint, 'the Flannel sides land under their full draft names');

-- === re-runnable ============================================================
-- Running it twice must not duplicate the season, and must preserve fixture
-- ids so issued tourney codes stay attached.
create temporary table before_ids as
  select f.id from public.fixtures f join public.league_settings s on s.id = 1
  where f.season = s.academy_season;

select is(public._seed_academy_regular_season(), 15, 'a second run rewrites the same fifteen');

select is((select count(*) from public.fixtures f
           join public.league_settings s on s.id = 1
           where f.season = s.academy_season
             and f.id not in (select id from before_ids)),
          0::bigint, 'no fixture is recreated, so attached codes survive');

select * from finish();
rollback;
