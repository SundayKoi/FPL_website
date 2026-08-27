-- Gauntlet v2: the crossroads column.
--
-- A fight now resolves in two halves around a player decision. The first
-- half stores everything the second needs here:
--   { "state": <HalfState — momentum, events, lanes, styles, situationKey>,
--     "seed2": <CSPRNG seed for the second half, stored BEFORE it resolves> }
-- Null means no call is pending (the run is between rounds, or v1 rows).
-- The same seed-before-resolution discipline as round_seed: the second
-- half is a pure function of (row, choice), so a raced retry recomputes
-- the identical outcome and the CAS update lets exactly one write win.

alter table public.gauntlet_runs
  add column if not exists crossroads jsonb;
