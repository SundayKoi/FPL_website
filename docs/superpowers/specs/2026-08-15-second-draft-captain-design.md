# Optional Second Draft Captain

## Goal

Allow an admin to assign one optional second captain to each draft team. The second captain has the same permissions as the primary captain for the live draft, including nominating, bidding, and making Nemesis picks.

## Scope

This change applies to the draft team model and draft authorization paths. It does not change the separate league-season captain model used by the captain page, reports, or match administration.

## Design

### Data model

Add a nullable `captain_profile_id_2` column to `public.teams` with a foreign key to `public.profiles(id)`. Add a per-draft uniqueness constraint for the second-captain slot and a check constraint preventing the same profile from being assigned as both primary and second captain on one team.

Existing `captain_profile_id` remains the primary captain field. Existing rows remain valid, and the primary captain remains required by the draft-start validation; the second captain is optional.

### Admin setup UI

Add an optional “Second captain” profile selector to the existing team editor. The selector excludes the selected primary captain. Clearing it writes `NULL`. The setup preview displays whether a team has a second captain while preserving the existing primary-captain status.

The existing admin table update flow is retained, so the new field is editable only by admins under the current RLS policy.

### Draft authorization

Update the shared `caller_team(p_draft_id)` helper to return the team when the authenticated profile matches either captain field. This automatically extends the normal nomination and bidding RPCs, along with admin nomination’s caller lookup.

Update the Nemesis pick authorization check to accept either captain field. The second captain therefore receives the same full draft permissions as the primary captain.

### Client state

Extend the `Team` type with the nullable second-captain field. Update `useDraftState` so `myTeam` resolves when the current profile matches either captain field. All existing board controls then work without separate second-captain branches.

### Compatibility

Primary-captain display and league-season captain features continue using `captain_profile_id`. Existing drafts require no data migration beyond the nullable schema addition. The current start rule still requires every team to have a primary captain.

## Testing

- Add component tests covering second-captain selection, clearing, and exclusion of the primary captain.
- Add preview/state tests covering second-captain representation and recognizing a team through either captain field.
- Add database tests covering optional second captains, duplicate-profile rejection, second-captain authorization for nomination/bidding/Nemesis, and preservation of primary-captain requirements.
- Run the focused Vitest suite, the SQL tests available in the repository, lint, and the production build.

## Non-goals

- Supporting more than two captains.
- Replacing captain fields with a generalized captain-membership join table.
- Changing league-season captain assignments or captain-page permissions.
