-- rename_player(): the coverage added on 2026-09-14, after an audit found
-- three tables holding a player's identity that the function never touched.
--
-- The print-run ledger is the one that mattered. Its counter is keyed on the
-- slug, so a rename that left it behind made the NEXT copy minted restart at
-- 1 and stamp a serial a collector was already holding, while every existing
-- copy silently lost its denominator. Nothing refused the duplicate, and the
-- function's own LEFTOVERS check did not count the table, so the rename
-- reported success. These assertions are what stops that returning.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(15);

select test_profile(0) as wanter \gset
select test_profile(0) as holder_a \gset
select test_profile(0) as holder_b \gset

-- ==== a plain rename ======================================================
insert into public.card_print_runs (season, edition_week, slug, minted) values
  ('S_COV', date '2026-09-07', public.card_slug('CovOld', 'NA1'), 43);
insert into public.card_wants (season, discord_id, slug, bounty, status) values
  ('S_COV', :'wanter', public.card_slug('CovOld', 'NA1'), 500, 'open');
insert into public.player_pool (id, season_key, display_name, normalized_name, role, opgg_url) values
  ('81000000-0000-0000-0000-0000000000a1', 'S_COV', 'CovOld#NA1', 'covold', 'mid',
   'https://op.gg/summoners/na/CovOld-NA1');

select lives_ok(
  $$ select * from public.rename_player('CovOld', 'NA1', 'CovNew', 'EUW') $$,
  'a rename with print runs, wants and a profile link goes through');

select is(
  (select minted from public.card_print_runs
    where season = 'S_COV' and slug = public.card_slug('CovNew', 'EUW')),
  43, 'the print counter moves to the new slug, so serials carry on from 43');

select is(
  (select count(*)::int from public.card_print_runs
    where slug = public.card_slug('CovOld', 'NA1')),
  0, 'and nothing is left parked under the old slug to restart from 1');

select is(
  (select slug from public.card_wants where discord_id = :'wanter'),
  public.card_slug('CovNew', 'EUW'), 'an open want follows the player');

select is(
  (select opgg_url from public.player_pool
    where id = '81000000-0000-0000-0000-0000000000a1'),
  'https://op.gg/summoners/na/CovNew-EUW', 'the profile link is rewritten');

-- The self-check is the whole point: it must be able to SEE these tables, or
-- a future miss reports zero and looks clean again.
select is(
  (select rows_affected from public.rename_player('CovOld', 'NA1', 'CovNew', 'EUW')
    where step = 'LEFTOVERS UNDER THE OLD IDENTITY'),
  0::bigint, 'LEFTOVERS is zero once print runs and wants are carried');

-- ==== a merge: both identities already have counters =======================
insert into public.card_print_runs (season, edition_week, slug, minted) values
  ('S_MRG', date '2026-09-07', public.card_slug('MrgOld', 'NA1'), 12),
  ('S_MRG', date '2026-09-07', public.card_slug('MrgNew', 'EUW'), 30);

select lives_ok(
  $$ select * from public.rename_player('MrgOld', 'NA1', 'MrgNew', 'EUW') $$,
  'a merge with counters on both sides goes through');

select is(
  (select minted from public.card_print_runs where season = 'S_MRG'),
  42, 'the counters are SUMMED — 12+30 is the only value no future stamp can hit');

select is(
  (select count(*)::int from public.card_print_runs where season = 'S_MRG'),
  1, 'and the two rows collapse into one');

-- ==== the report is honest about what it cannot fix ========================
-- Both halves are sitting on a counter of 1, so the stamp trigger hands each
-- of these copies the serial 2 under its own slug. Folding them gives one
-- slug holding two #2s. Renumbering would change a serial somebody already
-- holds, so the function reports the collision instead of rewriting it.
insert into public.card_print_runs (season, edition_week, slug, minted) values
  ('S_DUP', date '2026-09-07', public.card_slug('DupOld', 'NA1'), 1),
  ('S_DUP', date '2026-09-07', public.card_slug('DupNew', 'EUW'), 1);
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, card)
values
  (:'holder_a', 'S_DUP', public.card_slug('DupOld', 'NA1'), 'DupOld', 'Mid',
   date '2026-09-07', 80, 'gold', '{"slug":"dupold-na1"}'::jsonb),
  (:'holder_b', 'S_DUP', public.card_slug('DupNew', 'EUW'), 'DupNew', 'Mid',
   date '2026-09-07', 80, 'gold', '{"slug":"dupnew-euw"}'::jsonb);

select is(
  (select rows_affected from public.rename_player('DupOld', 'NA1', 'DupNew', 'EUW')
    where detail like 'duplicate serials%'),
  1::bigint, 'a serial shared by two merged copies is reported, not silently kept');

select is(
  (select count(*)::int from public.card_inventory
    where slug = public.card_slug('DupNew', 'EUW')),
  2, 'and both copies survive the merge — nothing is deleted to tidy the ledger');

-- ==== rehearsing a real rename found two more =============================
-- The pool is SUPPOSED to hold the lowercased name in normalized_name. One
-- row holds the tag instead, and matching on normalized_name alone skipped
-- that player's profile in silence — the exact shape of miss this function
-- exists to prevent.
insert into public.player_pool (id, season_key, display_name, normalized_name, role, opgg_url) values
  ('81000000-0000-0000-0000-0000000000c1', 'S_ODD', '08 Mitsu Eclipse#Chime', 'chime', 'mid',
   'https://op.gg/lol/summoners/na/08%20Mitsu%20Eclipse-Chime');

select lives_ok(
  $$ select * from public.rename_player('08 MITSU ECLIPSE', 'CHIME', 'Resolute', 'chime') $$,
  'a name with spaces and a pool row keyed on the tag goes through');

select is(
  (select display_name from public.player_pool
    where id = '81000000-0000-0000-0000-0000000000c1'),
  'Resolute#chime', 'a pool row whose normalized_name held the TAG is still found');

select is(
  (select normalized_name from public.player_pool
    where id = '81000000-0000-0000-0000-0000000000c1'),
  'resolute', 'and normalized_name is repaired to the name on the way past');

-- A real op.gg link percent-encodes its spaces and does not match the typed
-- case, so a literal replace() never fired on it.
select is(
  (select opgg_url from public.player_pool
    where id = '81000000-0000-0000-0000-0000000000c1'),
  'https://op.gg/lol/summoners/na/Resolute-chime',
  'the encoded, differently-cased profile link is rewritten and keeps its separator');

select * from finish();
rollback;
