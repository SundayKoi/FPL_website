# Teams Page and Admin Roster Swaps

**Date:** 2026-08-10  
**Status:** Approved design  
**Scope:** Add a public `/teams` roster directory with 12 placeholder teams, a persisted admin-selected draft/split, and admin-only same-position roster swaps.

## Goals

- Add `/teams` to the shared site header as a bookmarkable public route.
- Present 12 team roster cards inspired by the corrected ROSTERS spreadsheet tab.
- Use placeholder team, captain, player, role, point, and budget data for the first release while keeping the persisted draft path ready for real split data.
- Let admins choose which draft/split is featured on the public `/teams` page.
- Let admins swap non-captain players between teams by drag and drop, while allowing only matching positions to exchange.
- Enforce captain immutability and same-position trade rules in the database as well as in the UI.
- Keep the public page server-rendered and preserve the existing FPL visual system.

## Non-goals

- No public user editing or trade requests.
- No automatic current-season detection.
- No player creation, deletion, or role editing from `/teams`.
- No change to auction behavior, draft-board permissions, or captain bidding rules.
- No spreadsheet synchronization or logo upload system in this iteration.

## User experience

### Public roster directory

The shared header gains a `Teams` link to `/teams` while retaining its compact horizontal-scroll behavior on small screens.

The page uses the existing `bg-hash`, `card-brand`, `label-dash`, display type, steel text, navy panels, line borders, and gold accent utilities. Its top section contains:

- Eyebrow: `LEAGUE ROSTERS`
- Heading: `Teams`
- Supporting copy that identifies the selected draft/split
- An optional admin-only featured-draft selector

The roster area renders 12 cards in a responsive grid: one column on small screens, two on medium screens, and three on large screens. Each card contains:

1. A branded color header with a simple text monogram placeholder rather than an external image dependency.
2. Team name and captain label.
3. Five roster rows in this exact order: `TOP`, `JG`, `MID`, `ADC`, `SUP`.
4. Player display name and point value for each row.
5. A remaining-budget footer.

The selected draft’s real rows are rendered when configured. If no featured draft has been configured, the page renders a typed 12-team placeholder preview with a clear `PREVIEW DATA` status. Placeholder cards are read-only; admin swaps become available as soon as an admin selects a persisted draft. This keeps the first release populated without silently treating fake data as a real split.

### Featured draft selection

Admins see a labeled select control containing available drafts, ordered newest first, plus a `— preview placeholders —` option. Selecting a draft updates the singleton league setting `featured_draft_id`; the public page then reads that setting and renders the selected draft’s teams and players. Choosing the preview option clears the setting and returns the page to read-only placeholder cards.

Non-admins do not see the selector or any editing controls. If the selected draft is missing or deleted, the page reports that no roster is currently featured and does not expose a stale draft ID to users.

### Admin roster editing

On the selected draft’s roster cards, admins can drag a non-captain player row onto another team’s row for the same position. A successful action atomically swaps the two players’ `team_id` values and leaves both players’ price, acquisition, role, and metadata unchanged.

The UI communicates rules directly:

- Captain rows are visibly locked and cannot be dragged.
- A mismatched position is not a valid drop target and receives a rejected/drop-disabled treatment.
- A player can only be exchanged with a different team in the same selected draft.
- Busy, success, and error states are announced in an accessible status region.

Every draggable action has a keyboard alternative. An admin can focus a non-captain player, activate a `Swap with…` control, and choose from same-position slots on other teams. This uses the same server mutation as drag and drop.

## Architecture

### Route and data loading

`src/app/teams/page.tsx` remains a Server Component. It:

1. Reads the singleton featured-draft setting.
2. Loads the selected draft, its teams, and its players through the server Supabase client.
3. Reads the signed-in user/profile only to determine whether admin controls should be rendered.
4. Renders the public directory with an admin client editor layered into the same page when appropriate.

The route does not accept a user-provided draft ID as the source of truth. Admin selection is global and persisted, so all visitors see the same featured split.

### Components and boundaries

