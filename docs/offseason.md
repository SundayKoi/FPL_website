# Offseason tournament

A temporary side event between S5 and S6. Players sign up as individuals.
Every week new captains draft new teams in the ordinary auction room, and
the teams play a capped round robin. From week 3 the lowest rated players in
each role also play an elimination tier, and its losing teams are out. The
event ends with Bo5 finals. The site keeps each player's Overall rating across
every week, using the S6 playstyle yardstick.

Everything here is built to be deleted when the event is over. See
[Removing it](#removing-it).

## What it adds

| Piece | Where |
| --- | --- |
| Tables, RLS, RPCs | `supabase/migrations/20261107000001_offseason_tournament.sql` (all `offseason_*`), `20261108000001_offseason_lock_in.sql`, `20261109000001_offseason_elimination_only_week.sql`, `20261110000001_offseason_captain_cost.sql`, `20261111000001_offseason_week_times.sql`, `20261112000001_offseason_packs.sql`, `20261113000001_offseason_card_signing.sql`, `20261113000002_offseason_mvp_votes.sql`, `20261114000001_offseason_captain_costs.sql`, `20261115000001_offseason_mvp_after_week.sql`, `20261116000001_offseason_draft_igns.sql`, `20261117000001_offseason_match_codes.sql`, `20261118000001_offseason_mvp_nominees.sql` |
| pgTAP | `supabase/tests/0138_offseason_tournament_test.sql`, `0139_offseason_lock_in_test.sql`, `0140_offseason_elimination_only_week_test.sql`, `0141_offseason_captain_cost_test.sql`, `0142_offseason_week_times_test.sql`, `0143_offseason_packs_test.sql`, `0144_offseason_card_signing_test.sql`, `0145_offseason_mvp_votes_test.sql`, `0146_offseason_captain_costs_test.sql`, `0147_offseason_draft_igns_test.sql`, `0148_offseason_match_codes_test.sql`, `0149_offseason_mvp_nominees_test.sql` |
| Logic, reads, server actions | `src/lib/offseason/` |
| Pages | `src/app/offseason/` (`/offseason`, `/offseason/schedule`, `/offseason/stats`, `/offseason/packs`, `/offseason/card`, `/offseason/signup`, `/offseason/players/[id]`, `/offseason/admin`) |
| Components | `src/components/offseason/` |
| Stats ingest | `scripts/offseason_ingest.py`, `scripts/test_offseason_ingest.py`, `.github/workflows/offseason-ingest.yml`; the admin's Ingest now button, `src/lib/offseason/ingestRun.ts` |

It touches the rest of the site in four ways:

- Each weekly auction is an ordinary row in `drafts`, `teams` and `players`,
  named `Offseason W{n}` or `Offseason W{n} Elimination`. Those drafts appear
  in the `/draft` directory and the admin draft list, and they run in the
  normal draft room and draft admin. They are never the featured draft, so
  league teams, rosters, cards and stats never read them. Offseason games go
  to `offseason_stats`, never to `raw_stats`.
- Every homepage links to `/offseason` while the newest event is not complete
  (`OffseasonHomeBanner`, `src/components/offseason/HomeBanner.tsx`, loaded by
  `fetchHomeOffseasonEvent`, `src/lib/offseason/home.ts`):
  - the preseason homepage shows a panel under its hero;
  - the Premier and Academy dashboards show a band under the featured matchup.

  The banner offers **Sign up** while sign-ups are open and **Schedule** once
  weeks are played. When the latest week has times, it also names the next
  one, its draft and then its games. It hides itself when the event is
  complete or the read fails.
- While the newest event is not complete, the site navigation leads to the
  offseason alone (`fetchOffseasonRunning`, `src/lib/offseason/home.ts`): the
  header shows one Offseason link instead of My Team and the League, Cards,
  Play and About menus, and the phone tab bar shows Home, Offseason, Schedule,
  Packs and Your card. The league navigation is untouched underneath and comes
  back as soon as the event is marked complete.
- The draft setup page (`/admin/{draftId}`) checks whether the draft is an
  offseason week's auction and, if so, hides the league point values in the
  pool table. Those values match players by name, so an offseason player who
  shares a name with a league player would otherwise show that player's points.

## Access

- Anyone can read the event.
- Signed-in players can sign up, edit their own entry, and withdraw while sign-ups are open (`offseason_sign_up`, `offseason_withdraw`).
- Once they have a role, signed-in players lock it in (`offseason_lock_in`). A staff-added player claims their row by Riot ID in the same step, even after sign-ups close.
- Anyone signed in, premium or not, opens offseason packs (`offseason_open_pack`) and sees only their own copies. Staff publish the card sets (`offseason_publish_card_set`).
- A player in the event signs their own card (`offseason_sign_card`). A player with no account yet claims their row by Riot ID in the same step, like lock-in. Signatures are public.
- Staff nominate each week's MVP candidates (`offseason_set_mvp_nominees`). Anyone signed in votes for one of the open week's nominees (`offseason_vote_mvp`), never for their own entry. Votes are private; everyone reads the totals through `offseason_mvp_results`, and only once a week's voting closes.
- A match's tournament codes are private to the players on its two teams, through the account their entry is linked to, and to staff (`offseason_match_codes`). Staff add and remove codes (`offseason_add_match_codes`, `offseason_remove_match_code`).
- Admins and owners do everything else, from `/offseason/admin`. The page only
  hides controls. The RLS policies and the staff check in each RPC are what enforce access.
- The ingest writes with the service role only, through `offseason_record_ingest`.
- Ingest now starts the ingest workflow with `GITHUB_ACTIONS_TOKEN`, which stays on the
  server. Its server actions check `offseason_is_staff` themselves, since GitHub, not the
  database, takes the call.

## Releasing it

The code depends on the migration. Apply the migration to the linked database
before releasing (see [releases.md](releases.md)):

```sh
node scripts/supabase-migrations.mjs push --dry-run
node scripts/supabase-migrations.mjs push
```

The ingest workflow reads `RIOT_API_KEY`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` from the repository's `Production` environment,
the same secrets the league ingest uses.

The admin's **Ingest now** button starts that workflow. It needs
`GITHUB_ACTIONS_TOKEN` in the site's Vercel environment: a fine-grained GitHub
token for `SundayKoi/FPL_website` with **Actions: Read and write**, and nothing
else. Without it the button says so and links to the workflow instead.

## Running the event

### Sign-ups

1. Open `/offseason/admin` and create the event. Sign-ups start open.
2. Share `/offseason/signup`. Players sign in with Discord and enter their
   name, Riot ID, rank, primary role and an optional secondary role. It is one
   pool for every rank, Premier and Academy alike.
3. Staff can add a player who has no account ("Add player"). If that player
   signs up later with the same Riot ID, they take over the row and keep their
   place in line. **Captains need an account**, because the draft room seats a
   captain by their account.

### Roles

Close sign-ups under Event, then click **Auto-assign roles** under Players. The
plan works out how many full teams the pool supports and fills roles first
come, first served:

- earlier sign-ups keep their primary role;
- a later player whose primary role is full moves to their secondary role if that role is short, and an
  earlier player may move to their secondary role to make room;
- a role with more players than teams sits its latest sign-ups out. For example, seven tops for four teams means three tops sit out.

Review the plan, change any row, then click **Save roles**. Withdraw or reinstate
players from the same table.

### Lock-in

Once roles are saved, players confirm they are playing and accept their role.
Share `/offseason`: a player with a role sees **Lock in as {role}**, and a
player sitting out is told so. Players who are unhappy with their role, or
can't play, are told to message staff instead of locking in.

- A player staff added by hand enters the Riot ID they gave to find their spot.
  Locking in links the row to their account, so they can also captain.
  This works after sign-ups close.
- A lock-in names the role it accepted. If you save a different role for that
  player, the old lock-in stops counting and they are asked to lock in again.
- The Players table shows "Locked in", "Not yet", or "Was {role}" after a
  role change, and a count of locked-in players out of those playing. **Mark**
  records a lock-in for a player who confirmed in Discord; **Clear** removes it.

Lock-in is a checklist for staff, not a gate. Nothing stops a player who has
not locked in from being drafted. Before opening week 1, bench or replace
players who never locked in.

A Riot ID is not proof of identity. Anyone signed in can claim an unlinked row
by typing its Riot ID, the same as signing up with it. If someone claims the
wrong row, clear `profile_id` on it in the database.

### Each week

Under Weeks, click **Open week N**. Then set its **Times (Eastern)**: when the
week drafts and when its games are played. Either may be left empty, and the
draft can't be after the games. The times show on `/offseason`, on
`/offseason/schedule` and in the homepage banner. The draft time is also the
start time of the week's auctions (`drafts.starts_at`), so the draft directory
and draft room count down to it. Changing it later moves auctions already
created (`offseason_set_week_times`). The week then goes:

1. **Tiers and captains.** From week 3, click **Propose tiers and captains**. The
   4 lowest-rated players in each role form the elimination tier: 4 teams each
   week. Everyone else plays the main tier. Only players who have an account
   are proposed as captains:
   - main tier: its highest-rated players overall;
   - elimination tier: the highest-rated player of each of its roles, so no
     two captains share a role. Four teams need four of the five role leaders,
     so the lowest rated of them is passed over. **Suggest best per role**
     re-picks them the same way.

   Tick or untick players, or change "Bottom per role", to adjust. The button
   is off before week 3, when there is no elimination tier.
2. **Captains before week 3.** Pick one per team. **Suggest top rated** picks the
   highest-rated players who have an account. In week 1 nobody has a rating
   yet, so pick them by hand.
3. **Lock tiers.** The plan shows team counts, who sits out because a role is over-full
   (latest sign-ups first), and any problem that blocks locking.
4. **Create drafts.** Set the budget, bid timer and a **cost for each
   captain**, then create the main draft, and the elimination draft if there is
   one. **Use … for all** copies the first captain's cost to the rest. This
   fixes the week's tiers. Each captain is bought for their own cost before the
   auction, so their team starts with the budget less it. Every cost is at least
   1 and leaves 1 point for each of the other four roles. Offseason drafts have
   no round minimums: every nomination can open at 1. The draft lists every
   player, and names each team after its captain, by in-game name (the part of
   the Riot ID before the #), never the sign-up display name.
5. **Run the auction** from "Draft admin" (`/admin/{draftId}`) as usual.
   Captains bid in the draft room (`/draft/{draftId}`).
6. **Import teams** once every team has all five roles. Importing a tier
   schedules its matches straight away:
   - main tier: a Bo1 round robin, at most three games per team;
   - elimination tier: Bo5 pairings, first against second and third against
     fourth (an odd number of teams plays a full round robin);
   - from week 3, a week with only two main teams and no elimination tier is the
     final: one Bo5.
7. **Schedule.** Every match gets random sides: the first team listed plays blue.
   `/offseason/schedule` shows each week's matchups lane by lane. If importing
   could not schedule a tier, use "Generate". Use "Add match" for anything else.
   New matches take their tournament codes from the pool straight away (see
   [Tournament codes](#tournament-codes)).
8. **Results.** Enter each game's Riot match ID, such as `NA1_5012345678`, and
   the winner if known. Then press **Ingest now** under the latest week's
   results. It runs **Ingest offseason games** on GitHub for every pending game,
   follows the run, and reloads the page when it is done. You can also run the
   workflow from GitHub Actions: leave it blank to ingest everything pending, or
   give one game's ID. The ingest fills in winners it can tell apart and records
   any error on the game, and a failed game fails the run.
9. **Eliminate.** Once every elimination match has a winner, the week lists
   the losing elimination teams and offers to eliminate them. This marks their players
   out, with the week number. **Restore** undoes it.
10. **Complete week.** Its games keep counting toward ratings.

### Tournament codes

Paste Riot tournament codes, one per line, under **Tournament codes** in the
admin. Every game on the schedule takes the next code, in schedule order:
weeks in order, then each week's matches, then game by game. Codes nothing
needs yet wait in the event's pool, oldest first, and matches scheduled later
take theirs from it as soon as they are made. The panel says how many games
still need a code and how many are waiting. Each game's code also shows under
its row in Results, with **Remove** for a code that doesn't work; that game
then takes the next code waiting.

- **Series.** Every game of a Bo3 or Bo5 gets a code up front. Once the match
  is decided, the codes of the games it didn't play go back to the pool, so a
  3-0 doesn't waste two. A game with a result keeps its code.
- **Who sees them.** Players see their team's matches this week, with a code
  and a copy button for each game, under **Your matches** on `/offseason`. Only
  the players on a match's two teams can read its codes, through the account
  their entry is linked to, so a player who hasn't claimed their entry sees
  nothing until they do. Nobody else, signed in or not, reads them.
- **Complete weeks** take no new codes, and neither does a complete event.
  Deleting a match puts its codes back in the pool.

### The last weeks and the final

With eight teams' worth of players, weeks 1 and 2 are all main tier. From week
3, four teams play the elimination tier each week and its two losing teams
are out. When only four teams' worth of players is left, **Propose tiers and
captains** puts everyone in the elimination tier. That week has no main draft:
lock it, draft the elimination tier, and importing it starts the week.

The two teams that survive play the final the next week. Open the week, pick
two captains with **Suggest top rated**, lock, draft and import. The import
schedules one Bo5 final. Its winner is shown as champion on `/offseason`. Set
the event's stage to Finals and then Complete as you go. For a final with three
or four teams, add semifinals and the final with "Add match". Prizes are
handled outside the site.

## Packs

`/offseason/packs` sells packs of the tournament's own cards. They're separate
from the league's packs.

- **Sets.** Completing a week publishes that week's set: every player with a
  rated game, as their card stands (cumulative, like their Overall), labelled
  season "Offseason". **Publish cards** on a playing or complete week
  republishes it, replacing that week's set, e.g. after a late ingest. Packs
  always open from the newest set of the current event. The site builds the
  cards with the card engine (`buildCardSet`); `offseason_publish_card_set`
  only checks and stores them.
- **Allowance.** Everyone signed in gets $2,000 a week, counted from Monday
  00:00 Eastern. Unspent dollars don't carry over, and they have nothing to do
  with the league's wallet. A pack is $100, so 20 a week.
- **Packs.** Five different players from the set. Each card rolls foil (one
  finish, 1 in 10), shiny (1 in 20) and signed (1 in 20). Signed uses the
  player's offseason signature (see [Signing cards](#signing-cards)), or
  their league autograph from `card_art_prefs` if they haven't signed yet
  (`_offseason_ink`). Only players with one can come out signed, and a signed
  card is always foil.
- **Safety.** `offseason_open_pack` does the whole purchase in one transaction:
  allowance check, charge, draw and copies. It holds a per-member lock and is
  keyed by a request id the page keeps across retries, so a lost answer
  returns the same pack rather than buying another.
- **Copies.** They live in `offseason_card_copies`, not `card_inventory`, so
  they never reach the league's packs, market, dust, sets, lineups or
  expeditions. The page shows each member's latest 60.

## Signing cards

`/offseason/card` ("Your card") lets every player in the event claim their
card and sign it. Their signature shows on their card on their player page and
on the signed copies people pull from packs. They can sign before their first
game and re-sign any time until the event is complete; a new signature replaces
the old one, but copies already pulled keep the ink they came with.

A player who signed up on the site already owns their row. A player staff
added by hand enters their Riot ID to find their row, and signing links it to
their account (`offseason_sign_card`, the same claim lock-in makes).
Signatures live in `offseason_signatures`, one per entrant, as the same
transparent PNG the league's signature pad draws.

## MVP votes

Every week staff nominate two to five players (three is the usual) and anyone
signed in votes for one of them as the week's MVP, on the overview page.

- **Nominees.** In the admin, each drafted week has an **MVP nominees** panel.
  Tick players from that week's teams, main or elimination tier. Each one shows
  their Overall for the week and how many games they played. **Suggest top 3**
  ticks the three best by that Overall. Voters see the nominees in the order you
  ticked them. Save before or after the week is complete. Until there are
  nominees, the overview says they're coming and nobody can vote. Changing the
  nominees drops the votes of anyone you take off, and those voters vote again
  (`offseason_set_mvp_nominees`,
  `20261118000001_offseason_mvp_nominees.sql`).
- **The ballot.** The nominees stand side by side, one column each, with their
  week:
  - Overall;
  - record;
  - kills, deaths and assists per game;
  - KDA;
  - CS, damage and vision per minute;
  - the champions they played.

  A sub's games count for the player they replaced (see Subs under
  Ratings). Nobody can vote for their own entry. A player who hasn't linked
  their entry to their account can't be told apart from a fan, so they should
  claim it.
- **When.** Voting on a week opens when staff mark it **Complete**, not while
  its games are being played (the overview says voting opens once the week is
  complete). It closes when the next week reaches **Playing**, or when the
  event is complete, so mark the last week complete before the event.
  Only one week is open at a time. Members can change their vote while it's
  open (`_offseason_mvp_open_week`, `20261115000001_offseason_mvp_after_week.sql`).
- **Results.** While voting is open the page shows only how many have voted.
  Once it closes, the **MVPs** panel names the winner of each week, with ties
  shared.

## Stats

`/offseason/stats` lays out every player's numbers from their ingested
games, for the whole event or one week (`?week=N`). A sub's games count for
the player they replaced (`src/lib/offseason/stats.ts`).

- **Leaders.** The top three for KDA, damage, CS and vision per minute.
  Over the whole event a player needs two games to qualify.
- **Players.** One table, sortable by any column, with a role filter. It
  shows:
  - games, record and Overall;
  - kills, deaths and assists per game, and KDA;
  - kill participation;
  - CS, damage and vision per minute;
  - most-played champions.

  For a single week it also shows that week's team. The record and Overall
  follow the choice: the season record and the cumulative Overall for the
  whole event, or that week's.
- **Best games.** The five biggest single games by kills and by KDA, with
  who really played them when it was a sub.

## Ratings

The Overall rating comes from the league's own card engine
(`buildSeasonCards`). Every ingested game of the event so far is rated as one
cohort against the event's yardstick season, S6 by default. The rating is
cumulative. Player pages also show each week rated on its own. A player has no
rating until they have an ingested game, and a player with no rating is never
proposed for the elimination tier automatically.

**Records.** Every player has a record for the whole event. It shows on
their player page, even before they have a rating, and in the leaderboards.
Each decided game their team played counts as a win or a loss for everyone on
that week's roster, whether the winner came from the ingest or from staff, and a
sub's games count for the player they replaced
(`playerRecords`, `src/lib/offseason/standings.ts`). Wherever players are
ranked by Overall, a tie goes to the better record: more wins, then fewer
losses, then the earlier sign-up. That covers the leaderboards, the captain
suggestions and who is proposed for the elimination tier.

**Subs.** A game's stats name whoever was in it. Anyone on neither team's
roster for that game, another entrant included, is a sub. A sub's row counts
for the rostered player missing from that game:
- the one in the same role, by Riot's position;
- or the only player missing, if Riot reported no role.

That player's stats, Overall, weekly trend and card all include the game.
Their player page marks the game "(sub: Name#TAG)", and the game's row in
admin Results names the sub. Nothing is stored: it's worked out from the
rosters every time the page loads (`attributeSubs`,
`src/lib/offseason/subs.ts`). Fixing a roster or ingesting late re-credits
the game on its own. If two subs on one team have no role from Riot, they
can't be told apart and their games count for nobody.

## Removing it

1. Optional: delete the `Offseason W…` drafts from the admin draft list if you
   don't want them kept. The offseason tables are fine with this.
2. Add a forward migration, with a pgTAP test asserting the tables are gone:

   ```sql
   drop table if exists
     public.offseason_match_codes, public.offseason_mvp_nominees,
     public.offseason_mvp_votes, public.offseason_signatures,
     public.offseason_card_copies, public.offseason_pack_openings, public.offseason_cards,
     public.offseason_card_sets,
     public.offseason_stats, public.offseason_games, public.offseason_matches,
     public.offseason_team_members, public.offseason_teams, public.offseason_draft_links,
     public.offseason_week_entries, public.offseason_weeks, public.offseason_entrants,
     public.offseason_events
     cascade;
   drop function if exists
     public.offseason_sign_up(uuid, text, text, text, text, public.lol_role, public.lol_role),
     public.offseason_withdraw(uuid),
     public.offseason_lock_in(uuid, public.lol_role, text),
     public.offseason_apply_roles(uuid, jsonb),
     public.offseason_set_week_entries(uuid, jsonb),
     public.offseason_create_week_draft(uuid, text, int, int, int[], int, jsonb),
     public._offseason_ign(text),
     public.offseason_add_match_codes(uuid, text[]),
     public.offseason_remove_match_code(uuid),
     public._offseason_fill_match_codes(uuid),
     public._offseason_match_codes_on_schedule(),
     public.offseason_import_week_draft(uuid, text),
     public.offseason_set_week_times(uuid, timestamptz, timestamptz),
     public.offseason_publish_card_set(uuid, int, jsonb),
     public.offseason_open_pack(uuid),
     public._offseason_ink(uuid, jsonb),
     public.offseason_sign_card(uuid, text, text),
     public.offseason_vote_mvp(uuid, uuid),
     public.offseason_set_mvp_nominees(uuid, uuid[]),
     public.offseason_mvp_results(uuid),
     public._offseason_mvp_open_week(uuid),
     public.offseason_pack_wallet(),
     public._offseason_pack_result(uuid),
     public._offseason_allowance_week(),
     public.offseason_set_game(uuid, int, text, uuid),
     public.offseason_record_ingest(uuid, text, uuid),
     public.offseason_set_team_eliminated(uuid, boolean),
     public._offseason_refresh_match_winner(uuid),
     public._offseason_require_staff(),
     public.offseason_is_staff();
   ```

   Never edit or delete the original migrations. Delete
   `supabase/tests/0138_offseason_tournament_test.sql` and
   `supabase/tests/0139_offseason_lock_in_test.sql`,
   `supabase/tests/0140_offseason_elimination_only_week_test.sql`,
   `supabase/tests/0141_offseason_captain_cost_test.sql`,
   `supabase/tests/0142_offseason_week_times_test.sql`,
   `supabase/tests/0143_offseason_packs_test.sql`,
   `supabase/tests/0144_offseason_card_signing_test.sql`,
   `supabase/tests/0145_offseason_mvp_votes_test.sql`,
   `supabase/tests/0146_offseason_captain_costs_test.sql`,
   `supabase/tests/0147_offseason_draft_igns_test.sql`,
   `supabase/tests/0148_offseason_match_codes_test.sql` and
   `supabase/tests/0149_offseason_mvp_nominees_test.sql` in the same change.
   Dropping the tables also removes everyone's offseason card copies; export
   `offseason_card_copies` first if you want to keep a record.
3. Remove the homepage banner: `OffseasonHomeBanner` and
   `fetchHomeOffseasonEvent` in `src/components/home/PreseasonHomePage.tsx`,
   `RegularSeasonHomePage.tsx` and `AcademyHomePage.tsx`, the
   `offseasonEvent` prop in `HomeDashboard.tsx`, and its case in
   `RegularSeasonHomePage.test.tsx`. Remove `fetchOffseasonRunning` and the
   `offseasonOnly` prop from `src/app/layout.tsx`, `SiteNavigation.tsx` and
   `MobileTabBar.tsx` (with their offseason test cases). Remove the `offseason_weeks` read and the
   `leaguePoints` prop it sets in `src/app/admin/[draftId]/page.tsx`. Then delete `src/app/offseason/`, `src/components/offseason/`,
   `src/lib/offseason/`, `scripts/offseason_ingest.py`,
   `scripts/test_offseason_ingest.py`, `.github/workflows/offseason-ingest.yml`
   and this file.
4. Run `npm run typecheck`, `npm test`, `npm run test:python` and the pgTAP
   suite, then push the drop migration before releasing.

## Caveats

- `offseason_stats` copies `raw_stats` as it was when the migration ran. If
  `raw_stats` later gains a column the extractor writes, add the same column
  to `offseason_stats` in a forward migration, or the offseason ingest fails.
- Changing a game's match ID resets that game's ingest. Rows ingested under
  the old ID stay in `offseason_stats` but no longer count, because ratings
  only read the event's current match IDs.
