# Setup Acquisition Types Design

**Date:** 2026-08-10
**Scope:** Distinguish Captain and Free Agency setup players and require all setup players to come from the existing player pool.

## Goal

During draft setup, every team can receive two pre-filled players: one Captain and one Free Agency pickup. Both are existing player-pool records, both have an admin-entered point value, and both reduce the team’s remaining points. The persisted `players.acquisition` value must remain authoritative so the draft board, roster views, removal flows, and future rules do not interpret both players as Captains.

## Current behavior and constraints

- `TeamEditor` exposes a free-form `PrefillForm` that inserts a new player with `acquisition = 'captain'` and a second existing-player form that calls `admin_assign_setup_player`.
- `admin_assign_setup_player` currently always writes `acquisition = 'free_agency'` and deducts the supplied price.
- The database already supports `captain` and `free_agency` acquisition values, one player per role per team, and setup-player removal/refund behavior.
- The public draft board already renders separate `C` and `FA` badges, while the teams roster logic uses `acquisition = 'captain'` to identify the Captain.
- Setup player names must no longer be typed into the team setup UI; the existing-player selector is the only source.

## Design

### UI flow

Replace the two setup-player forms with one existing-player assignment form. The form contains:

1. An existing player dropdown populated only with eligible pool players for roles not already filled on that team.
2. An acquisition dropdown with `Captain` and `Free Agency` options.
3. A nonnegative integer point-value input required for either acquisition type.
4. An assignment button that calls the setup assignment RPC.

The form resets only after a successful assignment. It retains its selection and price after an RPC error. It is unavailable when the team already has two setup players or when there are no eligible pool players. The acquisition option should be filtered to the type not already present on the team, so the normal UI presents one Captain and one Free Agency slot without allowing duplicate types.

The pre-filled player list should show the acquisition label and point value for every row, making Captain and Free Agency visibly different during setup. Existing draft-board badges remain `C` and `FA`. The public roster card should render `C` for Captains and `FA` for Free Agency pickups; only the Captain row remains locked for roster swaps.

### Database contract

Add a new migration that updates `admin_assign_setup_player` to accept an acquisition type in addition to the draft, player, team, and price. The function must:

- Require an admin and a draft in setup status.
- Accept only `captain` or `free_agency` for this setup operation.
- Require a nonnegative integer price for both types.
- Reject a player outside the draft or already assigned.
- Reject a team outside the draft, a team with two setup players, or a duplicate setup acquisition type for that team.
- Reject a role already filled on the team.
- Reject a price above the team’s remaining points.
- Atomically assign the existing player with the requested acquisition and price, then deduct the price from `teams.points_remaining`.

The migration must revoke the old function signature and grant the new signature to `authenticated` and `service_role`. Existing setup removal and team-removal RPCs must continue to refund both acquisition types by their stored prices; Captain rows are deleted on removal and Free Agency rows return to the pool as they do today.

The existing four-argument function should not remain callable by the client, because it would provide an ambiguous default acquisition path. Existing SQL tests and fixtures should be updated to call the new signature where they exercise setup assignment.

### Data flow

`TeamEditor` derives eligible pool players and available acquisition types from its current `players` prop. On submit it calls `admin_assign_setup_player` with `p_acquisition` and the entered `p_price`. `DraftSetupEditor` refetches drafts, teams, and players after success. The updated player record then flows to `TeamColumn`, `toRosterTeams`, and other consumers through the existing typed `Player` model without adding a new acquisition value.

### Error handling

Use the existing readable RPC error display. The database will use stable `SETUP_ACQUISITION_INVALID` and `SETUP_ACQUISITION_TAKEN` error codes for invalid or duplicate setup types. Client-side disabled states are convenience only; the RPC remains authoritative for concurrent admins or stale props. Failed assignments must not mutate the player, team budget, or form values.

## Testing

### Component tests

- The setup editor renders the existing-player selector, acquisition selector, and point-value input, and no longer renders the free-form `Player name` input or its old `Add` button.
- Selecting `Captain` calls the setup RPC with the selected player, acquisition, and price, and the assignment retains the Captain type.
- Selecting `Free Agency` calls the same RPC with the Free Agency type and price.
- The acquisition selector hides a type already present on the team.
- RPC failures preserve the selected player, acquisition, and price.
- The draft team column continues to render distinct `C` and `FA` badges.

### Database tests

- A Captain setup assignment stores `captain`, deducts its entered price, and remains in setup status.
- A Free Agency setup assignment stores `free_agency` and deducts its entered price.
- Duplicate Captain/Free Agency assignments, invalid acquisition values, insufficient points, full teams, and filled roles are rejected without mutation.
- Removing either setup type refunds its stored price; Captain rows are deleted and Free Agency rows return to the pool.

### Verification

Run the focused Vitest suite for `TeamEditor` and `TeamColumn`, the full Vitest suite, ESLint, and the Supabase test suite when the local Supabase environment is available. Confirm the final diff contains only the requested setup acquisition changes plus the required migration/tests/spec artifacts.

## Out of scope

- Changes to auction acquisition behavior or live admin assignments.
- New acquisition enum values.
- Player-pool import format or player data management outside the setup assignment UI.
- Changes to captain profile selection or authentication.
