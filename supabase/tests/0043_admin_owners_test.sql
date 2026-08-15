begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

select has_column('public', 'profiles', 'is_owner', 'profiles has an is_owner flag');
select col_not_null('public', 'profiles', 'is_owner', 'is_owner is never null');

select ok(not has_function_privilege(
  'anon', 'public.set_profile_admin(uuid,boolean)', 'execute'
), 'anon cannot change admin access');
select ok(has_function_privilege(
  'authenticated', 'public.set_profile_admin(uuid,boolean)', 'execute'
), 'authenticated callers may reach the owner-gated RPC');

-- The whole point of the split: profiles must stay unwritable directly, or an
-- admin could set their own is_admin/is_owner and skip the RPC entirely.
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'),
          'clients cannot write profiles directly');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'insert'),
          'clients cannot insert profiles directly');

select tests.fixture();
-- tests.admin_id() is an admin; make them the owner. cap(1) is a plain user,
-- cap(2) will be promoted to admin and must stay unable to promote anyone.
update public.profiles set is_owner = true where id = tests.admin_id();

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.set_profile_admin(tests.cap(2), true) $$,
  'NOT_OWNER%', 'a signed-in non-admin cannot grant admin');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.set_profile_admin(tests.cap(2), true) $$,
  'an owner grants admin');
select ok((select is_admin from public.profiles where id = tests.cap(2)),
          'the granted profile is now an admin');
select ok(not (select is_owner from public.profiles where id = tests.cap(2)),
          'granting admin never confers owner');

-- The load-bearing assertion: a granted admin cannot make more admins.
select tests.acting_as(tests.cap(2));
select throws_like($$ select public.set_profile_admin(tests.cap(3), true) $$,
  'NOT_OWNER%', 'a granted admin cannot grant admin to anyone else');
select ok(not (select is_admin from public.profiles where id = tests.cap(3)),
          'the attempted escalation left the third profile untouched');

-- An admin cannot promote themselves to owner either, since the RPC never
-- writes is_owner and there is no other write path.
select throws_like($$ select public.set_profile_admin(tests.cap(2), true) $$,
  'NOT_OWNER%', 'a granted admin cannot act on their own profile');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.set_profile_admin(tests.admin_id(), false) $$,
  'OWNER_PROTECTED%', 'an owner cannot be demoted through the RPC');

select * from finish();
rollback;
