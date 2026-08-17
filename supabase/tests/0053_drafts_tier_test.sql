begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

create temporary table t as select tests.fixture() as d;
-- The temp table is owned by this (superuser) session; grant it to
-- `authenticated` so the role-switched assertions below can read (select d
-- from t) without tripping an unrelated permission-denied error.
grant select on t to authenticated;
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb', true, true),
       (tests.cap(43), 'helper', true, false)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- A plain admin cannot create or rename a draft.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select throws_ok($$ insert into public.drafts (name) values ('Sneaky') $$, '42501', null,
                 'an admin cannot create a draft');
update public.drafts set name = 'Renamed' where id = (select d from t);
reset role;
select isnt((select name from public.drafts where id = (select d from t)), 'Renamed',
            'an admin cannot rename a draft');

-- An owner can.
select tests.acting_as(tests.cap(41));
set local role authenticated;
select lives_ok($$ insert into public.drafts (name) values ('Owner Draft') $$,
                'an owner can create a draft');
reset role;

-- Running a live draft is still admin work: the RPC is SECURITY DEFINER and
-- bypasses the policy above.
select tests.acting_as(tests.cap(43));
set local role authenticated;
select lives_ok($$ select public.start_draft((select d from t)) $$,
                'an admin can still start a draft');
reset role;

select * from finish();
rollback;
