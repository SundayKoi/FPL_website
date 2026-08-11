begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- 1-5: the five views exist
select has_view('public', 'stats_player_agg', 'stats_player_agg view exists');
select has_view('public', 'stats_team_agg', 'stats_team_agg view exists');
select has_view('public', 'stats_champion_agg', 'stats_champion_agg view exists');
select has_view('public', 'stats_records', 'stats_records view exists');
select has_view('public', 'stats_game_log', 'stats_game_log view exists');

-- Fixture: 2 synthetic games in a throwaway season 'ZZ' / phase 'Regular'.
-- Game 1 (ZZ_G1): TestGuy (Blue, Ahri) beats FakeFoe (Red, Zed). TestGuy wins.
-- Game 2 (ZZ_G2): TestGuy (Blue, Ahri) loses to FakeFoe (Red, Garen).
-- Both games: Ahri banned by both sides (ban_1 on every player row of a team,
-- per the brief's repetition-per-side note) -> should count as 1 ban per game,
-- not 2 (2 rows on one side both carry the same ban_1).
insert into public.raw_stats (
  match_id, game_date, season, season_phase, team_side, team_name,
  summoner_name, tag, champion, role, kills, deaths, assists, kda,
  kill_participation_pct, total_damage_to_champions, damage_per_min,
  cs, cs_per_min, gold_earned, vision_score, win,
  team_dragons, team_first_dragon, team_barons, team_first_blood, team_first_tower,
  ban_1, ban_2, ban_3, ban_4, ban_5
) values
  -- Game 1: Blue side (TestGuy + a teammate), Ahri banned both sides
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'TestGuy', 'NA1', 'Ahri', 'MIDDLE', 10, 2, 8, 9.0,
   80.0, 20000, 800, 200, 8.0, 12000, 30, true,
   3, true, 1, true, true,
   'Ahri', 'Zed', null, null, null),
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'BlueMate', 'NA1', 'Garen', 'TOP', 4, 3, 6, 3.33,
   60.0, 15000, 600, 180, 7.0, 10000, 20, true,
   3, true, 1, true, true,
   'Ahri', 'Zed', null, null, null),
  -- Game 1: Red side, different bans (Ahri also banned here -> same match_id+ban dedupes to 1)
  ('ZZ_G1', '2026-01-01 20:00', 'ZZ', 'Regular', 'Red', 'Red Squad',
   'FakeFoe', 'NA1', 'Zed', 'MIDDLE', 2, 10, 3, 0.5,
   40.0, 10000, 400, 150, 6.0, 9000, 15, false,
   0, false, 0, false, false,
   'Ahri', 'Yasuo', null, null, null),
  -- Game 2: TestGuy loses on Ahri, Ahri banned only here on blue (still just 1/game)
  ('ZZ_G2', '2026-01-02 20:00', 'ZZ', 'Regular', 'Blue', 'Blue Squad',
   'TestGuy', 'NA1', 'Ahri', 'MIDDLE', 1, 6, 2, 0.5,
   30.0, 8000, 300, 140, 5.0, 8000, 18, false,
   1, false, 0, false, false,
   'Yasuo', null, null, null, null),
  ('ZZ_G2', '2026-01-02 20:00', 'ZZ', 'Regular', 'Red', 'Red Squad',
   'FakeFoe', 'NA1', 'Garen', 'TOP', 9, 1, 5, 14.0,
   85.0, 22000, 900, 210, 9.0, 13000, 25, true,
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

-- champion bans: Ahri appears in ban_1 on both team-rows of Blue in G1 (2 rows) and
-- again on Red in G1 (1 row) and Blue in G2 (1 row) = 4 raw rows but only 2 distinct
-- (match_id, ban) pairs: (ZZ_G1, Ahri) and (ZZ_G2, Ahri) -> bans = 2, not 4.
select ok(
  (select bans = 2
   from public.stats_champion_agg
   where champion = 'Ahri' and season = 'ZZ' and season_phase = 'Regular'),
  'stats_champion_agg: Ahri bans = 2 (deduped per game, not per player row)'
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

select * from finish();
rollback;
