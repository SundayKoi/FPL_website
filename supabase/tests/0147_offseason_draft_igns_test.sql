-- Offseason drafts use in-game names (20261116000001): a week's auction names
-- its players, and its teams after their captains, by the in-game part of
-- each Riot ID, whatever display name the player signed up with.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'ign cap one'), (tests.cap(2), 'ign cap two')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0147', 'IGN Offseason', false);
-- Display names are Discord-style; Riot IDs carry the in-game names (one with
-- a stray space before the #, as players type them).
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0147', '00000000-0000-0000-0000-0000000e0147', tests.cap(1), 'discord_one', 'Flyinq squirtle #na1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000b0147', '00000000-0000-0000-0000-0000000e0147', tests.cap(2), 'discord.two', 'Bleedinwolves#IlIll', 'jungle', 'jungle');
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role, assigned_role)
select '00000000-0000-0000-0000-0000000e0147', 'discord_pool_' || n, 'Game Name ' || n || '#OS1', r, r
from generate_series(1, 8) n,
     lateral (select (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role as r) roles;
insert into public.offseason_weeks (id, event_id, week_number)
  values ('00000000-0000-0000-0000-0000000f0147', '00000000-0000-0000-0000-0000000e0147', 1);
insert into public.offseason_week_entries (week_id, entrant_id, tier, captain_seat)
select '00000000-0000-0000-0000-0000000f0147', e.id, 'main',
       case e.profile_id when tests.cap(1) then 1 when tests.cap(2) then 2 end
from public.offseason_entrants e
where e.event_id = '00000000-0000-0000-0000-0000000e0147';

-- === 1. staff create the draft ===============================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0147', 'main', 100,
                     p_round_minimums => '{1}',
                     p_captain_costs => '{"00000000-0000-0000-0000-0000000a0147": 10, "00000000-0000-0000-0000-0000000b0147": 10}') $$,
                'staff create the week''s draft');
reset role;

-- === 2-5. everything in it carries in-game names =============================
select results_eq($$ select t.name, t.abbreviation from public.teams t
                     where t.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0147')
                     order by t.nomination_position $$,
                  $$ values ('Team Flyinq squirtle'::text, 'FLYI'::text), ('Team Bleedinwolves'::text, 'BLEE'::text) $$,
                  'teams are named after their captains'' in-game names');
select results_eq($$ select p.display_name from public.players p
                     where p.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0147')
                       and p.acquisition = 'captain' order by p.display_name $$,
                  $$ values ('Bleedinwolves'::text), ('Flyinq squirtle'::text) $$,
                  'captains are listed by in-game name, trimmed');
select is((select count(*)::int from public.players p
            where p.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0147')
              and p.display_name like 'Game Name %'), 8,
          'the pool is listed by in-game name');
select is((select count(*)::int from public.players p
            where p.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0147')
              and p.display_name like 'discord%'), 0,
          'no Discord name reaches the draft');

select * from finish();
rollback;
