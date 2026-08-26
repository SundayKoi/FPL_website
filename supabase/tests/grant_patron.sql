-- Grant (or extend) League Patron status.
--
-- Patronage is collected over Venmo (see /support-devs) and granted here by
-- hand — no payment code holds card details, and a human sees every grant.
-- What it buys: the flame frame, a second Daily Rip, the supporters page.
-- Deliberately nothing that changes odds or ratings.
--
-- Run the blocks one at a time in the Supabase SQL editor.


-- ── 1. Find the member ───────────────────────────────────────────────
select discord_id, username, patron_until,
       case when patron_until > now() then 'ACTIVE' else 'not a patron' end as status
from public.betting_profiles
where username ilike '%NAME_HERE%';


-- ── 2. Grant 30 days ─────────────────────────────────────────────────
-- Extends an active patronage from its current end (paying early never
-- costs days); starts from now for a lapsed or first-time patron.
update public.betting_profiles
   set patron_until = greatest(coalesce(patron_until, now()), now()) + interval '30 days'
 where discord_id = 'DISCORD_ID_HERE';


-- ── 3. Verify ────────────────────────────────────────────────────────
select username, patron_until from public.betting_profiles
where discord_id = 'DISCORD_ID_HERE';

-- The public roster the supporters page reads:
select * from public.patrons_public order by patron_until desc;


-- ── 4. Revoke (refund / mistake) ─────────────────────────────────────
-- update public.betting_profiles set patron_until = null
--  where discord_id = 'DISCORD_ID_HERE';
