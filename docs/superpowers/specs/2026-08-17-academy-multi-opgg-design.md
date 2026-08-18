# Academy Captain and Team Multi-OP.GG Links

## Goal

Add multi-account OP.GG access to the Academy team and captain experiences, matching the behavior already available on Premier pages.

## Existing context

- `src/app/teams/[slug]/page.tsx` is shared by Premier and Academy and already builds a full-roster multi-search URL.
- `src/app/academy/teams/[slug]/page.tsx` redirects to the shared team page with `league=academy`.
- `src/app/captain/page.tsx` is shared by Premier and Academy through `CaptainPageView`; the Academy route passes `league="academy"`.
- The captain page currently builds a multi-search URL for the opponent roster only.
- `src/lib/opgg/multiSearch.ts` accepts roster OP.GG URLs and Riot IDs, deduplicates accounts, and returns `null` when no usable accounts exist.

## Design

The shared captain page will compute a multi-search URL for the active captain’s own roster using the existing `fetchMyRoster` result. The URL will use each player’s persisted OP.GG account data first and Riot account records as fallback, through the existing helper. The captain page will pass this URL to the roster UI and render a single external “My Team OP.GG Multi” link near the roster heading, using the same external-link attributes and visual treatment as the existing team-page link.

The Academy team page requires no separate implementation because it already uses the shared team-page path and league-specific Academy data selection. Its existing “Team OP.GG Multi” behavior remains unchanged.

## Data flow

1. `fetchMyRoster` returns draft players and Riot accounts for the active team.
2. `opggMultiSearchUrlFromRosterPlayers` is attempted with the draft players.
3. If that produces no URL, `opggMultiSearchUrlFromRiotIds` is used with the team’s Riot accounts.
4. The resulting URL or `null` is passed to `MyRoster`.
5. `MyRoster` conditionally renders the link; no link appears if neither source contains valid accounts.

## Testing and verification

- Add/extend component or helper tests to verify the captain roster receives a multi-search URL and that the link is omitted when no accounts are usable.
- Run the focused OP.GG and captain tests.
- Run the project’s lint/typecheck/test command available in `package.json`.

## Scope exclusions

- No schema or data migration.
- No changes to the OP.GG URL format or account parsing.
- No redesign of the Academy team page or captain page layout beyond the new link.
