-- Which finished games actually have a pick/ban phase on record?
--
-- Pick order is not computed from stats. It comes from match_drafts, which
-- only has a row when the series was drafted THROUGH THIS SITE. A game
-- drafted in the League client, or played before the site drafter existed,
-- has nothing to show — and that is the difference between "the feature is
-- broken" and "there is no data for that match".
--
-- Read-only. Paste into the Supabase SQL editor and run the blocks in order.


-- ── 1. Coverage at a glance ──────────────────────────────────────────
-- played  = fixtures with a score
-- drafted = of those, how many the site drafter recorded
select
  count(*) filter (where f.score_a is not null and f.score_b is not null)          as played,
  count(*) filter (where f.score_a is not null and f.score_b is not null
                     and d.fixture_id is not null)                                 as played_and_drafted,
  count(*) filter (where d.fixture_id is not null)                                 as drafted_total
from public.fixtures f
left join (select distinct fixture_id from public.match_drafts) d
       on d.fixture_id = f.id;


-- ── 2. Which ones, newest first ──────────────────────────────────────
-- `games_drafted` counts rows in match_drafts (one per game of the series).
-- `roles_confirmed` is what turns the pick column into role order — pick
-- numbers show either way, but this is the case that used to hide them.
select
  f.id,
  -- Paste onto the site's origin to go straight to the pick/ban section.
  '/match/' || f.id || '#draft' as draft_url,
  f.scheduled_at,
  f.team_a, f.team_b,
  f.score_a, f.score_b,
  count(md.id)                                            as games_drafted,
  count(md.id) filter (where md.positions is not null)     as roles_confirmed,
  sum(jsonb_array_length(coalesce(md.actions, '[]'::jsonb))) as actions_recorded
from public.fixtures f
left join public.match_drafts md on md.fixture_id = f.id
where f.score_a is not null and f.score_b is not null
group by f.id, f.scheduled_at, f.team_a, f.team_b, f.score_a, f.score_b
order by f.scheduled_at desc
limit 40;


-- ── 3. One fixture in detail ─────────────────────────────────────────
-- Put a fixture id from block 2 here. Every pick, in the order it was made.
-- If this returns rows, /match/<that id>#draft will show them.
select
  md.game_number,
  (a->>'stepIndex')::int as step,
  a->>'side'             as side,
  a->>'kind'             as kind,
  (a->>'slot')::int      as slot,
  a->>'champion'         as champion,
  coalesce((a->>'skipped')::boolean, false) as skipped
from public.match_drafts md
cross join lateral jsonb_array_elements(md.actions) a
where md.fixture_id = '00000000-0000-0000-0000-000000000000'
  and a->>'kind' = 'pick'
order by md.game_number, step;
