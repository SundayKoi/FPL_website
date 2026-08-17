begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(3);

-- A pre-existing owner set that mirrors production: the two creators plus a
-- third owner who should come out of this as a plain admin.
insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.cap(41), 'dribb',   true, true),
       (tests.cap(42), 'spiesss', true, true),
       (tests.cap(43), 'helper',  true, true)
on conflict (id) do update set display_name = excluded.display_name,
  is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- Re-run the migration's demotion against this seeded set. The migration
-- itself no-ops on a fresh database (no profiles exist at migration time), so
-- the behaviour has to be exercised here.
update public.profiles
set is_owner = false
where is_owner and lower(trim(display_name)) not in ('dribb', 'spiesss');

select is((select count(*) from public.profiles where is_owner), 2::bigint,
          'only the two creators remain owners');

select is((select is_owner from public.profiles where id = tests.cap(43)), false,
          'the third owner is demoted');

-- The demoted owner keeps every admin power; only their tier changed.
select is((select is_admin from public.profiles where id = tests.cap(43)), true,
          'and keeps admin access');

select * from finish();
rollback;
