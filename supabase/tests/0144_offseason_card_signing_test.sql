-- Offseason card signing (20261113000001): a player signs their own card,
-- claiming a staff-added spot by Riot ID first if they need to, and signed
-- pack copies wear that signature.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Signed Up'), (tests.cap(2), 'Hand Added'), (tests.cap(3), 'Bystander')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0144', 'Signing Offseason', false);
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role, status)
values
  ('00000000-0000-0000-0000-0000000a0144', '00000000-0000-0000-0000-0000000e0144', tests.cap(1), 'Signer', 'Signer#OS1', 'mid', 'mid', 'active'),
  ('00000000-0000-0000-0000-0000000b0144', '00000000-0000-0000-0000-0000000e0144', null, 'Claimer', 'Claimer#OS1', 'top', 'top', 'benched'),
  ('00000000-0000-0000-0000-0000000c0144', '00000000-0000-0000-0000-0000000e0144', null, 'Gone', 'Gone#OS1', 'adc', null, 'withdrawn');

-- === 1-2. visitors and bad ink ===============================================
set local role anon;
select throws_ok($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,AAAA') $$,
                 '42501', null, 'a visitor cannot sign');
reset role;

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'javascript:alert(1)') $$,
                   'SIGNATURE_INVALID%', 'only a PNG data URL is a signature');

-- === 3-6. a player signs their own card ======================================
select is(public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,AAAA'),
          '00000000-0000-0000-0000-0000000a0144'::uuid, 'a player signs their own card');
select lives_ok($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,BBBB') $$,
                'and can sign it again');
select is((select signature from public.offseason_signatures where entrant_id = '00000000-0000-0000-0000-0000000a0144'),
          'data:image/png;base64,BBBB', 'the new signature replaces the old one');
select throws_ok($$ insert into public.offseason_signatures (entrant_id, signature) values ('00000000-0000-0000-0000-0000000b0144', 'data:image/png;base64,AAAA') $$,
                 '42501', null, 'nobody writes the table directly');
reset role;

-- === 7-10. claiming a staff-added spot =======================================
select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_like($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,CCCC') $$,
                   'NOT_ENTERED%', 'someone not in the event has nothing to sign');
select throws_like($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,CCCC', 'Signer#OS1') $$,
                   'RIOT_ID_TAKEN%', 'a spot with an account cannot be claimed');
select is(public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,CCCC', ' claimer#os1 '),
          '00000000-0000-0000-0000-0000000b0144'::uuid, 'a player sitting out claims their spot by Riot ID and signs');
select is((select profile_id from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000b0144'),
          '00000000-0000-0000-0000-000000000002'::uuid, 'the spot is now theirs');
reset role;

-- === 11-12. a withdrawn player cannot sign ===================================
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_sign_card('00000000-0000-0000-0000-0000000e0144', 'data:image/png;base64,DDDD', 'Gone#OS1') $$,
                   'NOT_PLAYING%', 'a withdrawn player cannot sign');
select is((select profile_id from public.offseason_entrants where id = '00000000-0000-0000-0000-0000000c0144'),
          null, 'and the failed claim leaves their spot unclaimed');
reset role;

-- === 13. signatures are public ===============================================
set local role anon;
select is((select count(*)::int from public.offseason_signatures), 2, 'anyone can see the signatures');
reset role;

-- === 14. signed pack copies wear the offseason signature =====================
insert into public.card_art_prefs (season, summoner_name, tag, skin, signature)
  values ('S5', 'Signer', 'OS1', 0, 'data:image/png;base64,LEAGUE');
select is(public._offseason_ink('00000000-0000-0000-0000-0000000a0144', '{"name":"Signer","tag":"OS1"}'::jsonb),
          'data:image/png;base64,BBBB', 'the offseason signature beats the league autograph');

select * from finish();
rollback;
