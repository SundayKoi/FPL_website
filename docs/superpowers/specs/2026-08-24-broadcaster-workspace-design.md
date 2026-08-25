# Broadcaster Workspace Design

## Summary

Add a private `/broadcaster` workspace for preparing commentary for the Premier and Academy streamed matches of the week. The workspace follows the fixture already featured on each league homepage, provides direct draft and OBS-overlay tools, and organizes existing scouting data into Team A, role-by-role Matchups, and Team B views.

The new page is available to league owners and profiles with `is_broadcaster = true`. An admin who is neither an owner nor a broadcaster does not receive access.

## Goals

- Give broadcasters one page for the current Premier and Academy featured fixtures.
- Make both teams' draft tendencies, champion pools, and in-house form easy to use during commentary preparation.
- Pair opposing players by role without hiding substitutes or duplicate-role roster entries.
- Provide one-click access to the fixture draft and its transparent OBS overlay.
- Reuse the existing broadcaster role, featured-fixture configuration, and scouting calculations.
- Keep the broadcaster page read-only and avoid a second source of truth for streamed fixtures or overlay URLs.

## Non-goals

- Selecting a separate broadcaster-only fixture.
- Editing rosters, schedules, draft state, or scouting history from the workspace.
- Replacing the existing broadcaster access to the limited homepage controls on `/admin`.
- Adding notes, rundown documents, live commentary collaboration, or per-broadcaster preferences.
- Choosing a single starter when multiple roster members share a role.

## Access and navigation

`/broadcaster` performs a server-side staff-tier check before loading workspace data. Access is allowed when `isOwner || isBroadcaster`; `isAdmin` alone does not grant access. Unauthorized visitors redirect to `/`, consistent with existing protected staff pages.

The root layout passes a separate broadcaster-navigation flag to `SiteNavigation`. A `Broadcaster` link is shown only to owners and broadcasters. The existing `Admin` link remains visible under its current rules, because broadcasters use the limited admin homepage controls to select the featured matchup and broadcast copy.

The navigation flag is presentation only. The page repeats the server-side access check, while existing database policies continue to protect writes.

## Fixture selection

The workspace has a Premier/Academy control backed by `?league=premier|academy`. Invalid or missing values resolve to Premier. URL state makes either league view bookmarkable and shareable without adding client-side persistence.

For the selected league, the server loads the same schedule and `homepage_featured_settings` used by its regular-season homepage. It calls `selectHomepageFeaturedFixture(schedule.fixtures, settings.fixtureId)`, preserving the homepage behavior:

1. use the explicitly configured fixture when it belongs to the active schedule set;
2. otherwise use the first active-stage fixture;
3. otherwise return no fixture.

Academy uses the existing Academy team-name scope before resolving its schedule. Premier uses the Premier schedule path. The broadcaster workspace must not implement its own concept of the current week or fallback fixture.

## Page structure

### Header and broadcast tools

The page header identifies the selected league, fixture teams, kickoff time, division/stage, and best-of format. When configured, it also links to the league's Twitch channel.

For a resolved fixture, the header provides:

- `Open draft`, linking to `/match-draft/{fixtureId}`;
- `Copy OBS overlay`, copying the absolute URL for `/match-draft/{fixtureId}?overlay=1&bg=transparent`;
- a visible text fallback if clipboard access fails, so the link is still usable.

The overlay follows the live game because the URL intentionally omits a `game` query parameter. The URL is derived from the fixture and is never stored separately.

### Workspace tabs

A client-side workspace component owns the selected tab only. It renders three tabs:

1. `{Team A} scouting`
2. `Matchups`
3. `{Team B} scouting`

All data is loaded by the server before the client component mounts. Switching tabs does not issue new queries or reset league URL state.

### Team scouting tabs

Each team tab uses the established captain scouting presentation and derivation logic: current-season/recent/all-history scope, player champion pools, in-house champion form, draft patterns, adaptation after losses, flexes, and past drafts.

The shared scouting UI must support a neutral team subject in addition to its existing captain-facing "opponent" wording. The broadcaster page supplies one `ScoutSource` per fixture team, with the subject team's name and roster. This change must preserve the captain page's current wording and behavior.

### Matchup tab

