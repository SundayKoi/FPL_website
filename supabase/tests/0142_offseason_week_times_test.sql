-- Offseason week times (20261111000001): staff set when a week drafts and
-- when it plays. The draft time moves the week's auctions with it, and a
-- draft created later starts at it.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Times Cap One'), (tests.cap(2), 'Times Cap Two'), (tests.cap(3), 'Times Member')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0142', 'Week-times Offseason', false);
insert into public.offseason_entrants (event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000e0142', tests.cap(1), 'Times Cap One', 'Times Cap One#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000e0142', tests.cap(2), 'Times Cap Two', 'Times Cap Two#OS1', 'jungle', 'jungle');
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role, assigned_role)
select '00000000-0000-0000-0000-0000000e0142', 'Times Pool ' || n, 'Times Pool ' || n || '#OS1', r, r
from generate_series(1, 8) n,
     lateral (select (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role as r) roles;

-- Week 1 already has its main auction; week 2 has none yet.
insert into public.drafts (id, name) values ('00000000-0000-0000-0000-0000000d0142', 'Offseason W1');
insert into public.offseason_weeks (id, event_id, week_number, status, main_draft_id) values
  ('00000000-0000-0000-0000-0000000f0142', '00000000-0000-0000-0000-0000000e0142', 1, 'drafting', '00000000-0000-0000-0000-0000000d0142'),
  ('00000000-0000-0000-0000-0000000f1142', '00000000-0000-0000-0000-0000000e0142', 2, 'setup', null);
insert into public.offseason_week_entries (week_id, entrant_id, tier, captain_seat)
select '00000000-0000-0000-0000-0000000f1142', e.id, 'main',
       case e.profile_id when tests.cap(1) then 1 when tests.cap(2) then 2 end
from public.offseason_entrants e
where e.event_id = '00000000-0000-0000-0000-0000000e0142';

-- === 1-2. the week has a draft time and a game time ==========================
select col_type_is('public', 'offseason_weeks', 'draft_at', 'timestamp with time zone', 'weeks have a draft time');
select col_type_is('public', 'offseason_weeks', 'games_at', 'timestamp with time zone', 'weeks have a game time');

-- === 3-5. staff set them, and the week's auction moves too ===================
-- Sunday 8 PM ET draft, Monday 8 PM ET games.
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_set_week_times('00000000-0000-0000-0000-0000000f0142',
                     '2026-10-19 00:00:00+00', '2026-10-20 00:00:00+00') $$,
                'staff set a week''s draft and game times');
reset role;
select ok((select draft_at = '2026-10-19 00:00:00+00' and games_at = '2026-10-20 00:00:00+00'
             from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0142'),
          'the week keeps both times');
select is((select starts_at from public.drafts where id = '00000000-0000-0000-0000-0000000d0142'),
          '2026-10-19 00:00:00+00'::timestamptz, 'the week''s auction starts at the draft time');

-- === 6-7. the draft comes before the games ===================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_set_week_times('00000000-0000-0000-0000-0000000f0142',
                        '2026-10-21 00:00:00+00', '2026-10-20 00:00:00+00') $$,
                   'TIMES_INVALID%', 'a draft after the games is refused');
reset role;
select throws_ok($$ update public.offseason_weeks set draft_at = '2026-10-21 00:00:00+00'
                     where id = '00000000-0000-0000-0000-0000000f0142' $$,
                 '23514', null, 'the table refuses it too');

-- === 8-9. only staff set them ================================================
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_like($$ select public.offseason_set_week_times('00000000-0000-0000-0000-0000000f0142', null, null) $$,
                   'NOT_ADMIN%', 'a member cannot set week times');
reset role;
set local role anon;
select throws_ok($$ select public.offseason_set_week_times('00000000-0000-0000-0000-0000000f0142', null, null) $$,
                 '42501', null, 'a visitor cannot call it at all');
reset role;

-- === 10-11. a draft created after the time is set starts at it ===============
update public.offseason_weeks set draft_at = '2026-10-26 23:00:00+00', games_at = '2026-10-27 00:00:00+00'
 where id = '00000000-0000-0000-0000-0000000f1142';
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f1142', 'main', 100,
                     p_round_minimums => '{1}', p_captain_cost => 15) $$,
                'staff create week 2''s draft');
reset role;
select is((select d.starts_at from public.drafts d
            where d.id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f1142')),
          '2026-10-26 23:00:00+00'::timestamptz, 'the new auction starts at the week''s draft time');

select * from finish();
rollback;
