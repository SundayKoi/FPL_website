-- Foil parallels: four looks, ordered by how hard they are to hit.
--
-- Foil was one boolean, so every foil in the league looked the same. This
-- splits it into a ladder — Prisma, Aurora, Refractor, Cracked Ice — rolled
-- INSIDE the existing 6% foil chance, so the overall rate of pulling a foil
-- does not move at all. What changes is that a foil is now a specific foil.
--
-- The ladder sits on the LUCK axis, not the merit one. Tier says how well
-- someone played; foil says how the pack fell. Deepening the luck axis
-- gives collectors a chase without inflating anyone's rating, which is why
-- a Bronze card with the rarest foil is an interesting object rather than
-- a contradiction.
--
-- Stored on the copy, never derived. Every rating and cosmetic on a pulled
-- card freezes at mint here, and a derived look would let a future
-- rebalance silently restyle collections people already own — the same
-- reason card_inventory.card holds the whole card json.
--
-- Prisma is the base on purpose: every foil already out there IS a Prisma,
-- so the backfill below is a statement of fact, not a migration of taste.
-- Nobody's collection changes appearance because of this.

alter table public.card_inventory
  add column if not exists foil_type text;

-- Every existing foil is a Prisma — that is the only foil that has ever
-- been minted. Non-foils stay null: a foil type on a card with no foil
-- would be a lie the renderer might one day believe.
update public.card_inventory
   set foil_type = 'prisma'
 where foil is true
   and foil_type is null;

-- The pairing is the invariant worth enforcing: a foil must name its type,
-- and a non-foil must not have one. Written as one check so neither half
-- can drift.
--
-- The `foil_type is not null` on the first branch is load-bearing, not
-- belt-and-braces. Without it, a foil row with a NULL type makes
-- `foil_type in (...)` evaluate to NULL rather than false, the whole
-- expression comes out NULL, and a CHECK constraint ACCEPTS null — it only
-- rejects false. The first version of this migration let exactly that row
-- through; a local test caught it.
alter table public.card_inventory
  drop constraint if exists card_inventory_foil_type_ck;
alter table public.card_inventory
  add constraint card_inventory_foil_type_ck check (
    (foil is true and foil_type is not null
      and foil_type in ('prisma', 'aurora', 'refractor', 'ice'))
    or
    (foil is not true and foil_type is null)
  );

-- The ledger page counts pulls by type; without this it is a sequential
-- scan of every copy in the league to answer "how many Cracked Ice exist".
create index if not exists card_inventory_foil_type_idx
  on public.card_inventory (season, foil_type)
  where foil_type is not null;
