begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

-- A pre-existing owner set that mirrors production: the two creators plus a
-- third owner who should come out of this as a plain admin.
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb',   true, true),
       (tests.cap(42), 'spiesss', true, true),
       (tests.cap(43), 'helper',  true, true)
on conflict (id) do update set display_name = excluded.display_name,
  is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- Exercise the exact function the migration calls, rather than duplicating
-- its SQL inline, so this test actually depends on the shipped code.
select public.demote_non_creator_owners();

select is((select count(*) from public.profiles where is_owner), 2::bigint,
          'only the two creators remain owners');

select is((select is_owner from public.profiles where id = tests.cap(43)), false,
          'the third owner is demoted');

-- The demoted owner keeps every admin power; only their tier changed.
select is((select is_admin from public.profiles where id = tests.cap(43)), true,
          'and keeps admin access');

-- Force a bad owner shape: neither creator is currently an owner, only a
-- non-creator is. The guard must refuse to leave anything but exactly the
-- two creators as owners.
update public.profiles set is_owner = false where id in (tests.cap(41), tests.cap(42));
update public.profiles set is_owner = true where id = tests.cap(43);

select throws_like(
  $$ select public.demote_non_creator_owners() $$,
  'Expected exactly 2 owners%',
  'the guard fires when the owner set does not resolve to the two creators'
);

select * from finish();
rollback;
