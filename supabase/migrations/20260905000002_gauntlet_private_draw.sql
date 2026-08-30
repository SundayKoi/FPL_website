-- The private draw, the bounty, and the no-repeat rule.
--
-- ghost_seed: the seed a run's OWN bracket is drawn with. Last week's runs
-- are a shared pool, but each run draws its own eight from it — a week
-- everybody could memorise is a week that gets solved in four attempts,
-- and the leaderboard takes a player's BEST run, so a solvable week pays
-- volume rather than skill. Rolled by CSPRNG once at entry and never
-- again, so a run's bracket is fixed the moment it starts and stays
-- auditable: same row, same eight, forever.
--
-- Null on runs staged before this shipped; those fall back to the week
-- seed and keep the bracket they already had.

alter table public.gauntlet_runs
  add column if not exists ghost_seed bigint;

-- The no-repeat lineup check reads a player's most recent entry.
create index if not exists gauntlet_runs_recent
  on public.gauntlet_runs (discord_id, created_at desc);
