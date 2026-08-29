-- The opponent's game plan, on the balance tape.
--
-- Enemy teams now bring one of four dispositions (src/lib/gauntlet/foe.ts).
-- Each is a reallocation priced to be worth nothing on aggregate, which is
-- a claim the report should be able to check against real runs rather than
-- only against a Monte Carlo. So the round log records which brain the
-- round was fought against, next to the condition and the wall.
--
-- Nullable: rounds logged before this column existed, and runs staged
-- before the plan shipped, simply have no plan.

alter table public.gauntlet_round_log
  add column if not exists plan_key text;
