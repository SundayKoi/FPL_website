begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;
insert into public.league_settings (id) values (1) on conflict (id) do nothing;

select has_function('public', 'set_signups_open', 'the signups RPC exists');

-- A plain admin cannot change the season.
select tests.acting_as(tests.cap(43));
set local role authenticated;
update public.league_settings set current_season = 'HACKED' where id = 1;
reset role;
select is((select current_season from public.league_settings where id = 1), 'S5',
          'an admin cannot change the season');

-- An owner can.
select tests.acting_as(tests.cap(41));
set local role authenticated;
update public.league_settings set current_season = 'S6' where id = 1;
reset role;
select is((select current_season from public.league_settings where id = 1), 'S6',
          'an owner can change the season');

-- The admin's own slice still works, through the RPC.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select lives_ok($$ select public.set_signups_open(false) $$, 'an admin may toggle signups');
reset role;
select is((select signups_open from public.league_settings where id = 1), false,
          'and the toggle takes effect');

-- An anonymous caller cannot toggle signups at all. The RPC is granted only
-- to authenticated and service_role, so this fails at the grant -- before
-- _require_admin() would even run.
set local role anon;
select throws_ok($$ select public.set_signups_open(true) $$, '42501', null,
                 'an anonymous caller cannot toggle signups');
reset role;

-- The RPC's slice is signups_open alone; it must not also rewrite the
-- season set earlier in this test.
select is((select current_season from public.league_settings where id = 1), 'S6',
          'set_signups_open does not touch current_season');

select * from finish();
rollback;
