# Captain Opponent Scouting

**Date:** 2026-08-23  
**Status:** Approved design

## Goal

Add a data-only scouting section to the Premier and Academy Captain pages. It automatically
targets the active team's next scheduled opponent and helps a captain inspect
that opponent's recorded pick/ban history. It does not score threats, recommend
picks or bans, or label any champion as a priority.

The section is presented as a Premium feature, but there is no additional
premium-role check: every captain has Premium access by default. The existing
Captain-page gate remains the access boundary, and admins see the scout for the
team selected in the existing admin switcher.

## Placement and states

`/captain` and `/academy/captain` render `OpponentScout` immediately below
`NextMatchCard`, keeping the opponent context close to the next fixture. Every
query stays inside the active page's league and season.

The section has four states:

- **No upcoming fixture:** do not render a duplicate empty state; the existing
  Next Match card already explains that no opponent is scheduled.
- **Unmatched opponent:** show draft history that can be matched by the fixture's
  opponent name, but explain that the current player roster is unavailable if
  the opponent cannot be resolved to a current `league_teams` row.
- **No recorded drafts:** show the opponent header and a concise "No recorded
  drafts for this opponent yet" state.
- **Data available:** render the complete scouting dashboard described below.

## Data sources and identity rules

No schema change or service-role access is required. The feature is a read-only
projection over existing public draft records and the server-rendered Captain
page.

- The next opponent comes from the existing `pickNextFixture` result.
- The opponent's **current roster** comes from the same featured-draft
  `teams`/`players` source used by the Teams page and `fetchMyRoster`. This is
  the only roster used to decide which player rows appear.
- Historical drafts come from `match_drafts` joined in application code to
  fixtures involving the opponent. Only fields needed by the scout are fetched:
  fixture/game ids, game number, team names, winner, actions, positions, and
  timestamps, plus fixture season, stage, schedule time, teams, and result.
- Team-name comparisons use the existing trimmed, case-insensitive
  normalization helpers because fixtures and match drafts intentionally store
  team names as text.
- Champion names resolve through `src/lib/match-draft/champions.ts`, exactly as
  the Drafter and Match Draft Summary do. Every displayed champion includes its
  Data Dragon icon and text name.

### Trades and modular player history

Player rows are modular rather than permanently owned by a team. The scout first
loads the opponent's current roster from the featured draft, then aggregates
historical pick actions by normalized `action.playerName` for those current
players regardless of which team they represented when the action was recorded.
Consequently, a traded player immediately appears under the new current team and
brings their recorded champion history with them; a traded-away player disappears
from the old team's scout.

The aggregator never infers a player from a champion or from today's role. Draft
actions without a recorded `playerName` remain valid team history but are excluded
from player champion-pool counts. Each player row shows its attributed-game sample
size so missing older attribution is visible rather than silently overstated.

## Scope filter

The dashboard has one local `Draft history` selector:

- **Recent 5 series** — the opponent's five most recent series with at least one
  recorded draft.
- **Current season** — all recorded games in the Captain page's current season;
  this is the default.
- **All history** — every recorded fixture draft matched to the opponent's current
  normalized team name.

All totals, percentages, rankings, and sample labels recompute from the selected
scope. Team panels use the opponent's selected games. Player pools search draft
actions across the whole active league so a traded player's former-team games
remain attributable: current-season and all-history use the matching global time
window, while recent-five uses each current player's five most recent attributed
series. The full source rows are loaded once by the Server Component; changing
the scope is client-local and makes no additional request.

## Dashboard content

### Opponent snapshot

Show the next opponent, kickoff, series format, drafts sampled, blue-side share,
and distinct champions picked. Percentages always include their count or sample
label nearby.

### Pick and ban patterns

- Most common first picks: the first champion picked by the opponent in each
  game, ranked by count, then champion name for stable ties.
- Most banned against the opponent: bans made by the other side in games where
  the opponent participated, ranked by count and percentage of sampled games.
- Draft-sequence patterns: first-ban phase (slots 1-3), second-ban phase (slots
  4-5), common opening pick sequences, and common champion pairings.
- Side tendencies: blue/red sample counts and their common openings.
- Series adaptation: neutral counts describing whether the opponent changed its
  first pick after a loss and how many champions it repeated in the next game.
- Recorded flexes: champions assigned to more than one role/player in confirmed
  draft positions. This is factual labeling only.

Red is reserved for ban data. Blue and purple distinguish blue-side and red-side
draft facts. Green is reserved for wins, while neutral surfaces and text keep
champion identity consistent. Color never replaces a text label.

### Champion pools by current player

