-- Expeditions, the base camp (*_expedition_base_camp.sql): a camp grows
-- only at the price of the level the lock finds, every dollar it costs is
-- ledgered in the same transaction, a second squad slot lets a second
-- Scouting Run out and nothing else, and a forged policy insures one
-- launch a week outside the weekly cap. Only the service role can buy,
-- price or launch.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(48);

-- === fixture =================================================================
-- camp:  builds everything, launches forged and plain.
-- plain: no camp at all.
-- forge: forges a policy and launches forged FIRST, then a bought policy.
-- poor:  cannot afford a tent.
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000a0131'::uuid, 'camp-0131', 'Camper'),
  ('00000000-0000-0000-0000-0000000b0131'::uuid, 'plain-0131', 'Plain'),
  ('00000000-0000-0000-0000-0000000c0131'::uuid, 'forge-0131', 'Smith'),
  ('00000000-0000-0000-0000-0000000d0131'::uuid, 'poor-0131', 'Poor');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('camp-0131', '00000000-0000-0000-0000-0000000a0131'::uuid, 'Camper', 10000),
  ('plain-0131', '00000000-0000-0000-0000-0000000b0131'::uuid, 'Plain', 5000),
  ('forge-0131', '00000000-0000-0000-0000-0000000c0131'::uuid, 'Smith', 5000),
  ('poor-0131', '00000000-0000-0000-0000-0000000d0131'::uuid, 'Poor', 100);

insert into public.expedition_supplies (discord_id, fragments) values
  ('camp-0131', 10),
  ('forge-0131', 4);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select owner, 'S_TEST_CAMP', 'camp-' || owner || '-' || n, 'Camp Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'camp-' || n)
from unnest(array['camp-0131', 'plain-0131', 'forge-0131']) owner, generate_series(1, 15) n;

-- Three cards of `p_owner`'s, the `p_from`th onward.
create or replace function tests.camp_squad(p_owner text, p_from int) returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from (
    select id from public.card_inventory
    where season = 'S_TEST_CAMP' and discord_id = p_owner order by id offset p_from - 1 limit 3
  ) s
$$;

-- === 1. the price is the lock's, and a refusal writes nothing ==============
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'slot', 1000, 1) $$,
  'P0001', 'bad price', 'a slot at the wrong price is refused');
select is((select count(*) from public.expedition_camps where discord_id = 'camp-0131')::int, 0,
  'and the refusal leaves no camp behind');
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'moat', 0, 0) $$,
  'P0001', 'unknown upgrade', 'a camp builds only what it knows');
select throws_ok($$ select * from public.upgrade_expedition_camp('poor-0131', 'tent', 600, 0) $$,
  'P0001', 'insufficient balance', 'a tent the wallet cannot cover is refused');
select throws_ok($$ select * from public.upgrade_expedition_camp('plain-0131', 'slot', 1500, 1) $$,
  'P0001', 'not enough fragments', 'a slot without the fragment is refused');
select throws_ok($$ select * from public.upgrade_expedition_camp('nobody-0131', 'wall', 300, 0) $$,
  'P0001', 'unknown user nobody-0131', 'a camp needs a wallet');

-- === 2. the slot ============================================================
create temporary table camp_slot on commit drop as
  select * from public.upgrade_expedition_camp('camp-0131', 'slot', 1500, 1);

select is((select slots || '/' || balance || '/' || fragments from camp_slot), '1/8500/9',
  'a slot bought: one slot, $1,500 and a fragment gone');
select is((select array_agg(delta order by id) from public.betting_ledger
           where discord_id = 'camp-0131' and reason = 'expedition_camp'), array[-1500]::bigint[],
  'the $1,500 is ledgered as expedition_camp');
select is((select bp.balance || '/' || s.fragments from public.betting_profiles bp
           join public.expedition_supplies s using (discord_id) where bp.discord_id = 'camp-0131'), '8500/9',
  'the wallet and the pouch say what the purchase said');
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'slot', 1500, 1) $$,
  'P0001', 'already built', 'one extra slot is the most a camp holds');

