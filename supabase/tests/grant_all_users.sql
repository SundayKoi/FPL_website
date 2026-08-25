-- A one-off grant to every betting account.
--
-- Writes the ledger as well as the balance, in ONE statement, so the two
-- can never land apart — a balance that moved with no ledger row is money
-- from nowhere, and every other credit path in this schema (admin_grant,
-- claim_daily_streak, dust_card, fantasy_payout) writes both.
--
-- The reason stays 'admin_grant', matching 20260813000007's RPC. That
-- keeps it out of PROFIT_REASONS (src/lib/betting/queries.ts), so a grant
-- does not read as gambling profit on anyone's profile.
--
-- NOT IDEMPOTENT. Running it twice grants twice. Preview first, and if it
-- does go twice, the undo at the bottom reverses one batch cleanly.

-- ── 1. Preview ───────────────────────────────────────────────────────
-- What this is about to cost, before it costs it.
select
  count(*)                          as accounts,
  count(*) * 800                    as total_to_grant,
  sum(balance)                      as balance_before,
  sum(balance) + count(*) * 800     as balance_after
from public.betting_profiles;


-- ── 2. The grant ─────────────────────────────────────────────────────
-- One statement: the UPDATE's RETURNING feeds the ledger INSERT, so
-- either both happen or neither does.
with granted as (
  update public.betting_profiles
     set balance = balance + 800
   returning discord_id
)
insert into public.betting_ledger (discord_id, delta, reason)
select discord_id, 800, 'admin_grant' from granted;


-- ── 3. Verify ────────────────────────────────────────────────────────
-- One row per account, and the total should equal accounts x 800.
select count(*) as ledger_rows, sum(delta) as total_granted
from public.betting_ledger
where reason = 'admin_grant'
  and created_at > now() - interval '5 minutes';


-- ── 4. Undo (only if it ran twice) ───────────────────────────────────
-- Deletes the recent grant rows and takes the same amounts back off the
-- balances. Narrow the interval to catch exactly the batch you meant —
-- it will otherwise reverse EVERY admin_grant in the window, including
-- ones a person made by hand.
--
-- with undone as (
--   delete from public.betting_ledger
--    where reason = 'admin_grant'
--      and created_at > now() - interval '10 minutes'
--    returning discord_id, delta
-- )
-- update public.betting_profiles p
--    set balance = p.balance - u.delta
--   from (select discord_id, sum(delta) as delta from undone group by discord_id) u
--  where p.discord_id = u.discord_id;
