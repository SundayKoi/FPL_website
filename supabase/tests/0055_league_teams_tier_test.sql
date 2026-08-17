begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(3);

create temporary table t as select tests.fixture() as d;
-- The temp table is owned by this (superuser) session; grant it to
-- `authenticated` so the role-switched assertion below can read (select d
-- from t) without tripping an unrelated permission-denied error.
grant select on t to authenticated;
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- Retiring a team by hand is what stranded Astronauts and Wildcats.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select throws_ok($$ insert into public.league_teams (name, abbreviation)
                    values ('Freehand', 'FRH') $$, '42501', null,
                 'an admin cannot add a league team by hand');
reset role;

select tests.acting_as(tests.cap(41));
set local role authenticated;
select lives_ok($$ insert into public.league_teams (name, abbreviation)
                   values ('Freehand', 'FRH') $$,
                'an owner can add a league team');
reset role;

-- The guided, idempotent path stays admin work: it is SECURITY DEFINER.
-- This setup write runs as superuser, outside the role switch.
update public.league_settings set featured_draft_id = (select d from t) where id = 1;
select tests.acting_as(tests.cap(43));
set local role authenticated;
select lives_ok($$ select public.sync_league_teams_from_draft() $$,
                'an admin can still sync teams from the draft');
reset role;

select * from finish();
rollback;