-- === 3. two Scouting Runs at once, and only Scouting Runs ===================
select lives_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('camp-0131', 1), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'a first Scouting Run goes out');
select lives_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('camp-0131', 4), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'with the slot, a second goes out beside it');
select throws_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('camp-0131', 7), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'P0001', 'tier already out', 'a third does not');
select lives_ok($$
  select * from public.launch_expedition('plain-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('plain-0131', 1), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'a collector without a camp sends one');
select throws_ok($$
  select * from public.launch_expedition('plain-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('plain-0131', 4), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'P0001', 'tier already out', 'and not two');

-- === 4. the tent ============================================================
select is((select tent from public.upgrade_expedition_camp('camp-0131', 'tent', 600, 0)), 1,
  'a tent for $600');
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'tent', 600, 0) $$,
  'P0001', 'bad price', 'a second click at the first level''s price does not buy the second level');
select is((select tent from public.upgrade_expedition_camp('camp-0131', 'tent', 1200, 1)), 2,
  'the bigger tent for $1,200 and a fragment');
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'tent', 1200, 1) $$,
  'P0001', 'already built', 'two is the top of the tent');

-- === 5. the forge ===========================================================
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'policy', 0, 2) $$,
  'P0001', 'forge not built', 'no forged policy without a forge');
select is((select forge from public.upgrade_expedition_camp('camp-0131', 'forge', 800, 1)), 1,
  'a forge for $800 and a fragment');
select is((select forged_policies || '/' || fragments || '/' || balance
           from public.upgrade_expedition_camp('camp-0131', 'policy', 0, 2)), '1/5/5900',
  'a policy forged for two fragments and no dollars');
select is((select forged_policies from public.upgrade_expedition_camp('camp-0131', 'policy', 0, 2)), 2,
  'a second held');
select throws_ok($$ select * from public.upgrade_expedition_camp('camp-0131', 'policy', 0, 2) $$,
  'P0001', 'forge is full', 'two is the most a forge holds');
select is((select array_agg(delta order by id) from public.betting_ledger
           where discord_id = 'camp-0131' and reason = 'expedition_camp'), array[-1500, -600, -1200, -800]::bigint[],
  'every dollar the camp cost has its ledger row, and a policy costs none');
select is((select c.spent || '/' || bp.balance from public.expedition_camps c
           join public.betting_profiles bp using (discord_id) where c.discord_id = 'camp-0131'), '4100/5900',
  'the camp''s running total is the ledger''s');

-- === 6. a forged launch =====================================================
select lives_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('camp-0131', 7), 14, 24, 2, true, 150, 0, null, null, null) $$,
  'a bought policy spends the week''s one');
select throws_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'legend', tests.camp_squad('camp-0131', 10), 22, 48, 3, true, 150, 0, null, null, null) $$,
  'P0001', 'insurance used up', 'so a second bought policy is refused');

create temporary table forged_launch on commit drop as
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'legend', tests.camp_squad('camp-0131', 10), 22, 48, 3, false, 0, 0, null, null, null, true);

select is((select insured || '/' || forged from public.expedition_runs where id = (select run_id from forged_launch)), 'true/true',
  'but a forged policy insures the Legend Hunt with the cap already spent');
select is((select forged_policies from public.expedition_camps where discord_id = 'camp-0131'), 1,
  'and is spent from the forge');
select is((select array_agg(delta order by id) from public.betting_ledger
           where discord_id = 'camp-0131' and reason = 'expedition_fee'), array[-150]::bigint[],
  'with no fee: only the bought policy paid one');
select throws_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('camp-0131', 13), 14, 24, 2, false, 0, 0, null, null, null, true) $$,
  'P0001', 'forge spent this week', 'one forged launch a week, with a policy still held');
select throws_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'scout', tests.camp_squad('camp-0131', 13), 9, 8, 1, false, 0, 0, null, null, null, true) $$,
  'P0001', 'policy not wanted', 'a Scouting Run takes no policy');
