-- Arm (or inspect) the Weekly Chase.
--
-- One chase per season+week (enforced by a unique index). The first pack
-- pull matching `criteria` takes the bounty and the CHASE stamp — decided
-- atomically by claim_card_chase, so ties cannot split it.
--
-- criteria is any subset of:
--   {"slug": "doug-na1"}      a specific player's card
--   {"tier": "diamond"}       tier KEY, not label
--   {"foil": true}            any foil
--   {"foilType": "ice"}       a specific parallel (implies foil)
--   {"signed": true}          an autographed pull
--   {}                        the first pull of the week, full stop
--
-- Run blocks one at a time in the SQL editor.


-- ── 1. What's armed now ──────────────────────────────────────────────
select id, season, week, title, criteria, bounty,
       coalesce(bp.username, '— unclaimed —') as claimed_by, c.claimed_at
from public.card_chases c
left join public.betting_profiles bp on bp.discord_id = c.claimed_by
order by week desc limit 8;


-- ── 2. Arm this week's chase ─────────────────────────────────────────
-- week = the Monday of the newest edition (what the pack shop mints by
-- default). Adjust title/criteria/bounty to taste.
insert into public.card_chases (season, week, title, criteria, bounty)
values (
  'S5',
  '2026-09-01',
  'Any foil jungle card',
  '{"foil": true}'::jsonb,
  500
);


-- ── 3. Disarm an unclaimed chase (re-arm by inserting again) ─────────
-- delete from public.card_chases where id = 0 and claimed_by is null;