Render the opponent's current roster in Teams-page role order. Each row shows the
player name, role, three to five most frequently attributed champions, per-champion
game counts, distinct champion count, and total attributed picks. Champion labels
use one consistent neutral style; individual champions do not receive arbitrary
colors.

When a current player has no attributed draft actions, keep the player row and show
"No attributed picks yet." This distinguishes missing history from a missing
current roster member.

### Past drafts

List every game in the selected scope, newest first, grouped naturally by series
date/fixture. Rows show opponent, game number, the scouted team's side, and the
recorded outcome when known. Each row expands to the entire two-sided draft:

- blue and red team names and side labels;
- all five picks for each side in recorded pick order, with icons and names;
- each side's bans split into **Ban phase 1 · first 3** and
  **Ban phase 2 · last 2**;
- skipped or missing actions rendered as a labeled empty slot rather than removed.

The expanded view uses the ordered action data as the authority. Confirmed
`positions` may add role labels but must not reorder or hide the recorded draft
sequence.

## Component and module boundaries

- `src/lib/scouting/types.ts` defines the compact query rows and derived dashboard
  result shapes.
- `src/lib/scouting/derive.ts` contains pure functions for scope selection,
  opponent-side resolution, first picks, opponent bans, phase splits, sequences,
  pairings, side facts, adaptation facts, flexes, player pools, and full-draft
  rows. It has no Supabase or React dependency.
- `src/lib/scouting/queries.ts` performs the narrow Supabase reads and returns raw
  inputs. It reuses current roster helpers rather than creating another roster
  authority.
- `src/components/captain/OpponentScout.tsx` owns the local scope selector and
  composes focused presentation components under `src/components/captain/scouting/`.
- The existing `ChampionIcon` presentation is reused or extracted to a shared
  match-draft component if necessary; champion URL logic is not duplicated.
- The shared `CaptainPageView` in `src/app/captain/page.tsx` resolves and fetches
  the scout in parallel with the other next-opponent data, then mounts it below
  `NextMatchCard` for both league variants.

The server returns plain serializable rows and derived inputs. No Realtime
subscription is needed because this is historical preparation data and a normal
page refresh is sufficient after a new draft completes or a trade changes the
current roster.

## Error handling and data quality

- Supabase query errors fail the scout section safely without affecting tourney
  codes, reporting, roster, or other Captain-page tools. The page logs the server
  error and renders a concise unavailable state.
- Incomplete drafts contribute only actions actually recorded. Denominators use
  games containing the relevant fact, and the UI exposes sample counts.
- Unknown champion names retain their text and receive the existing missing-icon
  placeholder.
- Unknown winner data renders no win/loss badge.
- Skipped bans and picks remain visible in the complete-draft view and do not
  enter champion-frequency counts.

## Authorization

The existing `/captain` server gate remains unchanged: signed-in current-season
captains and admins may reach the page. There is no Discord Premium lookup because
all captains receive Premium by default. The Premium label is product placement,
not a separate authorization flag.

The underlying fixture and match-draft records already have public read policies
and appear on public match/team pages. This feature does not introduce private
data or a new client write path, so it needs no RLS migration or pgTAP coverage.

## Testing and verification

### Vitest: pure derivation

- Resolve the opponent as blue and red across multiple games.
- Select recent-five-series, current-season, and all-history scopes.
- Count first picks and opposing-team bans with stable tie ordering.
- Split ban slots 1-3 and 4-5 for both sides.
- Derive full drafts without removing skipped actions.
- Keep only current-roster player rows while carrying a traded player's historical
  `playerName` actions across former teams.
- Exclude unattributed actions from player pools while preserving team totals.
- Derive side, pairing, flex, and post-loss adaptation facts from neutral counts.

### Vitest: components/page

- Render the section for the next opponent in both Premier and Academy without
  crossing league or season boundaries.
- Render all four empty/error states without breaking adjacent Captain sections.
- Update metrics when the scope selector changes.
- Render champion icon plus name everywhere a champion appears.
- Use consistent neutral player-pool labels and red ban presentation.
- Expand a past game to both sides, five picks each, and separate three-ban/two-ban
  phase groups.
- Confirm recommendation language and generated priority labels are absent.

### Broader verification

Run the focused scouting and Captain-page tests, then `npm run lint`, `npm test`,
and `npm run build`. No database test is required unless implementation discovers
a schema or policy change, in which case the design must be amended before adding
a forward migration and matching pgTAP coverage.

## Out of scope

- Generated pick/ban recommendations, threat scores, priority labels, or coaching
  prose.
- A separate scouting route or Premium navigation destination.
- Captain-authored notes, exports, notifications, live draft overlays, or external
  Riot match-history enrichment.
- Changing roster ownership, trade workflows, or the Teams page; the scout consumes
  the current roster those existing workflows already produce.
