-- Offseason Overall adjustments (see docs/offseason.md): staff can move a
-- player's Overall a few points up or down on top of what their games give
-- them, e.g. for a player who took over a spot after a sub played its first
-- games badly. The site still rates the games; the adjustment is added after,
-- and the card's tier follows the adjusted Overall.
--
-- Staff set it through the existing staff write policy on offseason_entrants.
-- Players' own functions (sign-up, withdraw, lock-in, card signing) name the
-- columns they write, so they never touch it.

alter table public.offseason_entrants
  add column overall_adjustment int not null default 0
  check (overall_adjustment between -20 and 20);
