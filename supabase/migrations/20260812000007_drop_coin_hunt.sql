-- The hidden-coin contest (20260812000006_coin_hunt.sql) has ended and the
-- coin was removed from the Info page — drop its function and table. The
-- winners were recorded by staff before removal; this data is not needed
-- again (a future hunt would start a fresh table).
drop function if exists public.claim_coin();
drop table if exists public.coin_finds;
