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
--   {"role": "Jungle"}        the role printed on the card (Top/Jungle/Mid/Bot/Support)
--   {}                        the first pull of the week, full stop
--
-- THE TITLE MUST PROMISE EXACTLY WHAT THE CRITERIA CHECK. Only the
-- criteria decide the winner — a title that says "jungle" over criteria
-- that only say "foil" hands the bounty to a mid laner and makes the bot
-- look broken in front of the whole channel. (That happened. Once.)
--
-- Prefer the "Weekly chase" form on the schedule page's admin strip —
-- it builds criteria from presets and can't drift from the title.
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
-- default) — derived below so it can't be armed for a week nobody is
-- opening. Adjust title/criteria/bounty to taste, keeping them in sync.
insert into public.card_chases (season, week, title, criteria, bounty)
values (
  'S5',
  (select max(edition_week) from public.card_editions where season = 'S5'),
  'Any foil jungle card',
  '{"foil": true, "role": "Jungle"}'::jsonb,
  500
);


-- ── 3. Disarm an unclaimed chase (re-arm by inserting again) ─────────
-- delete from public.card_chases where id = 0 and claimed_by is null;
