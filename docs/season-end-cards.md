# Season's End cards

Open **Admin → Season's End** (`/admin/seasons-end`). Admins and owners can
calculate all 56 accolade cards for either league and a selected season, plus
the normal cumulative Season Cards for contributors with more than five games.
This is a read-only awards desk, not a collectible mint or a season-closing
operation. The former `/admin/season-end` route redirects here for existing
admin bookmarks.

Ordinary accolade entries use a unified collectible treatment: a framed portrait
face with an exact 63:88 ratio, champion splash art, season/league and known-
division metadata, and the award title and description over a bottom-weighted
art gradient. The lower result panel is an ivory 22% region for the winner
identity, headline value/unit, and concise evidence. Long evidence, status notes,
and team rosters remain available in keyboard-accessible disclosures below the
fixed-ratio face; missing art uses a neutral art region and empty results keep
the same frame and explanatory content. Team honors use the roster-card data
to choose a champion background when a complete team is available. Best of
Champion is the visual exception: its face is a 5:7 full-bleed champion splash
with a clean continuous double gold edge frame, a manually calibrated crop, the
player name in the lower title region, and the selected season/league in the
lower-left footer. A resolved division adds one small Solari or Lunari seal in
the upper-right; there is no OVR or replacement rating. Its award record and
supporting evidence remain in the compact details below the face. Missing or
conflicting division metadata leaves the face valid without a seal. Season Cards remain the ordinary
cumulative player cards for contributors with more than five games.

Best of Champion ranks qualifying player/champion records by champion wins,
then unrounded win rate, then unrounded mean role-relative performance. A
player needs at least five regular-season games overall and at least three on
the candidate champion. A strongest-result-first allocation awards at most one
card per player and per champion across the selected league; it does not reroute
an earlier winner to improve coverage. There is no minimum win rate, win total,
or performance floor. Cap-related promotions are identified in the award
evidence so a promoted recipient is not silently presented as the unrestricted
champion leaderboard leader. Each assigned winner is rendered with its
per-champion title and assigned splash art inside the full-art Best of face; it
does not use the separate cumulative Season Card layout. The live admin preview
is deliberately unsigned: it does not read or display a player's saved
autograph. A future frozen signed pull may supply ink explicitly without
changing the preview or award calculation. See the [Best of results-ranking
decision](plans/2026-09-16-best-of-results-ranking.md).

Ordinary player, player-pair, and Teamwork accolades are calculated separately
inside Solari and Lunari, so each such accolade has one card per division. The
card marks Solari with a sun and Lunari with a moon. Best of Champions is the
exception: it is assigned once across the selected league, so Premier has at
most one Best of Ahri, one Best of Azir, and so on across both divisions.
Academy is calculated independently. The ordinary cumulative Season Cards
remain outside this division policy. Division seals are presentation metadata
resolved from every selected-season regular-season appearance; conflicting or
unresolved team/row divisions do not receive an invented default.

Best of face crops use the curated base-skin registry in
`src/lib/season-end/championArt.ts`. It stores CSS crop positions rather than
source-image face coordinates, currently matching the approved Milio (48%),
Senna (53%), Maokai (70%), and Jhin (64%) horizontal positions with 50%
vertical positioning and no additional zoom. Unreviewed champions, new
aliases, and alternate skins use a centered cover fallback until explicitly
reviewed. The design decision and acceptance criteria are recorded in [the Best
of prototype adoption plan](plans/2026-09-16-best-of-prototype-adoption.md).

The server checks staff access before fetching data through the cookie-bound
Supabase client. Reads are scoped to the selected season and `Regular` phase,
paged in primary-key order until exhaustion, and fail together on query errors.
Season prefixes enforce the existing Premier/Academy boundary. When fixtures
exist, their team names also constrain the data. No migrations are required.

## Award rules

