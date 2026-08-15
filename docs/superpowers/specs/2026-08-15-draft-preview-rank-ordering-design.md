# Draft Preview Rank Ordering

## Goal

Make the Season 5 draft preview show the corrected canonical rank for SlimPimpin and list players in each role from highest rank to lowest, with unranked players last.

## Data repair

Add a forward Supabase migration that updates the Season 5 `player_pool` row with normalized name `slimpimpin77` to rank `D1`. The migration also updates matching Season 5 draft player rows whose canonical player points to that row, ensuring existing draft previews reflect the correction immediately. The update is idempotent.

## Preview ordering

Add a pure rank-order helper shared by the preview and its tests. The Season 5 rank tiers sort in this order: Master, Diamond, Emerald; within a tier, the numeric division sorts ascending (`1` before `2`, etc.). Unknown or missing ranks sort after ranked players. Equal ranks retain alphabetical display-name order for deterministic output.

Each role column in `DraftSetupPreview` will sort its available players with this helper before rendering. Team roster slots retain draft role order.

## Verification

- Unit tests cover rank-tier/division ordering, unranked placement, and deterministic ties.
- Component tests verify the player pool renders sorted by rank.
- Run the full Vitest suite and ESLint.
- Commit only the migration, helper, component, and relevant tests.
