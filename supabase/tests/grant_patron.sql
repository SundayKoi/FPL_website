-- Grant (or extend) League Patron status, and log the payment.
--
-- Patronage is collected over Venmo (see /support-devs) and granted here by
-- hand — no payment code holds card details, and a human sees every grant.
-- What it buys: the flame frame, a second Daily Rip, the supporters page.
-- Deliberately nothing that changes odds or ratings.
--
-- Every grant writes a patron_payments row (the receipt) and extends
-- patron_until in the same transaction, so the books and the flame can't
-- disagree. Needs the 20260828000003_patron_payments migration.
--
-- THE EVERYDAY PATH IS /admin/patrons — the owner panel does everything
-- below in one click through the grant_patron RPC. This file remains for
-- when the site is down or the grant needs something unusual.
--
-- Run the blocks one at a time in the Supabase SQL editor.


-- ── 1. Find the member ───────────────────────────────────────────────
select discord_id, username, patron_until,
       case when patron_until > now() then 'ACTIVE' else 'not a patron' end as status
from public.betting_profiles
where username ilike '%NAME_HERE%';


-- ── 2. Record the payment and grant the days ─────────────────────────
-- Edit the four values at the top. Extends an active patronage from its
-- current end (paying early never costs days); starts from now for a
-- lapsed or first-time patron. A wrong discord id fails the whole block —
-- no receipt without a grant, no grant without a receipt.
do $$
declare
  v_user   text    := 'DISCORD_ID_HERE';
  v_amount numeric := 5.00;
  v_days   int     := 30;
  v_note   text    := null;  -- e.g. 'venmo @handle, Aug rip'
  v_until  timestamptz;
begin
  insert into public.patron_payments (discord_id, amount_usd, days_granted, note)
  values (v_user, v_amount, v_days, v_note);

  update public.betting_profiles
     set patron_until = greatest(coalesce(patron_until, now()), now()) + make_interval(days => v_days)
   where discord_id = v_user
   returning patron_until into v_until;
  if v_until is null then
    raise exception 'no betting profile for %', v_user;
  end if;

  raise notice 'patron until %', v_until;
end $$;


-- ── 3. The receipt book ──────────────────────────────────────────────
select bp.username, pp.amount_usd, pp.method, pp.days_granted, pp.paid_at, pp.note
from public.patron_payments pp
join public.betting_profiles bp using (discord_id)
order by pp.paid_at desc
limit 20;

-- What patronage has brought in, total and this month:
select coalesce(sum(amount_usd), 0) as all_time,
       coalesce(sum(amount_usd) filter (
         where paid_at >= date_trunc('month', now())), 0) as this_month
from public.patron_payments;

-- The public roster the supporters page reads:
select * from public.patrons_public order by patron_until desc;


-- ── 4. Revoke (refund / mistake) ─────────────────────────────────────
-- Ends the patronage; the payment row stays as history (annotate it):
-- update public.betting_profiles set patron_until = null
--  where discord_id = 'DISCORD_ID_HERE';
-- update public.patron_payments set note = concat_ws(' · ', note, 'refunded')
--  where id = 0;