- All exact leaders share an award; names only determine display order.
- Volume-based player, pair and team awards rank by per-game averages or event
  rates using actual observed games, not scheduled fixtures. They require at
  least five measured games. Zero occurrences do not earn a counting award.
  Missing fields are never converted to zero.
- Per-minute and damage-per-gold measures divide season totals, rather than
  averaging individual game rates.
- Gold/CS comparisons require a unique same-role opponent on the other side.
  Games shorter than a checkpoint do not contribute; missing or ambiguous
  observations in games reaching it withhold the affected award.
- Team dragons and Barons are counted once per team game. Fortress uses towers
  destroyed by the opponent. Speedrunners requires three wins; Marathon
  Winners counts wins strictly longer than 40 minutes.
- Clean Sweep counts completed best-of-three/five fixtures with zero losses,
  using authoritative fixture scores (including administratively scored
  results). A single-game win is not a sweep.
- Final standings use series wins, then fewest series losses, matching the
  existing standings ordering without using alphabetical order to break ties.
- The Starting Five waits for all regular-season fixtures to finish. Other cards
  show provisional leaders while fixtures remain open.
- The Starting Five commemorates the winning team's most-played complete
  five-player lineup from actual games, including substitutes when they were
  part of that lineup. Tied teams and equally frequent lineups are retained.
- Bloodline follows a player's appearances, ordered by game time then numeric
  match ID.
- Performance is the mean of same-role midrank percentiles for per-game KDA,
  champion damage/minute, CS/minute, vision/minute and kill participation.
  Late Bloomer takes the highest mean in the final chronological third of
  league games, requiring three appearances there and overall qualification.
  Metronome minimizes population standard deviation, requiring a mean of at
  least 60/100 and no game below 40/100.
- Against the Grain defines a rare champion as picked in at most 5% of league
  games, counting all participants' picks. It ranks the share of a qualified
  player's appearances on those champions.
- Grand Theft Objective uses all objective steals. Stored data does not prove
  Baron-specific steals, so it does not use the Grand Theft Baron title.

Card headlines are rounded to whole numbers with half-away-from-zero rounding.
Percentages are percentage points, and signed means, ratios, and
durations keep their ordinary units. Volume-based cards display the normalized
per-game figure or event rate as the headline, while retaining the winner's
season numerator total and game count in the evidence line. When an explicitly
configured additive count average or rate is below one, the headline switches
to the observed season numerator as a labelled total and removes `/game` or
`/min`; the raw value used for ranking is unchanged. Missing totals never
become zero, and percentages, ratios, durations, and non-additive means do not
receive count-total fallbacks. Best of evidence shows champion wins, record,
win rate, champion appearances, and mean performance; display rounding never
changes selection.

## Champion mappings

`src/lib/season-end/champion-map.json` is a pinned snapshot downloaded September
16, 2026 from Riot's public sources:

- [Data Dragon 16.16.1](https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/champion.json): champion IDs, display names and all class tags.
- [Universe champion browse](https://universe-meeps.leagueoflegends.com/v1/en_us/champion-browse/index.json): associated faction slug, matched to normalized names/IDs.

World Tour uses that associated faction as the region, rather than inventing
birthplaces or multi-region lore affiliations. `unaffiliated` maps to an empty
region list.
Unknown mappings withhold the affected award until the snapshot is updated.
The page performs no runtime requests to Riot.

## Data quality and verification

Incomplete participant records or duplicate player identities withhold winners.
Conflicting team labels withhold only team-dependent awards; individual stats
remain usable. This matters for historical data with substitute/transfer team
labels. Missing metric values withhold the affected award, with a visible
explanation. Entirely absent games cannot be inferred from raw stats, so the
page explicitly states that results reflect currently ingested data even when
all fixtures are complete.

Focused tests live in `src/lib/season-end/` and
`src/app/admin/seasons-end/page.test.tsx`. They cover isolation, paginated reads,
admin gating, ties, missing data, rates, timeline comparisons, chronological
streaks, series completion, rosters, performance floors and champion mappings.
