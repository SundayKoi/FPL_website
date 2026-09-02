-- Print-run numbers. The claim under test is that "#7 of 43" is a fact the
-- database assigns and then never restates: numbering is sequential within a
-- print, independent between prints, and the denominator is monotonic, so
-- melting a copy retires its number rather than freeing it.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(12);

-- One collector with enough of a balance that the dust below is a real
-- credit rather than a constraint violation.
create temp table who as select test_profile(5000) as id;

-- A copy of one print, with everything the roller would have set except the
-- serial — which is exactly what this test is about the caller NOT setting.
-- It returns the stamp the trigger chose: reading it back with a second
-- statement would work too, but a `where id = test_copy(...)` would not —
-- a volatile function in a qual against an empty table is never called at
-- all, and the test would pass by never having inserted anything.
create or replace function test_stamp(p_slug text, p_week date, p_foil text default null)
returns int language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, card)
  values ((select id from who), 'S5', p_slug, 'Someone', 'Mid', p_week, 90, 'master',
          p_foil is not null, p_foil, '{}'::jsonb)
  returning print_number;
$$;

create or replace function test_copy(p_slug text, p_week date, p_foil text default null)
returns bigint language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, card)
  values ((select id from who), 'S5', p_slug, 'Someone', 'Mid', p_week, 90, 'master',
          p_foil is not null, p_foil, '{}'::jsonb)
  returning id;
$$;

create or replace function test_minted(p_slug text, p_week date) returns int language sql as $$
  select minted from public.card_print_runs
   where season = 'S5' and edition_week = p_week and slug = p_slug;
$$;

-- ==== Sequential within a print ==========================================

select is(test_stamp('doug-na1', '2026-08-24'), 1,
  'the first copy a print ever stamps is #1');

select is(test_stamp('doug-na1', '2026-08-24'), 2,
  'the second is #2 — the caller never names a number, the trigger does');

create temp table third as select test_copy('doug-na1', '2026-08-24') as id;

select is(
  (select print_number from public.card_inventory where id = (select id from third)),
  3, 'and the third is #3');

select is(test_minted('doug-na1', '2026-08-24'), 3,
  'the print''s counter agrees with the highest stamp it handed out');

-- ==== Prints are independent =============================================
-- The key is (season, edition_week, slug): a different card in the same
-- week, and the same card in a different week, are different print runs and
-- each starts its own count at one.

select is(test_stamp('spies-na1', '2026-08-24'), 1,
  'a different card in the same week starts its own run at #1');

select is(test_stamp('doug-na1', '2026-08-31'), 1,
  'and so does the same card in a different edition week');

select is(test_minted('doug-na1', '2026-08-24'), 3,
  'neither of those touched the first print''s counter');

-- ==== Dusting retires a number, it does not free one =====================
-- The whole reason "of N" is minted-to-date: if N were a live count, this
-- dust would renumber every copy of the print that somebody else is holding.

select lives_ok(
  format($$select public.dust_card((select id from who), %s, 500)$$, (select id from third)),
  'a copy of the print is dusted');

select is(test_minted('doug-na1', '2026-08-24'), 3,
  'the counter does not decrease — the press ran three times whatever happened after');

select is(test_stamp('doug-na1', '2026-08-24'), 4,
  'so the next pull is #4, not a reissue of the number that just went to dust');

-- ==== Eclipse ============================================================
-- No special case in the trigger: a one-of-one is #1 of 1 because it is the
-- first thing its print ever stamped, and card_inventory_one_eclipse_per_print
-- is what stops a second Eclipse from ever joining it.

select is(test_stamp('kite-na1', '2026-08-24', 'eclipse'), 1,
  'an Eclipse on a print nobody has pulled from is #1');

select is(test_minted('kite-na1', '2026-08-24'), 1,
  'of 1 — the denominator comes from the same counter as everything else');

select * from finish();
rollback;
