-- Auto-dust: keep copies per edition, not only per player.
--
-- The keep count grouped every print of a player together, so a rule that
-- kept one copy melted last week's print of a player the moment this
-- week's landed. Some collectors keep a run of a player across editions
-- on purpose. `per_edition` makes the keep count apply to each
-- (player, edition week) separately; off, which is the default and the
-- behaviour every existing rule keeps, it counts the player as one group.
-- Read and written by src/lib/cards/autoDustServer.ts; the pure selection
-- in src/lib/cards/autoDust.ts is what changes its grouping key.

alter table public.card_auto_dust
  add column if not exists per_edition boolean not null default false;
