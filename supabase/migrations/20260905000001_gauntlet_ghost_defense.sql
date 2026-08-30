-- Which run you were standing in when you fought.
--
-- Last week's runs are this week's bracket (src/lib/gauntlet/ghosts.ts).
-- Recording the ghost on the round log turns the defence record into a
-- group-by rather than a second table: "your run was fought 47 times and
-- held 21" is one query over rows that were already being written.
--
-- Nullable, and NOT a foreign key on purpose: a ghost's run may be
-- archived or removed long after somebody fought it, and losing the
-- defence history of everyone who met them would be the wrong trade.

alter table public.gauntlet_round_log
  add column if not exists ghost_run_id bigint;

-- The defence read: every round fought against one run.
create index if not exists gauntlet_round_log_ghost
  on public.gauntlet_round_log (ghost_run_id, week_start)
  where ghost_run_id is not null;
