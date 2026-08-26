-- Founders' patronage: Dribb and Spiesss, comped for good.
--
-- The two of you built and pay for the thing — the flame on your binders
-- is the patron mark working exactly as designed, not a freebie that
-- undercuts it. Granted "permanently" as a century rather than a NULL
-- sentinel: every patron check in the app is `patron_until > now()`, and a
-- special forever-value would need special-casing everywhere it reads.
--
-- Run block 1 to check the names resolve, block 2 to grant, block 3 to see
-- the flames lit.

-- ── 1. The founders ──────────────────────────────────────────────────
select discord_id, username, patron_until
from public.betting_profiles
where lower(username) in ('dribb', 'spiesss');

-- ── 2. The grant ─────────────────────────────────────────────────────
update public.betting_profiles
   set patron_until = now() + interval '100 years'
 where lower(username) in ('dribb', 'spiesss');

-- ── 3. Verify ────────────────────────────────────────────────────────
select username, patron_until, patron_flame from public.patrons_public
order by username;

-- Pick your colours on the packs page (Your flame), or set them here:
-- update public.betting_profiles set patron_flame = 'frostfire' where lower(username) = 'dribb';
-- update public.betting_profiles set patron_flame = 'blood'     where lower(username) = 'spiesss';
