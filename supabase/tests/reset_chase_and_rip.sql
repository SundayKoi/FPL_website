-- Test-cycle resets: un-claim the chase and give someone their daily rip back.
--
-- Both are for REHEARSAL, not bookkeeping — they wind state back so a
-- feature can be exercised again, reversing everything the original event
-- wrote so nothing is left half-true.
--
-- Run blocks one at a time in the SQL editor.


-- ── 1. Reset the claimed chase ───────────────────────────────────────
-- Reverses the whole claim: the CHASE stamp comes off the winning copy,
-- the bounty's ledger row and balance move are undone together (the same
-- invariant that paid it), and the chase row itself is deleted so a fresh
-- one can be armed from the schedule page's admin form. Balance is clamped
-- at 0 in case the winner already spent the bounty.
do $$
declare
  c record;
begin
  select id, claimed_by, claimed_inventory_id, bounty
    into c
    from public.card_chases
   where claimed_by is not null
   order by claimed_at desc
   limit 1;
  if c.id is null then
    raise notice 'no claimed chase found — nothing to reset';
    return;
  end if;

  -- claimed_inventory_id can be null if the copy was dusted; the update
  -- then simply touches nothing.
  update public.card_inventory
     set card = card - 'chase'
   where id = c.claimed_inventory_id;

  delete from public.betting_ledger
   where reason = 'chase_bounty' and ref_table = 'card_chases' and ref_id = c.id;
  update public.betting_profiles
     set balance = greatest(balance - c.bounty, 0)
   where discord_id = c.claimed_by;

  delete from public.card_chases where id = c.id;
  raise notice 'chase % reset — clawed % back from %', c.id, c.bounty, c.claimed_by;
end $$;


-- ── 2. Give someone today's daily rip back ───────────────────────────
-- open_daily_pack counts today's (Eastern) cost-0 rows in card_pack_opens,
-- so sliding them back a day frees today's rip again. The pulled cards
-- stay in the collection — this refunds the ATTEMPT, not the cards. (It
-- may credit an extra streak day; for a test account that is noise.)
update public.card_pack_opens
   set opened_at = opened_at - interval '1 day'
 where cost = 0
   and discord_id = (select discord_id from public.betting_profiles where username ilike 'dribb' limit 1)
   and (opened_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date;
