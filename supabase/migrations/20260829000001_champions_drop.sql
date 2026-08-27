-- The Faceless Drop window.
--
-- One timestamp on league_settings, same shape as Live Drops: while
-- champions_until is in the future, the premier pack shop sells the
-- Faceless Pack (one card of the S4 champions' Dealer's Hand per pack).
-- The owner opens and closes it from the schedule admin strip; opens
-- charge through the existing open_card_pack RPC, and pulled copies live
-- in card_inventory like everything else — no new money paths.

alter table public.league_settings
  add column if not exists champions_until timestamptz;
