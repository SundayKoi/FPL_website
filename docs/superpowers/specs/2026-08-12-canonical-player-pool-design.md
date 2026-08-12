# Canonical Player Pool Design

## Goal

Move the Player List from static TypeScript data into a shared, season-aware Supabase player pool. Reuse existing draft player records through canonical links, preserve each player’s exact OP.GG URL, and give admins CRUD controls for the shared pool.

## Architecture

- Add a canonical `player_pool` table keyed by season and canonical player identity.
- Store displayed name, normalized name, role, rank, and exact OP.GG URL from the existing Player List.
- Add nullable `canonical_player_id` to the existing draft-specific `players` table.
- Match existing draft records to canonical rows using normalized names and explicit aliases; leave ambiguous/unmatched draft rows intact for review.
- Update `/players` to read the canonical Season 5 pool from Supabase.
- Preserve draft-specific ownership, price, acquisition, and historical records in `public.players`.
- Use the existing TypeScript Player List data as migration seed input only.

## Admin behavior

- Admins can toggle `Edit Player Pool` on `/players`.
- Edit mode supports adding, editing, and removing canonical player rows.
- Editable fields are name, role, rank, and exact OP.GG URL.
- All writes are protected by Supabase RLS and server-side admin checks.
- Removing a canonical row never deletes historical draft/team records.
- The UI warns when a canonical player is linked to existing draft records before removal.

## Data and matching requirements

- The canonical pool is season-aware so future seasons can have independent player lists.
- OP.GG URLs must be copied exactly from the current Player List data.
- Matching must normalize casing, whitespace, `Captain:` prefixes, and Riot tag suffixes, plus preserve the existing known aliases.
- Matching should expose enough deterministic data/tests to identify matched, unmatched, and ambiguous records during migration.
- Existing draft player rows without a canonical match remain valid and visible to draft/team pages.

## UI behavior

- `/players` keeps the current Season and Section controls.
- Player List reads canonical pool rows and preserves the existing five role layout and OP.GG links.
- Free Agency continues to use its imported bid/captain data while resolving displayed players against canonical rows.
- Admin controls are hidden for non-admin users.
- Add/edit forms require a valid player name, role, and OP.GG URL; rank may remain empty when the source has no rank.
- Remove requires confirmation and warns when linked draft records exist.

## Testing

- Migration tests cover canonical table constraints, public reads, admin-only writes, and preservation of draft rows on canonical deletion.
- Matching tests cover exact names, casing/whitespace, captain prefixes, Riot tags, known aliases, unmatched records, and ambiguous candidates.
- Component tests cover canonical Player List rendering, exact OP.GG URLs, admin-only edit toggle, add/edit/remove controls, confirmation warning, and non-admin visibility.
- Existing Free Agency, bid-board, draft, and team tests must continue to pass.

## Out of scope

- Deleting historical draft/team player records when a canonical player is removed.
- Making Free Agency bid assignments editable as part of canonical player CRUD.
- Automatic live synchronization with Google Sheets after migration.
