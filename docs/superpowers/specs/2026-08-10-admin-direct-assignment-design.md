# Admin Direct Player Assignment Design

**Date:** 2026-08-10  
**Status:** Approved for implementation

## Goal

Allow an administrator to place an available player onto a team during an active draft without running an auction. The placement should still behave like a normal draft acquisition for budget accounting and nomination order.

## Scope

This feature covers direct assignment from the live draft board and assigning existing pool players during pre-draft setup. It does not change captain bidding, nomination, auction history, or the existing post-draft roster swap tool.

During pre-draft setup, admins can also move an existing unassigned pool player onto a team as a priced free-agency/pre-draft signing. The existing add-by-name prefill control remains available for creating a new player row.

An admin assignment is available only when:

- the draft is `live` or `paused`;
- the draft has no open auction lot;
- the selected player belongs to the draft and is currently unassigned;
- the selected team belongs to the draft and has an open slot for the player’s role; and
- the entered price is a nonnegative integer no greater than the team’s remaining points.

The assignment preserves the current `live` or `paused` status. It deducts the entered price from the team, then advances the nomination turn using the existing snake-order and full-roster rules. If the assignment fills the final open slot, the existing turn helper marks the draft complete.

The setup action is available only when the draft is `setup` and:

- the selected player belongs to the draft and is currently unassigned;
- the selected team belongs to the draft, has fewer than two pre-filled players, and has an open slot for the player’s role; and
- the entered price is a nonnegative integer no greater than the team’s remaining points.

It assigns the player with acquisition `free_agency`, stores the entered price, and deducts the price from the team without changing draft turn state.

## Architecture

### Database transaction

Add an admin-only `admin_assign_player(p_draft_id uuid, p_player_id uuid, p_team_id uuid, p_price int)` security-definer RPC.

The RPC will:

1. Require `public.is_admin()`.
2. Lock the draft row and reject missing drafts or drafts outside `live`/`paused` status.
3. Reject the request if any open lot exists for the draft.
4. Lock and validate the player and team, including same-draft ownership.
5. Reject an already-rostered player, a team whose role is filled, a negative/non-integer price, or a price above `points_remaining`.
6. Assign the player to the team with the entered price and an acquisition value that identifies the placement as an admin assignment.
7. Deduct the price from the team.
8. Re-read the draft after the roster mutation and call the existing `_advance_turn` helper.

The operation is atomic. A failed validation leaves player, team, and draft state unchanged. The existing RLS policies remain in place; the RPC is the authoritative mutation path.

Add a separate admin-only `admin_assign_setup_player(p_draft_id uuid, p_player_id uuid, p_team_id uuid, p_price int)` security-definer RPC for setup assignments. It locks the draft, player, and team rows, validates setup-only rules, assigns the player as `free_agency`, deducts points, and does not call `_advance_turn`.

Because the current acquisition enum does not identify admin placements, extend it with an `admin` value and update the shared TypeScript acquisition union. Existing `captain`, `free_agency`, and `auction` values retain their current meanings.

### Draft-board UI

Extend the admin controls on the draft board with an assignment panel. It receives the current draft, teams, players, and open-lot state. When the draft is live or paused and no lot is open, it presents:

- an available-player select;
- a team select filtered to teams with that player’s role open; and
- a nonnegative integer price input.

The submit action confirms the assignment, calls `admin_assign_player`, reports safe RPC errors through the existing toast path, and relies on Realtime/refetch to display the confirmed state. While an auction is open, the panel is hidden and the RPC independently rejects any stale or forged request.

The panel does not attempt optimistic roster, budget, or turn updates. The database transaction and existing Realtime subscription remain the source of truth.

### Pre-draft setup UI

In each team’s existing `Pre-filled players` section, add a second form for selecting an available player from the current draft pool and entering a point value. The form calls `admin_assign_setup_player`, keeps the existing two-player prefill limit, reports errors inline using the setup editor’s existing error state, and refetches the draft setup after success. The existing name/role form remains the path for creating a new player row.

## Error handling

Use explicit error codes for admin access, draft state, open auction, player/team ownership, player availability, role occupancy, invalid price, and insufficient points. The client routes those codes through the existing `friendly` error mapper, with a useful fallback for unknown errors.

The existing admin controls, captain controls, auction behavior, and public roster presentation remain unchanged except that admin-assigned players render with the new acquisition label where acquisition metadata is already shown.

## Testing

### Database tests

Extend the pgTAP coverage with cases proving:

- an admin can assign an available player at an entered price;
- the player receives the selected team, price, and admin acquisition value;
- the team’s points are deducted and the nomination turn advances normally;
- a final assignment completes the draft through the normal turn helper;
- non-admins cannot call the RPC;
- assignments are rejected while an auction lot is open;
- wrong-draft, occupied-player, occupied-role, and insufficient-point requests are rejected; and
- failed requests leave the original state unchanged.

Add setup RPC coverage proving:

- an admin can move an existing pool player onto a setup team with a selected price;
- the player is marked `free_agency`, the team’s points are deducted, and draft turn state is unchanged;
- non-admin, wrong-draft, occupied-player, occupied-role, full-prefill, and insufficient-point requests are rejected; and
- failed setup requests leave the player in the pool and preserve the team budget.

### Component tests

Add focused tests for the assignment panel that verify:

- the panel is not rendered while an auction is open;
- available players and role-compatible teams are offered; and
- submitting the form calls the RPC with the selected draft, player, team, and price and refreshes on success.

Add TeamEditor coverage proving the existing-player setup form lists pool players, submits the selected player/team/price, and leaves the existing add-by-name prefill form intact.

Run the existing Vitest suite, lint, and the Supabase test suite when the local Supabase environment is available.

## Non-goals

- No assignment while an auction is open.
- No live-draft turn advancement for pre-draft setup assignments.
- No ability for captains or spectators to use the direct-assignment action.
- No automatic price selection or silent budget override.
- No changes to the existing admin roster swap behavior on `/teams`.
- No new audit-log table in this iteration.
