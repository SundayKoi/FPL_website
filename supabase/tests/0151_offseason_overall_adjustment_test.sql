-- Offseason Overall adjustments (20261120000001): staff set a player's
-- adjustment within ±20; nobody else can, and signing up leaves it at zero.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(6);

insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values (tests.cap(1), 'Adjusted') on conflict (id) do nothing;
insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0151', 'Adjust Offseason', true);
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role)
  values ('00000000-0000-0000-0000-0000000a0151', '00000000-0000-0000-0000-0000000e0151', tests.cap(1), 'Adjusted', 'Adjusted#OS1', 'top');

select is((select overall_adjustment from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000a0151'), 0,
          'a player starts with no adjustment');

-- The player tries to raise their own: RLS lets only staff write entrants.
select tests.acting_as(tests.cap(1));
set local role authenticated;
update public.offseason_entrants set overall_adjustment = 10 where id = '00000000-0000-0000-0000-0000000a0151';
reset role;
select is((select overall_adjustment from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000a0151'), 0,
          'a player can''t adjust their own Overall');

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ update public.offseason_entrants set overall_adjustment = 5 where id = '00000000-0000-0000-0000-0000000a0151' $$,
                'staff set an adjustment');
select throws_ok($$ update public.offseason_entrants set overall_adjustment = 21 where id = '00000000-0000-0000-0000-0000000a0151' $$,
                 '23514', null, 'an adjustment is at most 20 points');
reset role;
select is((select overall_adjustment from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000a0151'), 5,
          'the staff adjustment is kept');

-- Editing the entry from the sign-up form keeps staff's adjustment.
select tests.acting_as(tests.cap(1));
set local role authenticated;
select public.offseason_sign_up('00000000-0000-0000-0000-0000000e0151', 'Adjusted', 'Adjusted#OS1', '', 'Gold 1', 'top', null);
reset role;
select is((select overall_adjustment from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000a0151'), 5,
          'updating a sign-up doesn''t reset it');

select * from finish();
rollback;
