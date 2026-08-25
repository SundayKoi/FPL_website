# League navigation and My Team dashboard

**Date:** 2026-08-25
**Status:** Approved design, pending implementation plan

## Goal

Replace the congested Premier and Academy header menus with two clearly
branded league experiences that share one navigation structure. A player can
switch between FPL and FPL Academy from the brand in the top-left corner and
can open a private My Team dashboard for their current roster, upcoming match,
tournament codes, spectator draft, and opponent scouting.

The redesign must be easy for league players to learn, work on mobile, preserve
existing routes through redirects, and enforce every private team permission in
Postgres rather than relying on navigation visibility.

## Navigation architecture

### League brand chooser

The top-left brand becomes a two-option chooser:

- **FPL**, using the existing FPL logo and name.
- **FPL Academy**, using a distinct Academy logo treatment and the full FPL
  Academy name.

The header infers the active league from the current route. Opening the chooser
does not change pages until an option is selected. Selecting the active league
goes to that league's home page. Selecting the other league goes to the paired
version of the current league page when one exists; otherwise it goes to the
other league's home page.

Paired destinations include Home, Players, Teams, Schedule, Stats, and My
Team. Query parameters that make sense in both leagues, such as stats tabs or
schedule season filters, should be preserved using the existing league-link
helpers.

### Desktop navigation

The active league's common destinations are promoted out of the old Premier
and Academy dropdowns:

- Players
- Teams
- Schedule
- Stats
- My Team

Home remains available by selecting the active league in the brand chooser.
Shared destinations are grouped as follows:

- **Play:** Auction Draft and Match Drafter.
- **Premium:** Betting, Banger Board, Player Cards, and the external Draft
  League destination.
- **Info:** the Info landing page, Sign Up, League Links, Rulebook, and Support
  the Devs.

Admin and Broadcaster are removed as standalone header links. Authorized users
see them in a visually separated Staff section inside Info. The Admin entry
keeps its current staff-tier visibility, including the broadcaster-only limited
hub; Broadcaster remains available only to owners and broadcasters. Moving the
links does not change either route's server-side gate.

The per-page Premier/Academy toggle is removed from every paired league page.
League switching belongs exclusively to the brand chooser.

### Mobile navigation

Mobile uses the same information architecture in one expandable menu. Direct
league links appear first, followed by expandable Play, Premium, and Info
groups. The active league name and logo remain visible while the menu is open.
All buttons and menus retain keyboard, Escape-key, outside-click, focus, and
route-change behavior.

## My Team experience

### Routes and compatibility

Add paired league routes:

- `/my-team`
- `/academy/my-team`

Existing `/captain`, `/captain/scouting`, `/academy/captain`, and
`/academy/captain/scouting` URLs redirect to the equivalent new routes so
bookmarks and shared links continue to work. The canonical scouting routes live
under My Team.

My Team remains visible in navigation for every visitor:

- Signed-out visitors see an explanation and Discord sign-in action.
- Signed-in visitors without an approved player identity see claim guidance
  and links to team pages.
- Players with a pending claim see its status, who can approve it, and an
  option to withdraw.
- Approved players, captains, and admins see the dashboard allowed by their
  role.

### Dashboard composition

The dashboard is organized around the user's active team and next fixture:

1. **Team header:** team name, league, season, and the signed-in player's
   roster identity.
2. **Next match:** opponent, scheduled time, series format, stage, division,
   and match status.
3. **Primary match actions:** Watch Draft and Scout Opponent.
4. **Tournament codes:** one copyable code per game for the resolved fixture.
5. **Team schedule:** upcoming fixtures first, followed by recent results.
6. **Roster:** the complete team with the signed-in player's roster spot
   highlighted.
7. **Captain tools:** result reporting and existing captain-only actions in a
   clearly separated section.
8. **Admin tools:** the existing team switcher and management panels, hidden
   from ordinary players and captains where appropriate.

The current captain page components and queries should be reused and separated
by responsibility rather than duplicated. Player-safe dashboard sections must
not import or expose captain mutation controls.

### Spectator draft and scouting

Watch Draft uses the fixture's existing series draft URL. Approved team members
may view the complete series draft, while existing draft authorization
continues to decide who may ready, ban, pick, choose sides, reset, or perform
other mutations. A spectator link never grants draft authority.

