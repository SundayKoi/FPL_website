-- ---------------------------------------------------------------------------
-- stats_player_agg — fix avg_cs_per_min / avg_gold_per_min / avg_dmg_per_min
-- / avg_vision_per_min to be duration-weighted (sum of the raw counting
-- stat / sum of game_duration_min), not an unweighted average of each
-- game's own per-minute rate.
--
-- Task 9 verification: legacy comparison (S4, 5+ games, KDA sort) found
-- Sunset Diner's power-ranking score diverged from the legacy dashboard by
-- more than tolerance (79.8 legacy vs 80.9 ours). Root cause: the legacy
-- dashboard's aggregate() (docs/reference/FPL_Stats_legacy.html lines
-- 885-892) computes these 4 stats as sum(raw)/sum(duration) across a
-- player's games -- e.g. damagePerMin: +(s.damage/d).toFixed(1) where
-- d=sum(Game Duration (min)) -- the SAME anti-Simpson's-paradox rule this
-- view's own `kda` column already follows (see 20260810100002's header
-- comment), but that rule was applied only to kda, not to these 4 sibling
-- per-minute columns. Confirmed against Sunset Diner's 10 S4 games by hand:
-- sum(total_damage_to_champions)/sum(game_duration_min) = 262.15 (rounds to
-- legacy's 262.2 -- the last-decimal gap is just legacy's .toFixed(1) vs
-- this view's round(...,2)), NOT avg(damage_per_min) = 259.50 (this view's
-- old, wrong value).
--
-- Confirmed NOT to apply to avg_dmg_taken_per_min: the legacy Scouting
-- report's "DMG Taken/Min" row (line 2900) uses a *different* legacy helper,
-- colAvg() (line 2835), which is an unweighted mean of each game's own
-- per-minute column -- i.e. exactly what avg() already computes. Every
-- other per-minute stat scoutingProfile()/LeaderboardTab/PowerRankings/MVP
-- read (DMG/Min, Gold/Min, CS/Min, Vision/Min) traces back to aggregate()'s
-- p.damagePerMin/goldPerMin/csPerMin/visionPerMin (confirmed by reading
-- legacy lines 2892, 2959-2968: statRow() calls pull from `p`, not
-- colAvg()) -- so only those 4 columns change here; avg_dmg_taken_per_min
-- is untouched.
--
-- `create or replace view` — identical shape/column order to
-- 20260810100003_records_tag.sql's stats_player_agg definition, only the 4
-- expressions below change.
-- ---------------------------------------------------------------------------
create or replace view public.stats_player_agg as
with role_counts as (
  select
    summoner_name, tag, season, season_phase, role,
    count(*) as role_games,
    row_number() over (
      partition by summoner_name, tag, season, season_phase
      order by count(*) desc, role
    ) as rn
  from public.raw_stats
  group by summoner_name, tag, season, season_phase, role
),
role_mode as (
  select summoner_name, tag, season, season_phase, role as role_mode
  from role_counts
  where rn = 1
)
select
  r.summoner_name,
  r.tag,
  r.season,
  r.season_phase,
  rm.role_mode,
  count(*) as games,
  count(*) filter (where r.win) as wins,
  round(100.0 * count(*) filter (where r.win) / count(*), 1) as winrate_pct,
  round(avg(r.kills)::numeric, 2) as avg_kills,
  round(avg(r.deaths)::numeric, 2) as avg_deaths,
  round(avg(r.assists)::numeric, 2) as avg_assists,
  round((sum(r.kills) + sum(r.assists))::numeric / greatest(sum(r.deaths), 1), 2) as kda,
  round(avg(r.kill_participation_pct)::numeric, 2) as avg_kp_pct,
  round(sum(r.cs)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_cs_per_min,
  round(sum(r.gold_earned)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_gold_per_min,
  round(sum(r.total_damage_to_champions)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_dmg_per_min,
  round(avg(r.damage_share_pct)::numeric, 2) as avg_dmg_share_pct,
  round(sum(r.vision_score)::numeric / greatest(sum(r.game_duration_min)::numeric, 1), 2) as avg_vision_per_min,
  round(avg(r.solo_kills)::numeric, 2) as avg_solo_kills,
  sum(r.solo_kills) as total_solo_kills,
  sum(r.turret_plates_destroyed) as total_plates,
  sum(r.double_kills) as total_doubles,
  sum(r.triple_kills) as total_triples,
  sum(r.quadra_kills) as total_quadras,
  sum(r.penta_kills) as total_pentas,
  round(avg(r.cs_at_10)::numeric, 2) as avg_cs_at_10,
  round(avg(r.gold_at_10)::numeric, 2) as avg_gold_at_10,
  round(avg(r.xp_at_10)::numeric, 2) as avg_xp_at_10,
  round(avg(r.damage_taken_per_min)::numeric, 2) as avg_dmg_taken_per_min,
  round(avg(r.kda_challenges)::numeric, 2) as avg_kda_challenges,
  count(*) filter (where r.first_blood_kill or r.first_blood_assist) as first_blood_involvements,
  round(avg(r.game_duration_min)::numeric, 2) as avg_game_duration
from public.raw_stats r
join role_mode rm
  on rm.summoner_name = r.summoner_name
 and rm.tag = r.tag
 and rm.season = r.season
 and rm.season_phase = r.season_phase
group by r.summoner_name, r.tag, r.season, r.season_phase, rm.role_mode;

grant select on public.stats_player_agg to anon, authenticated;
