-- The shelf relic a run brought along.
--
-- Moments, roster plates and champions relics were the rarest pulls in the
-- game and the only cards with nothing to do: they cannot be fielded (a
-- moment has no role and no stat line), so a 2% pull was a dust object.
-- A run may now bring ONE of them.
--
-- Frozen at entry, exactly like `lineup`: the copy's family and roster are
-- copied into the row, so a re-print or a re-grade mid-run cannot change
-- what the heirloom does to a fight that has already been priced.
--
--   { "inventoryId": 91, "kind": "moment", "title": "THE STEAL",
--     "family": "void" }
--   { "inventoryId": 92, "kind": "plate",  "title": "FLS roster",
--     "teamName": "The Faceless" }
--
-- Null means the run brought nothing, and every run started before this
-- shipped reads as null and plays exactly as it did.
--
-- Deliberately NOT a foreign key to card_inventory: the copy stays on the
-- shelf (an heirloom is never spent), but it can be dusted or traded mid-
-- run, and losing the record of what a finished run was played with would
-- be the wrong trade. The row is a snapshot, not a pointer.

alter table public.gauntlet_runs
  add column if not exists heirloom jsonb;
