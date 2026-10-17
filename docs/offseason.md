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
| Tables, RLS, RPCs | `supabase/migrations/20261107000001_offseason_tournament.sql` (all `offseason_*`), `20261108000001_offseason_lock_in.sql`, `20261109000001_offseason_elimination_only_week.sql`, `20261110000001_offseason_captain_cost.sql` |
| pgTAP | `supabase/tests/0138_offseason_tournament_test.sql`, `0139_offseason_lock_in_test.sql`, `0140_offseason_elimination_only_week_test.sql`, `0141_offseason_captain_cost_test.sql` |
| Logic, reads, server actions | `src/lib/offseason/` |
| Pages | `src/app/offseason/` (`/offseason`, `/offseason/schedule`, `/offseason/signup`, `/offseason/players/[id]`, `/offseason/admin`) |
| Components | `src/components/offseason/` |
| Stats ingest | `scripts/offseason_ingest.py`, `scripts/test_offseason_ingest.py`, `.github/workflows/offseason-ingest.yml` |

It touches the rest of the site in two ways:

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
  weeks are played. It hides itself when the event is complete or the read
  fails.

## Access

- Anyone can read the event.
- Signed-in players can sign up, edit their own entry, and withdraw while sign-ups are open (`offseason_sign_up`, `offseason_withdraw`).
- Once they have a role, signed-in players lock it in (`offseason_lock_in`). A staff-added player claims their row by Riot ID in the same step, even after sign-ups close.
- Admins and owners do everything else, from `/offseason/admin`. The page only
  hides controls. The RLS policies and the staff check in each RPC are what enforce access.
- The ingest writes with the service role only, through `offseason_record_ingest`.

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

Under Weeks, click **Open week N**. Then:

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
4. **Create drafts.** Set the budget, bid timer and **captain cost**, then create
   the main draft, and the elimination draft if there is one. This fixes the
   week's tiers. Each captain is bought for the captain cost before the auction,
   so their team starts with the budget less it. The cost is at least 1 and leaves
   1 point for each of the other four roles. Offseason drafts have no round
   minimums: every nomination can open at 1.
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
8. **Results.** Enter each game's Riot match ID, such as `NA1_5012345678`, and
   the winner if known. Then run **Ingest offseason games** from GitHub Actions →
   workflows. It is manual only: leave it blank to ingest everything pending, or give
   one game's ID. The ingest fills in winners it can tell apart and records
   any error on the game. Ratings update on the next page load.
9. **Eliminate.** Once every elimination match has a winner, the week lists
   the losing elimination teams and offers to eliminate them. This marks their players
   out, with the week number. **Restore** undoes it.
10. **Complete week.** Its games keep counting toward ratings.

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

## Ratings

The Overall rating comes from the league's own card engine
(`buildSeasonCards`). Every ingested game of the event so far is rated as one
cohort against the event's yardstick season, S6 by default. The rating is
cumulative. Player pages also show each week rated on its own. A player has no
rating until they have an ingested game, and a player with no rating is never
proposed for the elimination tier automatically.

## Removing it

1. Optional: delete the `Offseason W…` drafts from the admin draft list if you
   don't want them kept. The offseason tables are fine with this.
2. Add a forward migration, with a pgTAP test asserting the tables are gone:

   ```sql
   drop table if exists
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
     public.offseason_create_week_draft(uuid, text, int, int, int[], int),
     public.offseason_import_week_draft(uuid, text),
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
   `supabase/tests/0140_offseason_elimination_only_week_test.sql` and
   `supabase/tests/0141_offseason_captain_cost_test.sql` in the same change.
3. Remove the homepage banner: `OffseasonHomeBanner` and
   `fetchHomeOffseasonEvent` in `src/components/home/PreseasonHomePage.tsx`,
   `RegularSeasonHomePage.tsx` and `AcademyHomePage.tsx`, the
   `offseasonEvent` prop in `HomeDashboard.tsx`, and its case in
   `RegularSeasonHomePage.test.tsx`. Then delete `src/app/offseason/`, `src/components/offseason/`,
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
