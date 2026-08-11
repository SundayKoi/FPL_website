begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- 1-5: the five views exist
select has_view('public', 'stats_player_agg', 'stats_player_agg view exists');
select has_view('public', 'stats_team_agg', 'stats_team_agg view exists');
select has_view('public', 'stats_champion_agg', 'stats_champion_agg view exists');
select has_view('public', 'stats_records', 'stats_records view exists');
select has_view('public', 'stats_game_log', 'stats_game_log view exists');

-- Fix round (Task 7 review): stats_records must carry `tag` alongside
-- summoner_name -- 6 real summoner_names in raw_stats are shared by two
-- distinct tags (different people, e.g. Aura#5950 vs Aura#RGB0), so
-- attributing a record by summoner_name alone collides.
select has_column('public', 'stats_records', 'tag', 'stats_records has a tag column (fix round: name+tag attribution)');

-- Fixture: 2 synthetic games in a throwaway season 'ZZ' / phase 'Regular'.
-- Game 1 (ZZ_G1): TestGuy (Blue, Ahri) beats FakeFoe (Red, Zed). TestGuy wins.
-- Game 2 (ZZ_G2): TestGuy (Blue, Ahri) loses to FakeFoe (Red, Garen).
-- ZZ_G1: Ahri banned by BOTH sides (ban_1='Ahri' on every player row of
-- Blue, and ALSO ban_1='Ahri' on Red) -> counts once for the game, per the
-- brief's "count per game not per player-row" rule. ZZ_G2 has no Ahri ban
-- at all (both sides ban Yasuo instead) -> Ahri bans across the ZZ scope = 1.
insert into public.raw_stats (
  match_id, game_date, season, season_phase, team_side, team_name,
  summoner_name, tag, champion, role, kills, deaths, assists, kda,
  kill_participation_pct, total_damage_to_champions, damage_per_min,
  cs, cs_per_min, gold_earned, vision_score, win, game_duration_min,
  team_dragons, team_first_dragon, team_barons, team_first_blood, team_first_tower,
  ban_1, ban_2, ban_3, ban_4, ban_5
) values
  -- Game 1: Blue side (TestGuy + a teammate), Ahri banned both sides.
  -- TestGuy: 20000 dmg / 25 min = 800/min per-game rate (== stored damage_per_min).
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'TestGuy', 'NA1', 'Ahri', 'MIDDLE', 10, 2, 8, 9.0,
   80.0, 20000, 800, 200, 8.0, 12000, 30, true, 25,
   3, true, 1, true, true,
   'Ahri', 'Zed', null, null, null),
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'BlueMate', 'NA1', 'Garen', 'TOP', 4, 3, 6, 3.33,
   60.0, 15000, 600, 180, 7.0, 10000, 20, true, 25,
   3, true, 1, true, true,
   'Ahri', 'Zed', null, null, null),
  -- Game 1: Red side, different bans (Ahri also banned here -> same match_id+ban dedupes to 1)
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Red', 'Red Squad',
   'FakeFoe', 'NA1', 'Zed', 'MIDDLE', 2, 10, 3, 0.5,
   40.0, 10000, 400, 150, 6.0, 9000, 15, false, 25,
   0, false, 0, false, false,
   'Ahri', 'Yasuo', null, null, null),
  -- Game 2: TestGuy loses on Ahri, Ahri banned only here on blue (still just 1/game).
  -- TestGuy: 6000 dmg / 15 min = 400/min per-game rate (deliberately different
  -- duration from Game 1's 25 min, so an unweighted avg() of the two games'
  -- per-game rates -- (800+400)/2=600 -- would differ from the duration-weighted
  -- sum(damage)/sum(duration) -- (20000+6000)/(25+15)=650 -- this test asserts
  -- the latter).
  ('ZZ_G2', '2026-01-02 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'TestGuy', 'NA1', 'Ahri', 'MIDDLE', 1, 6, 2, 0.5,
   30.0, 6000, 400, 140, 5.0, 8000, 18, false, 15,
   1, false, 0, false, false,
   'Yasuo', null, null, null, null),
  ('ZZ_G2', '2026-01-02 20:00', 'ZZ', 'Regular', 'Red', 'Red Squad',
   'FakeFoe', 'NA1', 'Garen', 'TOP', 9, 1, 5, 14.0,
   85.0, 22000, 900, 210, 9.0, 13000, 25, true, 15,
   4, true, 2, true, true,
   'Yasuo', null, null, null, null);