- `src/app/teams/page.tsx`: server-side featured-draft and roster data loading.
- `src/components/teams/TeamsDirectory.tsx`: presentational roster grid and page-level states.
- `src/components/teams/TeamRosterCard.tsx`: one team’s branded roster card and role slots.
- `src/components/teams/AdminRosterEditor.tsx`: client-only drag/drop and keyboard swap interaction, optimistic state handling, and refresh/error messaging.
- `src/components/teams/FeaturedDraftSelector.tsx`: admin-only draft selection control and persistence.
- `src/components/teams/placeholderTeams.ts`: typed, presentation-only 12-team preview data used when no draft is featured.
- `src/lib/draft/types.ts`: shared data types for any new featured-draft setting shape if needed.
- `src/components/SiteNavigation.tsx`: new `/teams` primary route link.
- `src/app/globals.css`: only small reusable utility additions if the existing Tailwind utilities cannot express the roster styling.

The components use explicit props for teams, players, selected draft, and admin state. Public viewing has no client state; the editor owns only its pending interaction and status state.

### Database changes

Add a singleton `league_settings` table with:

- `id` fixed to `1` as the singleton key.
- `featured_draft_id` nullable foreign key to `drafts(id)` with `on delete set null`.
- `updated_at` timestamp.

Enable RLS with public read access and admin-only insert/update/delete access. Add a unique/singleton constraint so only one row can exist. The page treats an absent row as “no featured roster.”

Add an admin-only `swap_roster_players(p_left_player_id uuid, p_right_player_id uuid)` security-definer RPC. Within one transaction it:

1. Requires `public.is_admin()`.
2. Locks both player rows in a stable ID order.
3. Verifies both players exist, are on teams, belong to the same draft, and belong to different teams.
4. Verifies their roles are equal.
5. Rejects either player when `acquisition = 'captain'`.
6. Temporarily clears both `team_id` values to avoid the existing `players_one_per_role` unique index.
7. Assigns each player to the other player’s original team.
8. Raises a stable prefixed error code on every invalid request.

The RPC leaves prices and acquisition types unchanged. Existing public read policies and admin write policies remain intact; the RPC is the authoritative path for swaps.

## Error handling and consistency

- If no featured draft is configured, render the read-only placeholder preview and identify it as preview data.
- If the selected draft has fewer than 12 teams or incomplete roster rows, render available data and clearly show empty roster slots; do not fabricate rows in a data-backed draft.
- Disable repeat actions while a selection or swap is pending.
- On RPC failure, retain the last confirmed roster state and show the returned safe error message.
- On success, update local card state only after the RPC succeeds or refetch the selected roster to avoid optimistic divergence.
- Database errors are translated into user-readable messages for missing admin access, captain lock, role mismatch, cross-draft mismatch, and occupied/invalid roster states.
- Realtime synchronization is not required for the first implementation; a successful mutation refreshes the route. Existing draft-board realtime behavior is unchanged.

## Testing and verification

### Unit/component tests

- `SiteNavigation` contains a `/teams` link.
- The teams page/directory renders 12 placeholder cards, five role labels per complete card, captain labels, point values, and remaining budgets when no draft is featured.
- Public users do not see the selector or editing controls.
- Admins see the featured-draft selector and roster editor.
- Captain rows are locked and not draggable.
- Same-role team targets are offered; mismatched roles are rejected.
- Success and failure status text is exposed accessibly.

### Database tests

Add pgTAP coverage for `swap_roster_players`:

- An admin can swap two same-role non-captains across teams.
- A non-admin cannot call the RPC.
- A captain cannot be swapped.
- Different roles are rejected.
- Same-team and cross-draft players are rejected.
- A failed swap leaves both original assignments unchanged.
- Prices and acquisition values remain unchanged after a successful swap.

### Verification commands

Run the repository’s normal checks after implementation:

```bash
npm test
npm run lint
npm run build
```

Run the Supabase test suite when the local Supabase environment is available. Visually inspect `/teams` at desktop and mobile widths, including the no-featured-draft state, the 12-card placeholder layout, admin selector, captain locks, and a successful same-position swap.

## Initial placeholder behavior

The first release ships a typed preview dataset in `placeholderTeams.ts` with 12 fictional teams, captains, and five fictional players per team. It is used only when `featured_draft_id` is null, is visibly labeled as preview data, and cannot be edited or passed to the swap RPC. Selecting any persisted draft replaces the preview with database-backed rosters and enables admin roster swaps.
