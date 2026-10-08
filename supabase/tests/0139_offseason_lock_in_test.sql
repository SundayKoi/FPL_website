-- Offseason lock-in (20261108000001): a player confirms they are playing the
-- role staff gave them, a staff-added player claims their row by Riot ID to
-- do it after sign-ups close, and nobody else can set it for them.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(22);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Lock One'), (tests.cap(2), 'Lock Bench'), (tests.cap(3), 'Lock Claimer'),
  (tests.cap(4), 'Lock Linked'), (tests.cap(5), 'Lock Stranger')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name)
  values ('00000000-0000-0000-0000-0000000e0139', 'Lock-in Offseason');

insert into public.offseason_entrants (event_id, profile_id, display_name, riot_id, primary_role) values
  ('00000000-0000-0000-0000-0000000e0139', tests.cap(1), 'Lock One', 'Lock One#OS1', 'mid'),
  ('00000000-0000-0000-0000-0000000e0139', tests.cap(2), 'Lock Bench', 'Lock Bench#OS1', 'top'),
  ('00000000-0000-0000-0000-0000000e0139', tests.cap(4), 'Lock Linked', 'Lock Linked#OS1', 'jungle'),
  ('00000000-0000-0000-0000-0000000e0139', null, 'Staff Added', 'Staff Added#OS1', 'support'),
  ('00000000-0000-0000-0000-0000000e0139', null, 'Bench Added', 'Bench Added#OS1', 'adc');

-- === 1-4. who may call it, and roles ====================================================
set local role anon;
select throws_ok($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'mid') $$,
                 '42501', null, 'anon cannot lock in');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'mid') $$,
                   'NOT_SIGNED_IN%', 'locking in needs a signed-in profile');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'mid') $$,
                   'NO_ROLE%', 'nobody locks in before roles are assigned');
reset role;

-- Staff assign roles: Lock Bench and Bench Added sit out.
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_apply_roles('00000000-0000-0000-0000-0000000e0139',
            (select jsonb_agg(jsonb_build_object(
                'entrant_id', id, 'role', primary_role,
                'status', case when display_name in ('Lock Bench', 'Bench Added') then 'benched' else 'active' end))
               from public.offseason_entrants where event_id = '00000000-0000-0000-0000-0000000e0139')),
          5, 'staff assign roles, two sitting out');
reset role;

-- === 5-9. locking in your own entry ==========================================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'top') $$,
                   'ROLE_CHANGED%', 'a lock-in must name the role the player was given');
select lives_ok($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'mid') $$,
                'a player locks in the role they were given');
-- RLS lets only staff write entrants directly: this matches no rows. (The
-- tests schema is out of reach of this role, so ids are spelled out.)
update public.offseason_entrants set locked_in_role = 'top' where profile_id = '00000000-0000-0000-0000-000000000001';
reset role;
select ok((select locked_in_role = 'mid' and locked_in_at is not null
             from public.offseason_entrants where profile_id = tests.cap(1)),
          'the lock-in records the role and when');
select is((select locked_in_role from public.offseason_entrants where profile_id = tests.cap(1)),
          'mid'::public.lol_role, 'a player cannot change their lock-in directly');

select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'top') $$,
                   'NOT_PLAYING%', 'a player sitting out cannot lock in');
reset role;

-- === 10-16. claiming a staff-added row after sign-ups close ===================
update public.offseason_events set signups_open = false where id = '00000000-0000-0000-0000-0000000e0139';

select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'support') $$,
                   'NOT_ENTERED%', 'someone with no entry and no Riot ID is not in the event');
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'support', 'Nobody#OS1') $$,
                   'NOT_ENTERED%', 'an unknown Riot ID claims nothing');
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'jungle', 'Lock Linked#OS1') $$,
                   'RIOT_ID_TAKEN%', 'a row another account owns cannot be claimed');
select lives_ok($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'support', ' staff added#os1 ') $$,
                'a staff-added player claims their row by Riot ID and locks in');
reset role;
select ok((select profile_id = tests.cap(3) and locked_in_role = 'support'
             from public.offseason_entrants where riot_id = 'Staff Added#OS1'),
          'the claimed row is linked to them and locked in');

select tests.acting_as(tests.cap(5));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'adc', 'Bench Added#OS1') $$,
                   'NOT_PLAYING%', 'a staff-added player who is sitting out cannot lock in');
reset role;
select ok((select profile_id is null from public.offseason_entrants where riot_id = 'Bench Added#OS1'),
          'a refused lock-in claims nothing');

-- === 17-19. a role change needs a new lock-in ================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_apply_roles('00000000-0000-0000-0000-0000000e0139',
            jsonb_build_array(jsonb_build_object(
              'entrant_id', (select id from public.offseason_entrants where profile_id = '00000000-0000-0000-0000-000000000001'),
              'role', 'top', 'status', 'active'))),
          1, 'staff move a locked-in player to another role');
reset role;
select ok((select locked_in_role is distinct from assigned_role
             from public.offseason_entrants where profile_id = tests.cap(1)),
          'after a role change the old lock-in no longer matches');

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'mid') $$,
                   'ROLE_CHANGED%', 'the old role cannot be locked in again');
reset role;

-- === 20-21. staff record a lock-in by hand ===================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ update public.offseason_entrants set locked_in_role = 'jungle', locked_in_at = now()
                    where profile_id = '00000000-0000-0000-0000-000000000004' $$,
                'staff can record a lock-in for a player');
select throws_ok($$ update public.offseason_entrants set locked_in_at = null
                    where profile_id = '00000000-0000-0000-0000-000000000004' $$,
                 '23514', null, 'a lock-in keeps its role and time together');
reset role;

-- === 22. the event is over ===================================================
update public.offseason_events set status = 'complete' where id = '00000000-0000-0000-0000-0000000e0139';
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_lock_in('00000000-0000-0000-0000-0000000e0139', 'top') $$,
                   'EVENT_COMPLETE%', 'nobody locks in once the event is over');
reset role;

select * from finish();
rollback;
