-- Expeditions: insurance is once an Eastern week, twice for a patron.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0104'::uuid, 'plain-0104', 'Plain'),
  ('00000000-0000-0000-0000-0000000f0104'::uuid, 'flame-0104', 'Flame');
insert into public.betting_profiles (discord_id, profile_id, username, balance, patron_until) values
  ('plain-0104', '00000000-0000-0000-0000-0000000e0104'::uuid, 'Plain', 5000, null),
  ('flame-0104', '00000000-0000-0000-0000-0000000f0104'::uuid, 'Flame', 5000, now() + interval '30 days');

-- Nine cards each: three launches' worth, on three different tiers.
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select owner, 'S_TEST_INS', 'ins-' || owner || '-' || n, 'Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'ins-' || n)
from unnest(array['plain-0104', 'flame-0104']) owner, generate_series(1, 9) n;

create or replace function tests.ins_squad(p_owner text, p_from int) returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from (
    select id from public.card_inventory
    where season = 'S_TEST_INS' and discord_id = p_owner order by id offset p_from - 1 limit 3
  ) s
$$;

-- === a collector: one policy a week ==========================================
select lives_ok($$
  select * from public.launch_expedition('plain-0104', 'S_TEST_INS', 'raid', tests.ins_squad('plain-0104', 1), 12, 24, 2, true, 150, 0, null, null, null) $$,
  'the first insured launch of the week goes out');
select throws_ok($$
  select * from public.launch_expedition('plain-0104', 'S_TEST_INS', 'legend', tests.ins_squad('plain-0104', 4), 20, 48, 3, true, 150, 0, null, null, null) $$,
  'P0001', 'insurance used up', 'a second insured launch the same week is refused');
select lives_ok($$
  select * from public.launch_expedition('plain-0104', 'S_TEST_INS', 'legend', tests.ins_squad('plain-0104', 4), 20, 48, 3, false, 0, 0, null, null, null) $$,
  'but the same launch uninsured goes out');

-- === a patron: two ===========================================================
select lives_ok($$
  select * from public.launch_expedition('flame-0104', 'S_TEST_INS', 'raid', tests.ins_squad('flame-0104', 1), 12, 24, 2, true, 150, 0, null, null, null) $$,
  'a patron insures a first run');
select lives_ok($$
  select * from public.launch_expedition('flame-0104', 'S_TEST_INS', 'legend', tests.ins_squad('flame-0104', 4), 20, 48, 3, true, 150, 0, null, null, null) $$,
  'and a second');
select throws_ok($$
  select * from public.launch_expedition('flame-0104', 'S_TEST_INS', 'legendary', tests.ins_squad('flame-0104', 7), 24, 72, 4, true, 150, 0, null, null, null) $$,
  'P0001', 'insurance used up', 'and not a third');
select is(
  (select count(*) from public.expedition_runs where insured and discord_id in ('plain-0104', 'flame-0104'))::int, 3,
  'three insured runs stand: one for the collector, two for the patron');

select * from finish();
rollback;