-- games=2, wins=1 -> winrate 50.0
select ok(
  (select games = 2 and wins = 1 and winrate_pct = 50.0
   from public.stats_player_agg
   where summoner_name = 'TestGuy' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_player_agg: TestGuy games=2 wins=1 winrate_pct=50.0'
);

-- KDA math: sums(kills+assists)/max(sums(deaths),1) = (10+1 + 8+2)/max(2+6,1) = 21/8 = 2.625 -> round 2.63
select ok(
  (select kda = 2.63
   from public.stats_player_agg
   where summoner_name = 'TestGuy' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_player_agg: TestGuy kda = 2.63 (sum-based, not avg-of-per-game)'
);

-- avg_dmg_per_min: duration-weighted sum(damage)/sum(duration), matching
-- the legacy dashboard's aggregate() (docs/reference/FPL_Stats_legacy.html
-- line 891: damagePerMin:+(s.damage/d).toFixed(1)) -- NOT an unweighted
-- average of each game's own damage_per_min rate. TestGuy: G1 20000dmg/25min
-- (rate 800/min), G2 6000dmg/15min (rate 400/min). Duration-weighted:
-- (20000+6000)/(25+15) = 26000/40 = 650.00. Unweighted avg of the two
-- games' rates would give (800+400)/2 = 600.00 -- a different, wrong value
-- this assertion rules out.
select ok(
  (select avg_dmg_per_min = 650.00
   from public.stats_player_agg
   where summoner_name = 'TestGuy' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_player_agg: TestGuy avg_dmg_per_min = 650.00 (duration-weighted sum/sum, not avg-of-per-game rates)'
);

-- champion bans: Ahri appears in ban_1 on both team-rows of Blue in G1 (2 rows,
-- same side) AND on Red in G1 (1 row, other side) = 3 raw rows across ZZ_G1,
-- all deduped to (match_id='ZZ_G1', ban='Ahri') = 1 event -- banned by BOTH
-- teams in the same game still counts once for that game, not once per side.
-- ZZ_G2 has no Ahri ban at all. Total across the ZZ scope: bans = 1.
select ok(
  (select bans = 1
   from public.stats_champion_agg
   where champion = 'Ahri' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_champion_agg: Ahri bans = 1 (deduped per game incl. banned-by-both-teams)'
);

-- stats_records: Most Kills category present with FakeFoe's 9-kill game 2 on top for ZZ scope
select ok(
  (select count(*) = 1
   from public.stats_records
   where category = 'Most Kills' and season = 'ZZ' and season_phase = 'Regular'
     and summoner_name = 'FakeFoe' and value = 9),
  'stats_records: Most Kills top row for ZZ is FakeFoe with value 9'
);

-- stats_game_log: winner_team for ZZ_G1 is Blue Squad (TestGuy''s team, side Blue, win=true)
select ok(
  (select winner_team = 'Blue Squad' and blue_team = 'Blue Squad' and red_team = 'Red Squad'
   from public.stats_game_log
   where match_id = 'ZZ_G1'),
  'stats_game_log: ZZ_G1 winner_team/blue_team/red_team correct'
);

-- Split-roster fixture for stats_team_agg: an FPL team ('SplitCo') whose
-- own 5 players are not all on the same LoL side in a match.
-- ZZ_SPLIT1: SplitCo has 2 players on Red (majority, Red wins) and 1 on
--   Blue (minority, Blue loses) -> majority-side rule: side=Red, win=true.
--   Contributes exactly 1 game / 1 win to SplitCo, not 2 games from 2 rows.
-- ZZ_SPLIT2: SplitCo has exactly 1 player on each side (Blue wins, Red
--   loses) -> an exact 50/50 split -> excluded entirely from SplitCo's
--   standings (no principled side to pick).
insert into public.raw_stats (
  match_id, game_date, season, season_phase, team_side, team_name,
  summoner_name, tag, champion, role, kills, deaths, assists, kda,
  cs, gold_earned, vision_score, win,
  team_dragons, team_first_dragon, team_barons, team_first_blood, team_first_tower
) values
  -- ZZ_SPLIT1: SplitCo majority on Red (2 players), Red wins
  ('ZZ_SPLIT1', '2026-01-03 20:00', 'ZZ', 'Regular', 'Red', 'SplitCo',
   'SplitRed1', 'NA1', 'Zed', 'MIDDLE', 5, 2, 5, 5.0, 180, 11000, 20, true,
   2, true, 1, true, true),
  ('ZZ_SPLIT1', '2026-01-03 20:00', 'ZZ', 'Regular', 'Red', 'SplitCo',
   'SplitRed2', 'NA1', 'Garen', 'TOP', 4, 3, 4, 2.67, 170, 10000, 15, true,
   2, true, 1, true, true),
  ('ZZ_SPLIT1', '2026-01-03 20:00', 'ZZ', 'Regular', 'Blue', 'SplitCo',
   'SplitBlue1', 'NA1', 'Ahri', 'JUNGLE', 1, 6, 2, 0.5, 120, 7000, 18, false,
   0, false, 0, false, false),
  -- ZZ_SPLIT1: the opposing roster (single team, Blue side, loses)
  ('ZZ_SPLIT1', '2026-01-03 20:00', 'ZZ', 'Regular', 'Blue', 'Opponents',
   'OppOne', 'NA1', 'Yasuo', 'BOTTOM', 2, 5, 3, 1.0, 140, 8000, 14, false,
   0, false, 0, false, false),
  -- ZZ_SPLIT2: SplitCo exactly 1 player each side -> tie, excluded
  ('ZZ_SPLIT2', '2026-01-04 20:00', 'ZZ', 'Regular', 'Blue', 'SplitCo',
   'SplitBlue2', 'NA1', 'Ahri', 'MIDDLE', 6, 2, 6, 6.0, 190, 12000, 22, true,
   3, true, 1, true, true),
  ('ZZ_SPLIT2', '2026-01-04 20:00', 'ZZ', 'Regular', 'Red', 'SplitCo',
   'SplitRed3', 'NA1', 'Garen', 'TOP', 2, 6, 2, 0.67, 130, 7500, 12, false,
   0, false, 0, false, false);

-- SplitCo standings: ZZ_SPLIT1 contributes 1 game/1 win (majority=Red, won);
-- ZZ_SPLIT2 contributes nothing (exact 1v1 split, excluded) -> games=1, wins=1.
select ok(
  (select games = 1 and wins = 1
   from public.stats_team_agg
   where team_name = 'SplitCo' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_team_agg: split-roster majority rule -- SplitCo games=1 wins=1 (tie match excluded)'
);

-- Explicitly confirm the tied match (ZZ_SPLIT2) contributes nothing at all:
-- SplitCo's single counted game must be ZZ_SPLIT1's Red-side result (5+4
-- kills = 9 team_kills), not an average/blend that includes ZZ_SPLIT2.
select ok(
  (select avg_team_kills = 9.00
   from public.stats_team_agg
   where team_name = 'SplitCo' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_team_agg: tied split match (ZZ_SPLIT2) excluded -- avg_team_kills reflects only ZZ_SPLIT1''s majority side'
);

select * from finish();
rollback;
