-- Test-cycle resets: un-claim the chase and give someone their daily rip back.
--
-- Both are for REHEARSAL, not bookkeeping — they wind state back so a
-- feature can be exercised again, reversing everything the original event
-- wrote so nothing is left half-true.
--
-- Run blocks one at a time in the SQL editor.


-- ── 1. Reset the claimed chase ───────────────────────────────────────
-- Reverses the claim: the CHASE stamp comes off the winning copy, the
-- bounty is clawed back, and the chase row is deleted so a fresh one can
-- be armed from the schedule page's admin form.
--
-- The claw-back is a REVERSAL ROW, never a deletion. An earlier version
-- deleted the +bounty ledger row and clamped the balance at 0 — which,
-- when the winner had already spent part of the bounty, moved the ledger
-- by the full amount but the balance by less. The ledger watchdog
-- (discord-announcer's ledger_drift) flagged exactly that drift, forever,
-- because nothing was ever going to bring the two back in line. The
-- invariant every money write must keep: the ledger row's delta and the
-- balance move are THE SAME NUMBER, in the same transaction. Clawing back
-- only what the wallet still holds is fine — as long as the row says so.
do $$
declare
  c record;
  v_balance bigint;
  v_clawed bigint;
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

  -- Take what is there, up to the bounty; the remainder is written off
  -- (the reversal row is smaller than the payout row, and the difference
  -- is the write-off — visible in the ledger instead of hidden in drift).
  select balance into v_balance
    from public.betting_profiles
   where discord_id = c.claimed_by
   for update;
  v_clawed := least(greatest(v_balance, 0), c.bounty);

  if v_clawed > 0 then
    update public.betting_profiles
       set balance = balance - v_clawed
     where discord_id = c.claimed_by;
    insert into public.betting_ledger (discord_id, delta, reason, ref_table, ref_id)
      values (c.claimed_by, -v_clawed, 'chase_reset_reversal', 'card_chases', c.id);
  end if;

  delete from public.card_chases where id = c.id;
  raise notice 'chase % reset — clawed % of the % bounty back from %', c.id, v_clawed, c.bounty, c.claimed_by;
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
