-- The lane diffs added to stats_player_agg by 20261008000001.
--
-- Two things are being proved here. The first is arithmetic: a diff is
-- against the person in the same game, same role, other side, and a game
-- that ended before the mark is left OUT of that mark's average rather than
-- counted as a zero. The second is that adding the diffs did not disturb
-- the view that was already there — in particular that a game whose role
-- assignment puts two players on one side in the same role does not get
-- counted twice in `games`, which is the failure mode a naive join on
-- match_id + role would have produced silently.
--
-- Season 'ZL' is a throwaway that exists only inside this transaction, so
-- every assertion below is about these rows and no others.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ── The shape ────────────────────────────────────────────────────────
select has_column('public', 'stats_player_agg', 'avg_cs_diff_15', 'the view carries a CS diff at 15');
select has_column('public', 'stats_player_agg', 'avg_gold_diff_20', 'and a gold diff at 20');
select has_column('public', 'stats_player_agg', 'avg_xp_diff_10', 'and an XP diff at 10');
select has_column('public', 'stats_player_agg', 'lane_games_20',
  'and the count of games each average was actually taken over');

-- ── The fixture ──────────────────────────────────────────────────────
-- LaneA plays MIDDLE three times against LaneB.
--   ZL_G1: a clean win, all three marks reached.
--   ZL_G2: a 17-minute game — nobody has an @20 frame.
--   ZL_G3: the role data is broken. RED has TWO MIDDLE rows. Their numbers
--          are identical to each other AND to LaneA's, so the diff is zero
--          whichever of them is picked, and the only thing this game can
--          prove is whether it got counted once or twice.
-- JungA plays JUNGLE in ZL_G1 with no jungler on the other side at all.
insert into public.raw_stats (
  match_id, game_date, season, season_phase, team_side, team_name,
  summoner_name, tag, champion, role, kills, deaths, assists,
  win, game_duration_min,
  cs_at_10, gold_at_10, xp_at_10,
  cs_at_15, gold_at_15, xp_at_15,
  cs_at_20, gold_at_20, xp_at_20
) values
  ('ZL_G1', '2026-01-01 20:00', 'ZL', 'Regular', 'Blue', 'Blue Squad',
   'LaneA', 'NA1', 'Ahri', 'MIDDLE', 5, 1, 4, true, 30,
   80, 3400, 4700, 130, 5600, 7200, 180, 7500, 9500),
  ('ZL_G1', '2026-01-01 20:00', 'ZL', 'Regular', 'Red', 'Red Squad',
   'LaneB', 'NA1', 'Zed', 'MIDDLE', 1, 5, 2, false, 30,
   70, 3200, 4500, 120, 5200, 6900, 170, 7000, 9000),
  ('ZL_G1', '2026-01-01 20:00', 'ZL', 'Regular', 'Blue', 'Blue Squad',
   'JungA', 'NA1', 'Lee Sin', 'JUNGLE', 3, 2, 9, true, 30,
   55, 3100, 4400, 90, 4900, 6600, 125, 6600, 8700),

  ('ZL_G2', '2026-01-02 20:00', 'ZL', 'Regular', 'Blue', 'Blue Squad',
   'LaneA', 'NA1', 'Ahri', 'MIDDLE', 2, 4, 3, false, 17,
   60, 3000, 4200, 100, 4800, 6400, null, null, null),
  ('ZL_G2', '2026-01-02 20:00', 'ZL', 'Regular', 'Red', 'Red Squad',
   'LaneB', 'NA1', 'Zed', 'MIDDLE', 4, 2, 5, true, 17,
   64, 3100, 4300, 108, 5000, 6600, null, null, null),

  ('ZL_G3', '2026-01-03 20:00', 'ZL', 'Regular', 'Blue', 'Blue Squad',
   'LaneA', 'NA1', 'Ahri', 'MIDDLE', 3, 3, 3, true, 28,
   70, 3300, 4600, 115, 5300, 7000, 165, 7100, 9100),
  ('ZL_G3', '2026-01-03 20:00', 'ZL', 'Regular', 'Red', 'Red Squad',
   'LaneB', 'NA1', 'Zed', 'MIDDLE', 3, 3, 3, false, 28,
   70, 3300, 4600, 115, 5300, 7000, 165, 7100, 9100),
  ('ZL_G3', '2026-01-03 20:00', 'ZL', 'Regular', 'Red', 'Red Squad',
   'LaneC', 'NA1', 'Yone', 'MIDDLE', 3, 3, 3, false, 28,
   70, 3300, 4600, 115, 5300, 7000, 165, 7100, 9100);

create temporary table lane_a as
select * from public.stats_player_agg
where summoner_name = 'LaneA' and tag = 'NA1' and season = 'ZL' and season_phase = 'Regular';

-- ── The counting was not disturbed ───────────────────────────────────
select is((select games from lane_a)::int, 3,
  'three games, not four — the duplicated MIDDLE row on the other side must not double ZL_G3');
select is((select avg_cs_at_10 from lane_a), 70.00::numeric,
  'the at-10 averages are untouched: card ratings read them and this migration only adds');

-- ── The diffs ────────────────────────────────────────────────────────
-- @10: +10, -4, 0 over three games.
select is((select avg_cs_diff_10 from lane_a), 2.00::numeric, 'CS diff at 10 is the mean of the three games');
select is((select avg_gold_diff_10 from lane_a), 33.33::numeric, 'gold diff at 10 likewise');
select is((select avg_xp_diff_10 from lane_a), 33.33::numeric, 'XP diff at 10 likewise');

-- @15: +10, -8, 0.
select is((select avg_cs_diff_15 from lane_a), 0.67::numeric, 'CS diff at 15, where the losing game pulls it back near even');
select is((select avg_gold_diff_15 from lane_a), 66.67::numeric, 'gold diff at 15');
select is((select avg_xp_diff_15 from lane_a), 33.33::numeric, 'XP diff at 15');

-- @20: +10 and 0 over the TWO games that reached 20 minutes. The 17-minute
-- game is absent, not zero — averaging it in as a zero would quietly report
-- every short game as a dead-even lane.
select is((select avg_cs_diff_20 from lane_a), 5.00::numeric,
  'CS diff at 20 averages only the games that reached 20 minutes');
select is((select avg_gold_diff_20 from lane_a), 250.00::numeric, 'gold diff at 20 the same way');
select is((select avg_xp_diff_20 from lane_a), 250.00::numeric, 'XP diff at 20 the same way');

select is((select lane_games_10 from lane_a)::int, 3, 'three games had a @10 diff');
select is((select lane_games_15 from lane_a)::int, 3, 'three had a @15 diff');
select is((select lane_games_20 from lane_a)::int, 2,
  'only two had a @20 diff — this is the number the page has to weight by');

-- ── No opponent at all ───────────────────────────────────────────────
-- A jungler with nobody logged opposite them still gets a row, with an
-- empty lane rather than a fabricated zero.
create temporary table jung_a as
select * from public.stats_player_agg
where summoner_name = 'JungA' and tag = 'NA1' and season = 'ZL';

select is((select games from jung_a)::int, 1,
  'the player is still in the view when no opposite number exists — the join is a LEFT join');
select is((select lane_games_10 from jung_a)::int, 0, 'and no game counted toward a diff');
select ok((select avg_cs_diff_10 from jung_a) is null,
  'the diff is null, not zero: "no data" and "dead even" are different answers');

-- ── The door ─────────────────────────────────────────────────────────
select ok(has_table_privilege('anon', 'public.stats_player_agg', 'select'),
  'the stats page reads this view anonymously, as it always has');

select * from finish();
rollback;
