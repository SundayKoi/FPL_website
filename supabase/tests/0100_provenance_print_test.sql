-- Provenance remembers what was printed — and keeps remembering after the
-- copy is melted, which is the whole point.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0100'::uuid, 'mint-0100', 'Minter');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('mint-0100', '00000000-0000-0000-0000-0000000e0100'::uuid, 'Minter', 1000);

select has_column('public', 'card_provenance', 'season', 'a provenance row knows its season');
select has_column('public', 'card_provenance', 'print', 'and the mint knows what was printed');

create temporary table shiny_copy on commit drop as
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card)
  values ('mint-0100', 'S_TEST_PRINT', 'print-1', 'Print Player', 'Mid', date '2026-08-24', 80, 'platinum',
          true, 'ice', true, '{"slug":"print-1","artSkin":7,"shiny":true,"stattrak":{"points":0,"since":"x"}}'::jsonb)
  returning id;

select is(
  (select season from public.card_provenance where inventory_id = (select id from shiny_copy) and event = 'minted'),
  'S_TEST_PRINT', 'the mint carries the season');
select is(
  (select print from public.card_provenance where inventory_id = (select id from shiny_copy) and event = 'minted'),
  '{"alt": true, "foil": true, "tier": "platinum", "champ": false, "shiny": true, "team": false, "moment": false,
    "secret": false, "signed": true, "stattrak": true, "foil_type": "ice", "edition_week": "2026-08-24"}'::jsonb,
  'and every flat fact of the print');

create temporary table plain_copy on commit drop as
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('mint-0100', 'S_TEST_PRINT', 'print-2', 'Plain Player', 'Mid', date '2026-08-24', 60, 'gold', false,
          '{"slug":"print-2","moment":{"id":1}}'::jsonb)
  returning id;

select is(
  (select print -> 'moment' from public.card_provenance where inventory_id = (select id from plain_copy) and event = 'minted'),
  'true'::jsonb, 'a moment is marked as one');
select is(
  (select print ->> 'foil_type' from public.card_provenance where inventory_id = (select id from plain_copy) and event = 'minted'),
  null, 'a matte copy has no parallel');

-- The whole point: melt it, and the mint still says what it was.
delete from public.card_inventory where id = (select id from shiny_copy);
select is(
  (select count(*) from public.card_inventory where id = (select id from shiny_copy))::int, 0, 'the copy is gone');
select is(
  (select print ->> 'signed' from public.card_provenance where inventory_id = (select id from shiny_copy) and event = 'minted'),
  'true', 'but its mint still says it was signed');
select is(
  (select season from public.card_provenance where inventory_id = (select id from shiny_copy) and event = 'dusted'),
  'S_TEST_PRINT', 'and the melt carries the season too');

select * from finish();
rollback;
