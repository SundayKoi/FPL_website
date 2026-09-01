-- rename_player(): one function for a Riot rename, covering the two shapes it
-- comes in (a clean rename, and a merge when an ingest has already split the
-- player across both identities) and the case where it must refuse.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(22);

-- ==== card_slug must agree with cardSlug() in src/lib/cards/build.ts =======
-- THIS CASE TABLE IS SHARED. src/lib/cards/slugBridge.test.ts reads the rows
-- below out of this file and asserts the TypeScript produces the same answer,
-- so the two implementations cannot drift apart in silence. Add a case here
-- and the TypeScript side picks it up on the next run.
-- SLUG_CASES_BEGIN
select is(public.card_slug('YWGI', 'Rain'), 'ywgi-rain', 'plain name and tag');
select is(public.card_slug('Icy Rain', 'YWGI'), 'icy-rain-ywgi', 'a space becomes a hyphen');
select is(public.card_slug('Archêr', 'ezpz'), 'archer-ezpz', 'diacritics fold away');
select is(public.card_slug('Imperialarcher', 'ezpz'), 'imperialarcher-ezpz', 'the identity it replaced');
select is(public.card_slug('Killer  Python', 'NA1'), 'killer-python-na1', 'a run of spaces is one hyphen');
select is(public.card_slug('-Edge-', 'NA1'), 'edge-na1', 'leading and trailing hyphens are trimmed');
select is(public.card_slug('MMO', 'NA1'), 'mmo-na1', 'already lowercase-safe');
-- SLUG_CASES_END

-- ==== fixtures ============================================================
insert into public.league_teams (id, name, abbreviation) values
  ('80000000-0000-0000-0000-000000000001', 'Rename FC', 'RFC');
insert into public.profiles (id, display_name) values
  ('80000000-0000-0000-0000-0000000000f1', 'The Player')
  on conflict (id) do nothing;

insert into public.riot_accounts (id, game_name, tag_line) values
  ('80000000-0000-0000-0000-0000000000a1', 'Oldname', 'OLD');
insert into public.roster_memberships (riot_account_id, season, league_team_id) values
  ('80000000-0000-0000-0000-0000000000a1', 'S5', '80000000-0000-0000-0000-000000000001');

insert into public.raw_stats (match_id, summoner_name, tag, team_name, game_date)
  values ('NA1_R0000001', 'Oldname', 'OLD', 'Rename FC', '2026-07-01'),
         ('NA1_R0000002', 'Oldname', 'OLD', 'Rename FC', '2026-07-02'),
         -- Already filed under the NEW identity: an ingest ran after the
         -- rename. This is what makes it a merge rather than a rename.
         ('NA1_R0000003', 'Newname', 'NEW', 'Rename FC', '2026-07-09');

insert into public.card_art_prefs (season, summoner_name, tag, skin, motto) values
  ('S5', 'Oldname', 'OLD', 4, 'the old motto');
-- Ink applied AFTER the rename, so it exists only on the new side.
insert into public.card_art_prefs (season, summoner_name, tag, signature) values
  ('S5', 'Newname', 'NEW', 'data:image/png;base64,SU5L');
insert into public.card_claims (season, summoner_name, tag, status, profile_id) values
  ('S5', 'Oldname', 'OLD', 'approved', '80000000-0000-0000-0000-0000000000f1');

-- ==== the merge ===========================================================

select lives_ok(
  $$select * from public.rename_player('Oldname', 'OLD', 'Newname', 'NEW')$$,
  'a split identity merges rather than colliding on the unique index');

select is(
  (select count(*) from public.raw_stats where summoner_name = 'Newname' and tag = 'NEW'),
  3::bigint, 'all three games end up under one identity');
select is(
  (select count(*) from public.raw_stats where summoner_name = 'Oldname'),
  0::bigint, 'and none are left behind');

-- The heart of it: neither side''s content may be lost. Skin and motto came
-- from the old row, the signature only ever existed on the new one.
select is(
  (select count(*) from public.card_art_prefs
    where summoner_name = 'Newname' and tag = 'NEW'),
  1::bigint, 'the two art-pref rows collapse into one');
select is(
  (select motto from public.card_art_prefs where summoner_name = 'Newname'),
  'the old motto', 'the motto survives from the old side');
select is(
  (select skin from public.card_art_prefs where summoner_name = 'Newname'),
  4, 'so does the skin');
select is(
  (select signature from public.card_art_prefs where summoner_name = 'Newname'),
  'data:image/png;base64,SU5L',
  'and the signature inked AFTER the rename is not thrown away with its row');

select is(
  (select profile_id from public.card_claims where summoner_name = 'Newname'),
  '80000000-0000-0000-0000-0000000000f1'::uuid,
  'the claim carries over with its profile untouched — the discord link holds');

-- The riot_accounts row roster_memberships points at is the one that must
-- survive, or the player silently leaves their team.
select is(
  (select count(*) from public.roster_memberships rm
     join public.riot_accounts ra on ra.id = rm.riot_account_id
    where ra.game_name = 'Newname'),
  1::bigint, 'the roster membership still resolves after the merge');

-- ==== it is safe to run twice =============================================

select lives_ok(
  $$select * from public.rename_player('Oldname', 'OLD', 'Newname', 'NEW')$$,
  'running it again is harmless');
select is(
  (select count(*) from public.raw_stats where summoner_name = 'Newname'),
  3::bigint, 'and changes nothing');

-- ==== the refusals ========================================================

select throws_ok(
  $$select * from public.rename_player('Newname', 'NEW', 'Newname', 'NEW')$$,
  'P0001', null, 'renaming someone to themselves is refused');

select throws_ok(
  $$select * from public.rename_player('Newname', 'NEW', '', '')$$,
  'P0001', null, 'an empty new identity is refused');

-- Two people, caught by the one fact that proves it: the same game, on
-- opposite sides. Nothing may be written.
insert into public.riot_accounts (game_name, tag_line) values ('Rival', 'RIV');
insert into public.raw_stats (match_id, summoner_name, tag, team_name, game_date)
  values ('NA1_R0000003', 'Rival', 'RIV', 'Some Other Team', '2026-07-09');

select throws_ok(
  $$select * from public.rename_player('Newname', 'NEW', 'Rival', 'RIV')$$,
  'P0001', null, 'two players who met in a game are never merged');
select is(
  (select count(*) from public.raw_stats where summoner_name = 'Newname'),
  3::bigint, 'and the refusal leaves both of them exactly as they were');

select * from finish();
rollback;