select throws_ok($$
  select * from public.launch_expedition('camp-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('camp-0131', 13), 14, 24, 2, true, 150, 0, null, null, null, true) $$,
  'P0001', 'forged policy stands alone', 'a forged launch buys no second policy');
select is((select forged_policies from public.expedition_camps where discord_id = 'camp-0131'), 1,
  'and a refused forged launch keeps the policy');

-- === 7. a forged run never uses up the week =================================
select lives_ok($$ select * from public.upgrade_expedition_camp('forge-0131', 'forge', 800, 1) $$,
  'the smith builds a forge');
select lives_ok($$ select * from public.upgrade_expedition_camp('forge-0131', 'policy', 0, 2) $$,
  'and forges a policy');
select lives_ok($$
  select * from public.launch_expedition('forge-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('forge-0131', 1), 14, 24, 2, false, 0, 0, null, null, null, true) $$,
  'a forged launch first');
select lives_ok($$
  select * from public.launch_expedition('forge-0131', 'S_TEST_CAMP', 'legend', tests.camp_squad('forge-0131', 4), 22, 48, 3, true, 150, 0, null, null, null) $$,
  'then the week''s bought policy is still there');
select is((select count(*) filter (where insured) || '/' || count(*) filter (where forged)
           from public.expedition_runs where discord_id = 'forge-0131'), '2/1',
  'two insured runs, one of them forged');

-- === 8. no camp, no forged policy; p_forged false is a plain launch =========
select throws_ok($$
  select * from public.launch_expedition('plain-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('plain-0131', 4), 14, 24, 2, false, 0, 0, null, null, null, true) $$,
  'P0001', 'no forged policy', 'a forged launch needs a forged policy');
select lives_ok($$
  select * from public.launch_expedition('plain-0131', 'S_TEST_CAMP', 'raid', tests.camp_squad('plain-0131', 4), 14, 24, 2, false, 0, 0, null, null, null, false) $$,
  'the 14-argument launch without a forged policy is the plain launch');
select is((select insured || '/' || forged from public.expedition_runs where discord_id = 'plain-0131' and tier = 'raid'), 'false/false',
  'uninsured and not forged');

-- === 9. who reads, who writes, who calls ====================================
select tests.acting_as('00000000-0000-0000-0000-0000000a0131'::uuid);
set local role authenticated;
select is((select array_agg(discord_id) from public.expedition_camps), array['camp-0131'],
  'an owner reads their own camp and nobody else''s');
select throws_ok($$ update public.expedition_camps set wall = 2 $$,
  '42501', null, 'and cannot build it by hand');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.expedition_camps $$,
  '42501', null, 'anon cannot read camps at all');
reset role;

select is(
  array[
    has_function_privilege('authenticated', 'public.expedition_camp_price(text, int)', 'execute'),
    has_function_privilege('authenticated', 'public.upgrade_expedition_camp(text, text, bigint, int)', 'execute'),
    has_function_privilege('authenticated', 'public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)', 'execute'),
    has_function_privilege('authenticated', 'public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text, boolean)', 'execute'),
    has_function_privilege('anon', 'public.upgrade_expedition_camp(text, text, bigint, int)', 'execute'),
    has_function_privilege('anon', 'public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text, boolean)', 'execute')
  ],
  array[false, false, false, false, false, false],
  'authenticated and anon can execute none of them');
select is(
  array[
    has_function_privilege('service_role', 'public.expedition_camp_price(text, int)', 'execute'),
    has_function_privilege('service_role', 'public.upgrade_expedition_camp(text, text, bigint, int)', 'execute'),
    has_function_privilege('service_role', 'public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date)', 'execute'),
    has_function_privilege('service_role', 'public.launch_expedition(text, text, text, bigint[], int, int, int, boolean, bigint, int, bigint, date, text, boolean)', 'execute')
  ],
  array[true, true, true, true],
  'the service role can execute all of them');

select * from finish();
rollback;
