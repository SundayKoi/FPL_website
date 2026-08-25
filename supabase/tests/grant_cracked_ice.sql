-- Hand one existing foil the Cracked Ice look.
--
-- A grant, not a pull: this repaints a copy you already own rather than
-- touching FOIL_CHANCE or the parallel weights, so nobody else's odds move
-- and the roll stays honest. It exists so the loudest parallel can be
-- checked against REAL splash art at collection size before the league
-- starts hitting it — a facet mesh over a busy Ahri could turn to mud, and
-- that is a one-number fix in globals.css if it does.
--
-- Prefer a copy on Dribb or Spiesss. Those two are excluded from the public
-- ledger (DEFAULT_EXCLUDED_COLLECTORS), so a granted Cracked Ice does not
-- inflate the "how many exist" count everyone else reads.
--
-- Run the blocks one at a time. Paste into the Supabase SQL editor; it is
-- not psql, so there are no \set variables — edit the literals.


-- ── 1. Which foils could take it ─────────────────────────────────────
-- Your foil copies, newest first. Pick an inventory id from this list —
-- ideally a card whose splash is BUSY, since that is the case at risk.
select
  ci.id,
  ci.player_name,
  ci.tier,
  ci.foil_type,
  ci.card->'signature'->>'champion' as champion,
  (ci.card->>'artSkin')::int        as skin,
  ci.acquired_at
from public.card_inventory ci
join public.betting_profiles bp on bp.discord_id = ci.discord_id
where ci.season = 'S5'
  and ci.foil is true
  -- Narrow to yourself. betting_profiles names the column `username`
  -- (there is no display_name); drop this line to see everyone's foils.
  and lower(coalesce(bp.username, '')) in ('dribb', 'spiesss')
order by ci.acquired_at desc
limit 40;


-- ── 2. The grant ─────────────────────────────────────────────────────
-- Put the id you picked in place of 0. Guarded on `foil is true` so it can
-- never create the one pairing the check constraint rejects (a matte card
-- carrying a parallel) — if the id is wrong, this updates nothing rather
-- than erroring halfway.
update public.card_inventory
   set foil_type = 'ice'
 where id = 0
   and foil is true;


-- ── 3. Verify ────────────────────────────────────────────────────────
select id, player_name, foil, foil_type
from public.card_inventory
where id = 0;


-- ── 4. Undo ──────────────────────────────────────────────────────────
-- Back to the base parallel, which is what the copy was before.
--
-- update public.card_inventory
--    set foil_type = 'prisma'
--  where id = 0
--    and foil is true;
