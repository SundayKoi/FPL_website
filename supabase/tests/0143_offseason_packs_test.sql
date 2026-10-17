-- Offseason packs (20261112000001): staff publish a weekly card set, and
-- anyone signed in opens $100 packs of five from the latest set with a
-- $2,000 weekly allowance. Copies are the owner's alone.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(18);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Pack Opener'), (tests.cap(2), 'Pack Neighbour')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0143', 'Pack Offseason', false);
insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e1143', 'Other Offseason', false, 'complete');
insert into public.offseason_entrants (id, event_id, display_name, riot_id, primary_role, assigned_role)
select ('00000000-0000-0000-0000-0000000a01' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-0000000e0143', 'Pack Player ' || n, 'Pack Player ' || n || '#OS1',
       r, r
from generate_series(1, 6) n,
     lateral (select (array['top', 'jungle', 'mid', 'adc', 'support', 'top'])[n]::public.lol_role as r) roles;
insert into public.offseason_entrants (id, event_id, display_name, riot_id, primary_role, assigned_role)
  values ('00000000-0000-0000-0000-0000000a0199', '00000000-0000-0000-0000-0000000e1143', 'Elsewhere', 'Elsewhere#OS1', 'mid', 'mid');
insert into public.offseason_weeks (id, event_id, week_number, status)
  values ('00000000-0000-0000-0000-0000000f0143', '00000000-0000-0000-0000-0000000e0143', 1, 'complete');

-- Player 1 has ink on file; nobody else does.
insert into public.card_art_prefs (season, summoner_name, tag, skin, signature)
  values ('S5', 'Pack Player 1', 'OS1', 0, 'data:image/png;base64,INK');

-- === 1-4. staff publish the week's set =======================================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_publish_card_set('00000000-0000-0000-0000-0000000e0143', 1, (select jsonb_agg(jsonb_build_object('entrant_id', '00000000-0000-0000-0000-0000000a01' || lpad(n::text, 2, '0'), 'card', jsonb_build_object('name', 'Pack Player ' || n, 'tag', 'OS1', 'overall', 60 + n, 'season', 'Offseason'))) from generate_series(1, 6) n)) $$,
                   'NOT_ADMIN%', 'a member cannot publish a set');
select throws_like($$ select public.offseason_open_pack(gen_random_uuid()) $$,
                   'NO_CARDS_YET%', 'nothing opens before a set is published');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_publish_card_set('00000000-0000-0000-0000-0000000e0143', 1,
                        '[{"entrant_id":"00000000-0000-0000-0000-0000000a0199","card":{"name":"Elsewhere"}}]'::jsonb) $$,
                   'CARDS_INVALID%', 'a card must name a player in this event');
select is(public.offseason_publish_card_set('00000000-0000-0000-0000-0000000e0143', 1, (select jsonb_agg(jsonb_build_object('entrant_id', '00000000-0000-0000-0000-0000000a01' || lpad(n::text, 2, '0'), 'card', jsonb_build_object('name', 'Pack Player ' || n, 'tag', 'OS1', 'overall', 60 + n, 'season', 'Offseason'))) from generate_series(1, 6) n)),
          6, 'staff publish a six-card set');
reset role;

-- === 5-9. a member opens a pack ==============================================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ select public.offseason_open_pack('00000000-0000-0000-0000-00000000aa01') $$, 'a member opens a pack');
select ok((select count(*) = 5 and count(distinct entrant_id) = 5 from public.offseason_card_copies), 'the pack holds five different players');
select is((select remaining from public.offseason_pack_wallet()), 1900, 'it costs $100 of the $2,000');
select is((public.offseason_open_pack('00000000-0000-0000-0000-00000000aa01') -> 'cards' ->> 0)::jsonb ->> 'slot', '1',
          'retrying the same request returns the same pack');
select is((select count(*)::int from public.offseason_card_copies), 5, 'and charges nothing more');
reset role;

-- === 10. nobody else can claim that request ==================================
select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_like($$ select public.offseason_open_pack('00000000-0000-0000-0000-00000000aa01') $$,
                   'REQUEST_INVALID%', 'another member cannot reuse someone''s request');
select is((select count(*)::int from public.offseason_card_copies), 0, 'and sees none of their copies');
reset role;

-- === 11-13. the allowance is twenty packs a week =============================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$ do $do$ begin for i in 1..19 loop perform public.offseason_open_pack(gen_random_uuid()); end loop; end $do$ $$,
                'a member opens the rest of the week''s packs');
select is((select remaining from public.offseason_pack_wallet()), 0, 'that spends the whole $2,000');
select throws_like($$ select public.offseason_open_pack(gen_random_uuid()) $$,
                   'ALLOWANCE_SPENT%', 'the twenty-first pack waits for Monday');
reset role;

-- === 14-15. finishes =========================================================
select ok((select bool_and(not signed or (foil and card ->> 'autograph' = 'data:image/png;base64,INK'))
             from public.offseason_card_copies),
          'a signed copy is foil and carries the player''s own ink');
select ok((select bool_and(not signed and card -> 'autograph' = 'null'::jsonb)
             from public.offseason_card_copies where entrant_id <> '00000000-0000-0000-0000-0000000a0101'),
          'players with no ink on file are never signed');

-- === 16-17. visitors cannot open or publish ==================================
set local role anon;
select throws_ok($$ select public.offseason_open_pack(gen_random_uuid()) $$, '42501', null, 'a visitor cannot open packs');
select throws_ok($$ select public.offseason_publish_card_set('00000000-0000-0000-0000-0000000e0143', 1, '[]'::jsonb) $$,
                 '42501', null, 'or publish a set');
reset role;

select * from finish();
rollback;
