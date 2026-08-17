begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

create temporary table t as select tests.fixture() as d;
-- The temp table is owned by this (superuser) session; grant it to
-- `authenticated` so the role-switched assertions below can read (select d
-- from t) without tripping an unrelated permission-denied error.
grant select on t to authenticated;
create temporary table tm as
  select id from public.teams where draft_id = (select d from t) and nomination_position = 1;
grant select on tm to authenticated;

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

select has_function('public', 'set_team_identity', 'the identity RPC exists');

-- An admin cannot change a team's budget directly.
select tests.acting_as(tests.cap(43));
set local role authenticated;
update public.teams set points_remaining = 9999 where id = (select id from tm);
reset role;
select isnt((select points_remaining from public.teams where id = (select id from tm)), 9999,
            'an admin cannot rewrite a team budget');

-- But can set cosmetic identity through the RPC.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select lives_ok(
  $$ select public.set_team_identity((select id from tm), 'https://x/y.png', '#123456', 'ZZZ') $$,
  'an admin may set team identity');
reset role;
select is((select abbreviation from public.teams where id = (select id from tm)), 'ZZZ',
          'and it takes effect');

-- An anonymous caller cannot set team identity at all. The RPC is granted
-- only to authenticated and service_role, so this fails at the grant --
-- before _require_admin() would even run. A literal uuid keeps this
-- independent of the `tm` temp table, which anon has no grant on.
set local role anon;
select throws_ok(
  $$ select public.set_team_identity(gen_random_uuid(), 'https://x/y.png', '#123456', 'ZZZ') $$,
  '42501', null, 'an anonymous caller cannot set team identity');
reset role;

-- The RPC's slice is cosmetic identity alone; it must not also touch the
-- team's budget.
select is((select points_remaining from public.teams where id = (select id from tm)), 100,
          'set_team_identity does not touch points_remaining');

-- An owner can still write the team directly.
select tests.acting_as(tests.cap(41));
set local role authenticated;
update public.teams set points_remaining = 42 where id = (select id from tm);
reset role;
select is((select points_remaining from public.teams where id = (select id from tm)), 42,
          'an owner can rewrite a team budget');

select * from finish();
rollback;