Scout Opponent opens the existing scouting experience for the resolved next
opponent. Approved members of either team in the upcoming fixture, captains,
and admins may access it. The route derives the team from the signed-in
identity except when an admin deliberately uses the validated team switcher.

Result reporting remains captain- and admin-only.

## Canonical player identity

### Unified identity record

Add one season-scoped player identity model that links a canonical player entry
to a verified `profiles` row. It is the source of truth for My Team access,
regardless of how the link was created.

Each record stores:

- the canonical player identity;
- the verified profile ID;
- the league season;
- status: pending or approved;
- source: admin assignment, team-page claim, or card claim;
- request and decision timestamps; and
- the deciding profile when an approval was required.

Use stable foreign keys rather than player, Riot, or Discord display names.
Display-name changes must not break an approved link. Add indexes for every
foreign key and for the profile/season and player/season lookups used by RLS
and My Team resolution.

Constraints enforce:

- at most one active approved Discord profile for a player in a league season;
- at most one active approved player identity for a Discord profile in a
  league season; and
- a pending self-claim belongs to the signed-in profile that created it.

Rejected claims are removed, matching the existing recoverable card-claim
behavior. Revoking an approval returns the player to an unlinked state and
immediately removes private team access.

### Admin linking from Players

Extend the existing admin player-pool editor on each league's Players page.
Every canonical player row shows its identity state and, for authorized admins,
a searchable profile picker.

The picker lists only profiles created by a real sign-in and displays enough
verified Discord context to distinguish similar names. It does not accept a
free-form Discord handle. Selecting a profile creates an approved identity
link immediately. Admins can replace or revoke an existing link through an
explicit confirmed action.

A person must sign in with Discord at least once before an admin can link them.

### Claiming from a team page

Public Premier and Academy team rosters show a Claim this roster spot action
for unclaimed players. Signed-out visitors are sent through sign-in and safely
returned to the same team page. A signed-in visitor may submit a pending claim
only for their own profile.

Team pages expose only neutral claim state such as Unclaimed, Pending, or
Claimed. They do not expose the linked Discord ID. A claimant can withdraw a
pending request.

Captains may approve or reject claims only for players currently rostered on
their own team and season. Admins may decide any claim. The existing card claim
queue should evolve into one identity-claim queue, or share a common underlying
decision component, so staff and captains do not manage duplicate requests in
separate systems.

### Existing card claims

Card ownership and player-team identity remain distinct permissions, but an
approved card claim can establish the same canonical identity when its season
and Riot identity resolve unambiguously to one canonical player. That approval
creates or approves the unified identity record in the same transaction.

If the mapping is missing or ambiguous, the card claim retains its existing
card-editing meaning and the identity link stays pending for captain/admin
review. No normalized-name guess may grant private team access.

## Authorization

UI visibility is presentation only. Database policies and narrowly scoped
functions enforce access.

### Identity claims

- Authenticated users may create and withdraw only their own pending claims.
- Captains may decide claims only for their current team and league season.
- Admins and owners with full admin authority may assign, approve, revoke, or
  replace links.
- Broadcaster status alone grants no player-identity authority.
- Anonymous users cannot create or inspect private claim details.

### Private team data

Tournament codes and any future private team record are readable only when the
caller is:

- an approved current member of either team on that fixture;
- a registered captain of either team for that season; or
- an authorized admin/owner.

Extend the existing match-code policy rather than bypassing it in server code.
The authenticated role alone is never sufficient. RLS helpers must check
`auth.uid()` explicitly, use indexed identity lookups, pin their search path,
and have the narrowest practical execute grants.

Scouting routes use the same current-team resolution on the server. Public
stats already used to build scouting remain public; the private personalized
surface does not permit arbitrary team impersonation through query parameters.

The service-role client must not be used by My Team, claim, or ordinary admin
player-linking UI. Cookie-bound browser/server clients operate under RLS.

## Data flow

For a normal My Team request:

1. Resolve the authenticated profile through the server Supabase client.
2. Read the approved canonical player identity for the active league season.
3. Resolve that player into the active featured league draft and current team.
4. Resolve the corresponding `league_teams` record using existing league/team
   identity helpers.
