-- Every support ranked by BOTH halves of the vision bar, for the most
-- recent week of games. Read-only.
--
--   vision_pm : vision_score / minutes            (provision + uptime)
--   denial_pm : (wards killed + control wards PLACED) / minutes
--   *_rank    : percentile within the support cohort, 0-100
--   bar       : the mean of the two — what the card draws
--
-- percent_rank ties share the lower end where the card splits a tied band
-- down its middle; on continuous rates exact ties are rare enough that the
-- ordering is the same.
with latest as (
  select max(game_date) as newest from public.raw_stats
),
week_games as (
  select r.*
  from public.raw_stats r, latest
  where r.game_date > latest.newest - interval '7 days'
    and upper(coalesce(r.role, '')) in ('UTILITY', 'SUPPORT')
),
totals as (
  select
    summoner_name,
    count(*)                                  as games,
    round(sum(game_duration_min)::numeric, 1) as minutes,
    sum(vision_score)                         as vision_score,
    sum(wards_killed)                         as wards_killed,
    sum(coalesce(detector_wards_placed, control_wards_bought)) as control_wards,
    round(sum(vision_score)::numeric
          / nullif(sum(game_duration_min)::numeric, 0), 3)     as vision_pm,
    round((sum(wards_killed) + sum(coalesce(detector_wards_placed, control_wards_bought)))::numeric
          / nullif(sum(game_duration_min)::numeric, 0), 3)     as denial_pm
  from week_games
  group by summoner_name
)
select
  summoner_name, games, minutes, vision_score, wards_killed, control_wards,
  vision_pm,
  round((percent_rank() over (order by vision_pm) * 100)::numeric, 0) as vision_rank,
  denial_pm,
  round((percent_rank() over (order by denial_pm) * 100)::numeric, 0) as denial_rank,
  round(((percent_rank() over (order by vision_pm)
        + percent_rank() over (order by denial_pm)) * 50)::numeric, 0) as bar
from totals
order by bar desc, vision_pm desc;
