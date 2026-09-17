-- Season Card artwork is a cosmetic champion/skin pair, not a rewrite of the
-- calculated signature champion.  The database owns the identity, season,
-- eligibility, authorization, and atomic-write boundaries.
begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(19);

grant usage on schema tests to anon, authenticated;

insert into public.profiles (id, display_name, is_admin)
values
  (tests.admin_id(), 'Artwork Admin', true),
  (tests.cap(1), 'Artwork Stranger', false)
on conflict (id) do update set is_admin = excluded.is_admin;

insert into public.raw_stats (match_id, summoner_name, tag, champion, season, season_phase, win)
values
  ('ART_0122_1', 'Card Artist', 'NA1', 'Jhin', 'S5', 'Regular', true),
  ('ART_0122_2', 'Card Artist', 'NA1', 'Lux', 'S5', 'Regular', false),
  ('ART_0122_3', 'Card Artist', 'NA1', 'MonkeyKing', 'S5', 'Regular', true),
  ('ART_0122_4', 'Card Artist', 'NA2', 'Lux', 'S5', 'Regular', true),
  ('ART_0122_5', 'Card Artist', 'NA1', 'Lux', 'S4', 'Regular', true);

select has_column('public', 'card_art_prefs', 'art_champion', 'card art stores a separate champion override');
select has_function('public', 'save_card_art_preference', array['text', 'text', 'text', 'text', 'integer'], 'artwork save RPC exists');
select ok(has_function_privilege('authenticated', 'public.save_card_art_preference(text,text,text,text,integer)', 'execute'), 'authenticated editors can call artwork save');
select ok(not has_function_privilege('anon', 'public.save_card_art_preference(text,text,text,text,integer)', 'execute'), 'anonymous visitors cannot call artwork save');
select ok(has_table_privilege('anon', 'public.card_art_prefs', 'select'), 'card art remains publicly readable');

select tests.acting_as(tests.admin_id());

insert into public.card_art_prefs
  (season, summoner_name, tag, motto, signature, art_champion, skin)
values
  ('S5', 'Card Artist', 'NA1', 'Keep climbing.', 'data:image/png;base64,ink', null, 7);

select is(
  (select art_champion from public.save_card_art_preference('S5', 'Card Artist', 'NA1', 'MonkeyKing', 64)),
  'Wukong',
  'a played alias can be saved as the requested cosmetic champion');
select is((select skin from public.card_art_prefs where season = 'S5' and summoner_name = 'Card Artist' and tag = 'NA1'), 64, 'the selected skin is saved with the champion');
select is((select motto from public.card_art_prefs where season = 'S5' and summoner_name = 'Card Artist' and tag = 'NA1'), 'Keep climbing.', 'saving art preserves the motto');
select is((select signature from public.card_art_prefs where season = 'S5' and summoner_name = 'Card Artist' and tag = 'NA1'), 'data:image/png;base64,ink', 'saving art preserves the autograph');

select throws_ok($$
  select * from public.save_card_art_preference('S5', 'Card Artist', 'NA1', 'Ahri', 64)
$$, 'P0001', 'ART_CHAMPION_NOT_PLAYED', 'the RPC rejects an unplayed champion');
select is((select skin from public.card_art_prefs where season = 'S5' and summoner_name = 'Card Artist' and tag = 'NA1'), 64, 'a rejected champion leaves the existing pair unchanged');

select throws_ok($$
  insert into public.card_art_prefs (season, summoner_name, tag, art_champion, skin)
  values ('S5', 'Direct Write', 'NA1', 'Ahri', 0)
$$, 'P0001', 'ART_CHAMPION_NOT_PLAYED', 'the trigger rejects a direct unplayed-champion bypass');

select throws_ok($$
  select * from public.save_card_art_preference('S5', 'Card Artist', 'NA2', 'Jhin', 0)
$$, 'P0001', 'ART_CHAMPION_NOT_PLAYED', 'the full Riot tag is part of eligibility');
select throws_ok($$
  select * from public.save_card_art_preference('S4', 'Card Artist', 'NA1', 'Jhin', 0)
$$, 'P0001', 'ART_CHAMPION_NOT_PLAYED', 'a champion from another season cannot qualify');
select throws_ok($$
  select * from public.save_card_art_preference('S5', 'Card Artist', 'NA1', 'Jhin', 201)
$$, 'P0001', 'SKIN_INVALID', 'skin numbers outside the supported range are rejected');

select is(
  (select art_champion from public.save_card_art_preference('S5', 'Card Artist', 'NA1', null, 0)),
  null::text,
  'clearing the override returns to computed champion mode');
select is((select skin from public.card_art_prefs where season = 'S5' and summoner_name = 'Card Artist' and tag = 'NA1'), 0, 'clearing the override resets base art');

select tests.acting_as(tests.cap(1));
select throws_ok($$
  select * from public.save_card_art_preference('S5', 'Card Artist', 'NA1', 'Jhin', 0)
$$, 'P0001', 'CARD_ART_FORBIDDEN', 'another authenticated user cannot edit the identity');
select throws_ok($$
  insert into public.card_art_prefs (season, summoner_name, tag, art_champion, skin)
  values ('S5', 'Card Artist', 'NA1', null, 0)
$$, '42501', null, 'RLS blocks a direct unauthorized write');

select * from finish();
rollback;