5. Load the team's fixtures, next opponent, roster, results, spectator draft,
   and scouting inputs.
6. Read tournament codes under the caller's RLS policy.
7. Add captain-only or admin-only data only after separately resolving those
   roles.

An admin may select another active team with the existing validated team
switcher. Ordinary players and captains cannot override their resolved team
with a query parameter.

## Empty, failure, and conflict states

- **No approved link:** show sign-in or claim onboarding, never an empty private
  dashboard.
- **Pending claim:** show the claim status and withdrawal action without private
  team data.
- **Approved identity with no active roster:** explain that the identity is
  linked but no current team was found; link to the public league pages.
- **No upcoming fixture:** retain roster, full schedule, recent results, and
  role-specific tools; show a calm no-match state.
- **No tournament codes:** say that codes have not been posted yet; never fall
  back to codes for another fixture.
- **Ambiguous identity mapping:** require captain/admin review and grant no
  private access.
- **Conflicting approved claim:** reject atomically with a friendly explanation
  and a path to contact an admin.
- **Unavailable scouting data:** isolate the failure so the rest of My Team
  still renders, following the current captain-page behavior.

## Migration and compatibility

Use a new forward migration and matching pgTAP test file. Do not edit existing
applied migrations. Backfill unified approved identities only from existing
approved card claims that map unambiguously; log or leave all other records for
manual review.

Existing captain records continue to grant captain access independently of a
player identity link. This prevents the redesign from locking out a current
captain while identity links are populated.

All existing public Premier and Academy URLs remain stable. Only captain URLs
become redirects to the canonical My Team routes.

## Testing

### Navigation and route tests

- FPL and FPL Academy brand states render the correct logo, label, and paired
  destinations.
- Selecting the current league opens its home; switching leagues preserves a
  paired destination and compatible query parameters.
- Premier and Academy dropdowns and page-level toggles are absent.
- direct league links and Play, Premium, and Info groups contain the specified
  destinations.
- Admin and Broadcaster appear only in Info for their existing staff tiers.
- desktop keyboard behavior and the mobile expandable menu remain accessible.
- old captain and scouting URLs redirect to the correct league's My Team route.

### Component and page tests

- signed-out, unlinked, pending, approved-player, captain, and admin My Team
  states render the correct sections and actions;
- players cannot see result reporting or admin controls;
- captains retain result reporting and their existing tools;
- admins retain team switching and management panels;
- next-match, no-match, no-code, missing-roster, and scouting-failure states are
  isolated and understandable;
- team-page claims and withdrawals use the signed-in profile only;
- the admin profile picker links only an existing verified profile; and
- approved card claims synchronize identity only for an unambiguous mapping.

### Database tests

Add pgTAP coverage proving:

- self-claims can be inserted and withdrawn only by their owner;
- strangers cannot approve, reject, replace, or inspect private claim details;
- captains can decide only claims on their own current roster;
- admins can link and revoke identities;
- uniqueness constraints prevent two profiles claiming one player and one
  profile claiming multiple players in the same league season;
- approved team members can read codes only for fixtures involving their team;
- other authenticated users and anonymous users cannot read any tournament
  codes;
- captains and admins preserve their existing code access;
- revocation removes member access immediately; and
- ambiguous or missing card-to-player mappings never create approved team
  access.

Run the narrow component, route, query, and pgTAP tests first. Before completion
run the full Vitest suite, lint, production build, and complete pgTAP suite
documented in the repository README.

## Documentation

Update `README.md` where the role descriptions currently refer only to the
Captain hub. Update `docs/backend.md` with the canonical player identity model,
claim/approval flow, My Team query boundary, private team-data policy, and old
route redirects.

## Out of scope

- Allowing players to edit rosters, fixtures, tournament codes, or league
  configuration.
- Allowing non-captain players to submit match results.
- Automatically trusting a typed Discord name, Riot display name, or fuzzy
  normalized-name match.
- Giving spectators any match-draft mutation authority.
- Exposing Discord IDs or private claim details on public team pages.
- Replacing the public Teams, Schedule, Stats, or Players pages with My Team.
- Changing staff-tier definitions or the server-side Admin/Broadcaster gates.
