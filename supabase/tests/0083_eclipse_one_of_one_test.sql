-- Eclipse: the two rules the database owns, because the application cannot
-- be the thing that guarantees "there is only one of these".
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

insert into public.betting_profiles (discord_id, username, balance)
  values ('900000000000000001', 'Collector', 5000)
  on conflict (discord_id) do nothing;

create or replace function tests.copy(p_slug text, p_week date, p_foil text)
returns bigint language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, card)
  values ('900000000000000001', 'S5', p_slug, 'Someone', 'Mid', p_week, 90, 'master',
          p_foil is not null, p_foil, '{}'::jsonb)
  returning id;
$$;

-- ==== Rule 1: one Eclipse per card, per week, forever =====================

select lives_ok(
  $$select tests.copy('doug-na1', '2026-08-24', 'eclipse')$$,
  'the first Eclipse of a print is mintable');

select throws_ok(
  $$select tests.copy('doug-na1', '2026-08-24', 'eclipse')$$,
  '23505',
  null,
  'the second one is refused by the database, not by whoever remembered to check');

-- The scope of "only one" is the PRINT, not the player and not the week.
select lives_ok(
  $$select tests.copy('doug-na1', '2026-08-31', 'eclipse')$$,
  'the same player can have an Eclipse in a DIFFERENT week — each week has its own');
select lives_ok(
  $$select tests.copy('spies-na1', '2026-08-24', 'eclipse')$$,
  'and a different Card of the Week in the SAME week has its own too');

-- Everything that is not an Eclipse is untouched by the index: ordinary
-- copies duplicate freely, which is the whole point of a collectible.
select lives_ok(
  $$select tests.copy('doug-na1', '2026-08-24', 'ice'),
           tests.copy('doug-na1', '2026-08-24', 'ice'),
           tests.copy('doug-na1', '2026-08-24', null),
           tests.copy('doug-na1', '2026-08-24', null)$$,
  'ordinary and Cracked Ice copies still stack as many as anyone pulls');

-- ==== Rule 2: it cannot be dusted =========================================

create temp table ec as select tests.copy('kite-na1', '2026-08-24', 'eclipse') as id;

select throws_ok(
  format($$select public.dust_card('900000000000000001', %s, 500)$$, (select id from ec)),
  'P0001',
  'eclipse cannot be dusted',
  'dusting a one-of-one is refused inside the RPC, so no caller can route around it');

select is(
  (select count(*) from public.card_inventory where id = (select id from ec)),
  1::bigint, 'and the refusal leaves the copy exactly where it was');

select is(
  (select balance from public.betting_profiles where discord_id = '900000000000000001'),
  5000::bigint, 'no dust was credited for a card that was never destroyed');

-- The refusal is specific to Eclipse, not a blanket ban on dusting foils —
-- a Cracked Ice is still just a very good card.
create temp table ice as select tests.copy('kite-na1', '2026-08-24', 'ice') as id;
select lives_ok(
  format($$select public.dust_card('900000000000000001', %s, 500)$$, (select id from ice)),
  'every other parallel still dusts normally');

select * from finish();
rollback;