The matchup view uses five role sections in `ROLE_ORDER`: Top, Jungle, Mid, Bot, and Support. Each section shows the matching Team A and Team B roster groups side by side.

Every player card includes:

- display name and role;
- up to five most frequently attributed drafted champions and their pick counts;
- total attributed picks, distinct champion count, and games sampled;
- in-house total games;
- in-house champion rows with games, win rate, and average KDA when available.

If multiple players share a role, all are displayed within that team's side of the role section. If one team has no roster member for a role, that side shows `No rostered player`. The page does not infer starters.

Matchup data is produced by a pure derivation function from the two already-derived scouting datasets plus each source's in-house statistics. It contains no fetches and sorts roles and players deterministically.

## Data loading

After authorization and fixture resolution, the server resolves the fixture team names against the selected league's active teams. It then loads:

- scouting history once for the selected league;
- both team rosters;
- in-house statistics for each roster.

The single scouting history result is combined with each roster and the same featured fixture to produce two `ScoutSource` values. Existing `deriveScoutData` logic then creates the scoped scouting results for each team. This avoids duplicated network work and guarantees that both sides use the same history window.

Team-name matching uses the repository's existing normalization helpers. If a fixture team cannot be matched to a league team, that team's source uses an empty roster while draft history can still be derived from the fixture team name.

## Empty and failure states

- No featured or automatic fixture: show a league-specific empty state and a link to `/admin` for owners/broadcasters to choose the featured matchup.
- Missing roster or unmatched team: retain fixture and draft-history content; identify the roster as unavailable in player and matchup panels.
- No recorded drafts: show the existing no-history state while keeping roster and in-house data available.
- No in-house games: show `No in-house games found` per affected player.
- Scouting query failure: retain the fixture header and broadcast links, and replace scouting tabs with a safe `Scouting data is temporarily unavailable` message.
- Clipboard failure: show/select the absolute overlay URL rather than treating the operation as successful.

Raw query errors are logged server-side and are not rendered to the broadcaster.

## Security

The page is read-only. It uses the signed-in server Supabase client and existing anonymous/authenticated read policies; no service-role client is introduced.

No new migration is required. The existing `profiles.is_broadcaster`, `is_broadcaster()` helper, owner-managed broadcaster RPC, and featured-settings RLS policy remain the database source of truth. If implementation discovers that a required read is not available to authenticated broadcasters, that is an architectural change: stop and add a forward migration plus pgTAP authorization coverage instead of bypassing RLS.

## Testing

### Unit tests

- Matchup derivation follows `ROLE_ORDER`.
- Each side includes all players when a role has substitutes or duplicate assignments.
- Champion-pool and in-house summaries map to the correct player.
- Missing players, history, and in-house data produce deterministic empty values.
- Featured fixture resolution continues to match homepage behavior.

### Component tests

- Team A, Matchups, and Team B tabs switch without refetching.
- Team tab headings use neutral broadcaster wording while captain scouting keeps opponent wording.
- Matchup rows render both teams, duplicate-role players, and missing-role states.
- Draft and OBS actions use the featured fixture ID.
- Copy success and clipboard fallback are both represented accurately.
- Premier and Academy links preserve the requested league.

### Page and navigation tests

- Broadcaster: allowed and shown the navigation link.
- Owner without broadcaster flag: allowed and shown the navigation link.
- Admin without owner/broadcaster: redirected and not shown the navigation link.
- Ordinary authenticated user and signed-out visitor: redirected and not shown the navigation link.
- Explicit and automatic featured fixtures resolve for both leagues.
- No fixture and scouting-query failure render their intended partial states.
- Shared scouting history is loaded once per request.

### Verification

Run the narrow broadcaster, scouting, homepage schedule, navigation, and staff-tier Vitest suites first. Then run `npm run lint`, `npm test`, and `npm run build`. No pgTAP run is required unless implementation changes database behavior.

## Expected implementation boundaries

The implementation should add a focused broadcaster route, server loader/helpers, a client workspace, a matchup presentation/derivation module, and targeted tests. Existing scouting components should receive the smallest neutral-subject extension needed for reuse. The homepage fixture resolver and match-draft URL conventions should be imported or centralized rather than copied.

Unrelated changes currently present in the working tree must remain untouched.
