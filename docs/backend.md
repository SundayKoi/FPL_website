# Backend architecture

This document is the short architectural map for agents working on the FPL
League Platform. It describes the infrastructure that exists in this repo;
the migrations and source code are the final authority when this document and
the implementation disagree.

## System shape

There is no separate application server. The deployed system is a Next.js App
Router application backed by Supabase:

```text
Browser
  ├─ Next.js pages, Server Components, Server Actions, and API routes
  └─ Supabase browser client ── Auth / Postgres Data API / Realtime

Supabase
  ├─ Auth (Discord OAuth and local email/password)
  ├─ Postgres (tables, views, RLS, grants, triggers, and RPCs)
  ├─ Realtime (draft, chat, and match-draft state)
  └─ Deno Edge Function (betting Discord announcements/watchdog)

GitHub Actions and local scripts
  ├─ Riot match-stat ingestion
  ├─ weekly homepage briefs
  └─ weekly player-card snapshots and Discord post
```

External services are Discord (OAuth, guild-role checks, interactions, and
webhooks), Riot (match data), Twitch (live-channel status), Anthropic (weekly
brief prose), Vercel (hosting), and Supabase Cloud (production data).

## Request and data boundaries

### Supabase clients

- `src/lib/supabase/client.ts` creates the browser client with the public
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Use it in
  Client Components for public reads, authenticated browser reads, Realtime,
  and ordinary user-scoped RPCs. RLS still applies.
- `src/lib/supabase/server.ts` creates the cookie-bound server client with the
  same public key pair. Use it in Server Components, server-side queries, and
  Server Actions when the current Supabase Auth session should be visible.
- My Team, roster identity claims, the identity approval inbox, and admin
  player linking all use those browser or cookie-bound server clients. They do
  not import a service-role client: the current session and RLS determine the
  rows that can be read or changed.
- `src/lib/betting/service-client.ts` creates a `service_role` client and is
  marked `server-only`. It bypasses RLS and must never be imported by a Client
  Component or sent to the browser.
- Scripts use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when they need
  trusted automation access. `SUPABASE_URL` is deliberately distinct from the
  browser-facing `NEXT_PUBLIC_SUPABASE_URL` even when both point at the same
  project.

### Next.js boundaries

- Route pages live under `src/app/**/page.tsx`; most page-level reads happen
  directly through the server Supabase client.
- Server Actions currently include `src/lib/betting/actions.ts`,
  `src/lib/betting/admin-actions.ts`, `src/lib/auth/actions.ts`, and
  `src/lib/match-draft/lobbyActions.ts`.
- API routes are narrow integration boundaries:
  - `src/app/auth/callback/route.ts` exchanges the Supabase OAuth code and
    redirects to a safe path on the canonical site origin.
  - `src/app/api/discord/interactions/route.ts` verifies Discord Ed25519
    signatures and replay timestamps, then dispatches commands, buttons, and
    modals through `src/lib/betting/discord/`.
  - `src/app/api/betting/share/[id]/open/route.tsx` and `result/route.tsx`
    render Discord share cards with `next/og`.
  - `src/app/card/[slug]/card.png/route.tsx` renders player-card images.
- The Discord interactions route explicitly uses the Node runtime because
  signature verification relies on WebCrypto behavior in that environment.

Keep integration-specific authorization at the boundary that owns it, then
let the database enforce the final state transition. Do not add a new general
API layer just to proxy a Supabase query.

### Navigation and route boundaries

The site presents Premier/FPL and Academy as paired league experiences. The
header's `LeagueBrandChooser` is the single league-switching control: it maps
the current supported route (and its query string) to the corresponding
Premier or Academy path, while an unrelated shared route falls back to the
target league home. Page-level league toggles are intentionally absent.

`SiteNavigation` renders five direct links for the active league—Players,
Teams, Schedule, Stats, and My Team—and groups active-league destinations plus
Auction Draft under League, with shared destinations under Premium and Info.
Match Drafter is grouped under Premium. Admin and Broadcaster are Staff entries
within Info, conditionally rendered from the server-provided staff tier. Those props do
not authorize access: `/admin` and `/broadcaster` continue to perform their
existing server-side gates, and the route checks remain authoritative if a
link is hidden or manually visited.

## Authentication and authorization

Supabase Auth owns the session. Discord is the production sign-in provider;
the local login page additionally exposes password sign-in so seeded test and
demo users can be used without Discord.

Authorization has several independent dimensions:

- `profiles.is_admin`, `profiles.is_owner`, and `profiles.is_broadcaster`
  provide site staff tiers. The private `/broadcaster` server route allows
  owners or broadcasters; admin status alone does not grant access. The route
  uses the signed-in server Supabase client and existing authenticated reads,
  while owners inherit broadcaster workspace access in the application gate.
- `league_team_captains` maps a profile to a league team and season.
- `player_identity_links` maps one canonical `player_pool` row to one signed-in
  `profiles` row for a league season. An approved link whose stored team is in
  the active featured-league team set is the normal-player capability for
  private My Team data; it does not replace a captain assignment. Links are
  stable foreign-key records, not Discord, Riot, or display-name matches.
- Database helper functions such as `is_admin()`, `is_owner()`,
  `is_captain()`, and `is_captain_of(...)` are used by policies and RPCs.
- Identity helpers keep public and private paths separate:
  `player_identity_state(...)` returns only `unclaimed`, `pending`, or
  `claimed` for public roster presentation; `is_player_rostered_on_team(...)`
  proves the exact canonical player/team/league/season roster relationship;
  and `is_approved_team_member(...)` checks the caller’s approved link. These
  security-definer helpers use a fixed search path and narrow execute grants.
- RLS is the authority for identity links. Authenticated users may create and
  withdraw only their own pending, team-sourced claims; captains may inspect
  and decide current-roster claims for their exact team and season; admins can
  assign, replace, approve, or revoke links. Broadcaster status alone grants
  no identity permission. The decision trigger limits a non-admin captain to
  the pending-to-approved transition and stamps that captain as the decider.
- `match_codes` remains private by RLS: a caller must be an admin, a captain
  of a fixture team, or have an approved identity link stored for either
  fixture team. A signed-in role, navigation visibility, or a spectator draft
  URL alone never grants tournament-code or draft-mutation access.
- Betting access checks Discord guild membership and roles in
  `src/lib/betting/access.ts`; staff and owner checks are separate from normal
  member access.
- Public token drafts use the token as their capability and keep lobby reads
  and mutations scoped to the lobby/game in the corresponding RPCs.
- Public open-lobby creation is intentionally different from lobby usage:
  `src/lib/match-draft/lobbyActions.ts` checks the premium Discord gate and
  calls the service-role RPC, while the database revokes direct public access
  to `create_open_draft_lobby`.

Presentation helpers such as `fetchStaffTier()` are not security boundaries.
When changing permissions, update the RLS policy, grant/revoke, or RPC check
that actually protects the data and add a database test where appropriate.

## Database organization

The schema is organized by feature, but all domains share the same Supabase
Postgres database and public schema:

| Domain | Main tables/views | Backend behavior |
| --- | --- | --- |
| League and identity | `profiles`, `league_settings`, `league_teams`, `teams`, `riot_accounts`, `roster_memberships`, `league_team_captains`, `player_identity_links`, `fixtures` | Season, tier, roster, canonical player/profile identity, captain, team, and schedule configuration. |
| Auction draft | `drafts`, `players`, `lots`, `bids` | Nomination, bidding, countdown settlement, admin overrides, roster assignment, chat, and Nemesis picks are protected by RPCs and RLS. |
| Canonical players and free agency | `player_pool`, `free_agency_avg_bids`, `signups`, `info_resources` | Cross-draft player metadata, free-agency data, signups, and editable information resources. |
| Match reporting and stats | `match_reports`, `match_report_games`, `match_codes`, `raw_stats`, `stats_*` views | Captains report series; the Riot ingester writes raw rows; views provide player, team, champion, record, and game-log aggregates. |
| Betting | `betting_profiles`, `betting_teams`, `betting_events`, `betting_markets`, `betting_bets`, `betting_ledger`, pick'em/store/season tables | Service-role RPCs handle wallet, bet, lock, resolve, cancel, and audit transitions after app-layer Discord/staff checks. Schedule-linked events identify the reusable Premier/Academy season catalog entries; generated markets retain `fixture_id` for idempotent retries. |
| Banger Board | `banger_posts`, `banger_votes`, `daily_banger_checks`, `daily_banger_votes` | Public tweet reads and aggregate ratings use definer RPCs; server actions derive the signed-in Discord wallet and call service-role vote/reward RPCs. Daily rewards are atomically ledgered and limited by `(UTC date, voter)`; `daily_banger_votes.reward_amount` records the amount actually paid. |
| Banger Board settings | `banger_board_settings` | Public title reads; authenticated admin/owner-only updates enforced by RLS using `is_admin()` / `is_owner()`. |
| Fixture match drafts | `match_drafts`, `match_draft_settings` | Captains draft champions for scheduled fixtures; actions, ready checks, side choice, change requests, winners, and role positions are database-backed. |
| Public match-draft lobbies | `open_draft_lobbies`, `open_drafts` | Token-scoped champion drafts for external/public links, with a premium-gated creation path. |
| Player cards | `card_art_prefs`, `card_snapshots`, `card_rating_history` | User/admin art and motto preferences plus service-written weekly rating baselines/history. |
| FPL'dle | `fpldle_daily_candidates`, `fpldle_daily_puzzles`, `fpldle_daily_progress` | Public candidate labels come from the latest frozen `card_editions` week; service-role RPCs lazily snapshot and select one stable answer per UTC date and league, record each signed-in wallet's guesses, and credit one 200 betting-dollar base completion reward within five guesses (300 for an active patron). `reward_amount` records the actual completion payout. Answer and progress rows have no `anon`/`authenticated` read grant. |
| Weekly Draw | `weekly_draws` | One row per season and week records the `card_inventory` copy drawn that week, its owner, the frozen card json, and the pot. Anyone may read it for the draw history page; only the service-role `run_weekly_draw` writes it. |
| Card expeditions | `expedition_runs` | One row per squad sent out: the three `card_inventory` copies, the tier, the squad's shine, when it resolves, and the rolled outcome once it is claimed. Owners read their own runs; every write goes through `launch_expedition`/`claim_expedition`. A `card_inventory` trigger keeps a deployed copy from leaving the collection. |
| Homepage and announcements | `homepage_briefs`, `homepage_featured_settings`, `announcements`, `draft_chat` | Curated or generated homepage copy, featured matchups, operational announcements, and draft chat. |
| Broadcaster workspace | `homepage_featured_settings`, `fixtures`, `roster_memberships`, `match_drafts`, `raw_stats`, `stats_*` views | Read-only server composition of each league's featured fixture, rosters, match drafts, and in-house stats for owner/broadcaster commentary preparation. |

The exact schema is the ordered SQL in `supabase/migrations/`. Migrations are
append-only: add a new migration for a schema, policy, grant, view, trigger,
or RPC change instead of editing an already-applied migration. Put the
corresponding contract/authorization coverage in `supabase/tests/`.

Important RPC families include:

- Auction: `nominate`, `place_bid`, `close_lot`, `start_draft`,
  `pause_draft`, `resume_draft`, `cancel_lot`, `force_close_lot`, and admin
  assignment/undo functions.
- Stats/reporting: report and side-resolution functions plus the
  `stats_player_agg`, `stats_team_agg`, `stats_champion_agg`, `stats_records`,
  and `stats_game_log` views.
- Betting: `place_bet`, `cashout_bet`, lifecycle/lock functions, and the
  admin create/resolve/cancel/grant functions.
- Recurring rewards: `calculate_recurring_reward` is the shared database
  calculator used by `claim_daily_streak`, `claim_weekly_streak`,
  `vote_daily_banger`, `record_fpldle_guess`, and `pay_match_win`. The wallet
  is locked before `patron_until > now()` is checked. Only the base is
  multiplied: `base * 1.5 + step * (streak - 1)` for an active patron,
  otherwise `base + step * (streak - 1)`. Callers cannot request a patron
  amount; each payout records the calculated amount in its ledger and claim,
  progress, vote, or payout row. Existing payouts are never backfilled.
- FPL'dle: `ensure_fpldle_daily_puzzle` creates one stable puzzle per UTC date
  and league; `record_fpldle_guess` enforces the five-guess progress limit and
  atomically credits the one-time completion reward. A correct replay returns
  the stored `reward_amount` without writing another ledger row.
- Match drafts: `apply_match_draft_action`, `set_match_draft_ready`,
  `choose_match_draft_blue`, change/undo/reset functions, and their
  `open_draft_*` token equivalents.
- Player identity: `player_identity_state` is the neutral public roster-state
  read; `approve_card_claim` approves a card claim and, only when its canonical
  player and Riot roster mapping resolve to exactly one compatible team,
  synchronizes the approved identity in the same transaction.
- Weekly Draw: `run_weekly_draw` picks one `card_inventory` copy per season
  and week uniformly at random — every copy is one ticket — stamps the copy,
  records it in `weekly_draws`, pays the pot through `betting_ledger`, and
  comps a standard pack. It is idempotent: a second call for the same season
  and week returns the recorded winner and changes nothing.
- Roster sets: `claim_team_set` pays the flat `TEAM_SET_BONUS` for holding
  every one of a team's five from a single edition week. Two uniqueness
  rules, deliberately separate — `card_set_claims` is unique per (collector,
  season, week, team) so nobody claims the same set twice, and
  `card_set_claim_copies` is primary-keyed on the COPY so the same five
  cards cannot be traded round a group and paid for each of them in turn.
  Burn-first: both inserts land before a dollar is credited. Who the five
  are is roster truth from `src/lib/cards/sets.ts` (built off the same
  `buildTeamCards` the team card prints); Postgres checks ownership, the
  edition week, and the payout range. The browser sends only a week and a
  team — the five copies to spend are recomputed server-side in
  `setClaim.ts`, so a tampered request cannot name cards it does not own.
  Sets are per league: each collection page asks its own league's season,
  so premier and academy shelves have their own sets and their own claims.
- The Gauntlet fields cards from EVERY current shelf, premier and academy
  alike (`fetchAllCardSeasons`), while the run itself is still filed and
  ranked under the premier season. A copy from a past season is refused.
  The bracket scales to the lineup average, so a bigger pool does not make
  the mode easier — the opponents rise with whatever gets picked.
- Gauntlet balance telemetry: `gauntlet_round_log` (one row per resolved
  round: the situation, the call taken, the outcome, the relics it was
  fought with) and `gauntlet_relic_offers` (the three keys offered and the
  one taken). Both are deny-all, service-role, and written off the response
  path with `after()` — a telemetry failure must never fail a fight, so
  every write swallows its error. Both carry `unique (run_id, round)` and
  insert with `ignoreDuplicates`, so the double-click the actions already
  guard with a CAS cannot double-count a call. NOTHING in the engine reads
  these tables: the aggregation (`src/lib/gauntlet/balance.ts`, pure and
  tested) is rendered at `/admin/gauntlet` for a human, who changes a
  number by hand in a commit and says so in the channel. Auto-tuning is
  deliberately not built — a mode that silently nerfs whatever is winning
  is a treadmill the player can never read. The report corrects two
  confounds: performance is LIFT against the per-round baseline (a relic
  taken at round six only ever fights the hardest rounds), and popularity
  is take rate against the times the thing was actually on the table.
- Gauntlet opponents bring a game PLAN (`src/lib/gauntlet/foe.ts`), rolled
  off the same week seed as the rest of the cast and stored on
  `next_opponent`, so the whole league scouts the same brain all week. A
  plan is a reallocation, never a buff: what it adds on one beat it gives
  up on others, priced by `BEAT_VALUE` — the MEASURED win-rate worth of one
  stat point on each beat (the pit is worth five times the base hold, and
  five lane checks are worth less than one Baron), not a count of checks.
  The same rule governs the in-fight reactions: they collapse on your worst
  lane by exactly what they concede to your best, and the behind/ahead
  swing trades objectives against the hold. `plan_key` rides on the round
  log so the balance report can check the pricing against real runs.
- Gauntlet ghosts: last week's runs are this week's bracket
  (`src/lib/gauntlet/ghosts.ts`, fetched in `ghostQueries.ts`). Round N is a
  real run that reached round N, chosen by `weekSeed(week, round)` and
  deduplicated across the eight, so the league shares the cast exactly as
  it shared the generated one. Two rules keep it from becoming a lottery:
  a ghost's five are SHIFTED (never scaled — scaling squashes shape) onto
  `bracketTarget`, so their comp shape is theirs and the level is the
  round's; and `roundRules` draws the wall, the patch and the traits off
  the front of the stream so a ghost round and a generated round play
  under identical rules. Their relics reach the fight through
  `ghostTraitEffects` at `GHOST_RELIC_POTENCY` — only the dials that win
  games, never the ones that score a board — and their recorded crossroads
  call resolves as `ctx.foeCall`. Because a real opponent's shape, build
  and call together outweigh an invented team's traits, `GHOST_TARGET_RELIEF`
  prices a ghost's five slightly lower, the mirror of `BOSS_RATING_BUMP`;
  both constants were solved for against an AI control arm in
  `ghosts.test.ts`, not chosen. Every lookup failure falls through to
  `generateOpponent`, so a fresh season, a quiet week or an unapplied
  migration all still play. `ghost_run_id` on the round log is the defence
  record.
- Card expeditions: `launch_expedition` validates the squad, confirms the
  caller owns all three copies, enforces the tier slot (one unclaimed run
  per tier — `tier already out`) and the per-day launch limit under the
  same wallet lock, and refuses a copy that is already deployed. `claim_expedition`
  writes the app-rolled outcome exactly once — `claimed_at` is the reroll
  lock — pays the dollars through `betting_ledger`, adds the pack comp, and
  replaces the bearer's mark only when the new one outranks the mark it
  already wears. Both are service-role only; the shine, gates, odds, and
  payouts they are handed come from `src/lib/expeditions/config.ts`.

## Player identity and My Team

`player_identity_links` is the season- and league-scoped source of truth for
normal player access. It has unique player/league/season and
profile/league/season keys, so a player or profile cannot be linked twice in
one league season. A link is `pending` or `approved` and records the source
(`admin`, `team`, or `card`), requester, decision, and timestamps. Deleting a
link immediately removes the identity capability. An approved link without a
stored team, or whose stored team is not in the active featured-league team
set, resolves to an unrostered state rather than loading a My Team dashboard.
Self-claims and captain decisions prove the exact current roster relationship,
but the current My Team and match-code read paths do not revalidate that roster
relationship after approval.

There are three supported link lifecycles:

- On a public Premier or Academy team page, an authenticated person can claim
  an unclaimed canonical roster spot for their own profile. Public roster
  cards reveal only neutral claim state. The claimant can withdraw their own
  pending claim; no linked Discord identity is shown there.
- The `/identity-claims` inbox combines roster identity review for captains
  and admins. Captains see and decide only their current team’s claims;
  admins see every pending claim. This UI is a convenience layer over the RLS
  policy and trigger, not an authorization bypass.
- On the league Players pages, an admin can select an already-created
  `profiles` row and immediately assign, replace, or revoke a link. The picker
  displays verified profile context but never persists a free-form Discord
  handle. Separately, an approved card claim may atomically create or approve
  a compatible identity link. Missing or ambiguous mappings remain card-only;
  a conflicting exact mapping rolls back both changes.

The paired canonical dashboards are `/my-team` and `/academy/my-team`, with
scouting at `/my-team/scouting` and `/academy/my-team/scouting`. They resolve
the authenticated profile, active league season, approved identity, active
team, fixture, and private codes through the cookie-bound server client. A
normal player cannot select a different team through a query parameter.
Captains retain access from `league_team_captains` even before identity links
are populated; admins can choose a validated active team. Read-only team data,
spectator draft links, and scouting are composed separately from captain result
reporting and admin management panels, so ordinary-player branches do not load
those mutation controls.

The legacy `/captain`, `/captain/scouting`, `/academy/captain`, and
`/academy/captain/scouting` routes are redirect-only compatibility paths to
their equivalent canonical My Team routes. They preserve an old `team` query
override only after the server verifies that the signed-in caller is an admin
and that the requested team is valid for that league; legacy URLs never render
the old Captain page.

## Realtime behavior

Realtime is a synchronization mechanism, not the authority for a state
transition. The database write/RPC commits first; clients then receive the
change and update their local state.

- `src/hooks/useDraftState.ts` initially fetches the auction rows, subscribes
  to `drafts`, `teams`, `players`, `lots`, and `bids`, and refetches after a
  reconnect. The first client to observe an expired lot may call
  `close_lot`; the RPC is safe to retry and only the database can settle it.
- `src/components/draft/DraftChat.tsx` subscribes to draft-chat inserts and
  deletes.
- `src/components/match-draft/MatchDraftBoard.tsx` combines presence,
  broadcast intent messages, and Postgres changes for fixture and public-lobby
  draft state.
- Realtime tests should assert both the mutation and the other client seeing
  the resulting state. Avoid relying on optimistic UI as proof that a write
  succeeded.

## Scheduled and trusted workflows

| Workflow | Entry point | Writes/side effects |
| --- | --- | --- |
| Nightly match stats | `.github/workflows/ingest-stats.yml` → `scripts/riot_stats_ingest.py --from-reports` | Reads pending reports, fetches Riot matches, writes `raw_stats` with the service key, resolves sides, and marks report games ingested/failed. |
| Weekly Premier brief | `.github/workflows/weekly-brief-premier.yml` → `scripts/generate-homepage-brief.ts --league premier` | Computes facts from Supabase, asks Anthropic for constrained prose, cleans it, and writes `homepage_briefs`. |
| Weekly Academy brief | `.github/workflows/weekly-brief-academy.yml` → same script with `--league academy` | Same flow, narrowed to the Academy season and teams. |
| Weekly cards | `.github/workflows/weekly-card-drop.yml` → `scripts/weekly-card-drop.ts` | Reads current ratings, writes `card_snapshots`/`card_rating_history`, and posts movement/showcase content to Discord. |
| Weekly Draw | `.github/workflows/weekly-draw.yml` → `scripts/weekly-draw.ts` | Runs `run_weekly_draw` for every card season half an hour after the card drop, then posts each winner to Discord. The RPC does the writing (`weekly_draws`, the stamped copy, the ledger pot, the pack comp), so reruns and the `/schedule` admin fallback are safe. |
| Card edition archive | `.github/workflows/archive-card-edition.yml` → `scripts/archive-card-edition.ts` | Manual. Rebuilds one week (or every week, with `all_weeks`) into `card_editions` from that week's `raw_stats`. Run it after any change to the rating formula — see the pitfall below. |
| Betting lifecycle | Supabase cron migrations → `supabase/functions/discord-announcer/index.ts` | Locks/resolves/announces betting markets and pick'ems, posts Discord messages, and runs a ledger-drift watchdog. |
| Weekly betting markets | Supabase Cron (`weekly-betting-markets-edt` / `weekly-betting-markets-est`) → `run_weekly_betting_market_cron()` → `generate_weekly_betting_markets()` | Runs Tuesday at 1:00 AM Eastern (05:00 UTC during EDT, 06:00 UTC during EST), reads the following Monday's Premier and Academy fixtures, validates every event/team mapping, and inserts only missing fixture-linked markets. The wrapper's Eastern-time guard makes the DST jobs safe and retries idempotent. |

The weekly generator resolves fixture team names through the currently featured
Premier/Academy drafts, then maps each draft abbreviation to exactly one
curated non-prop `betting_teams` row. It refuses to create missing events or
teams, refuses to overwrite an already-linked market whose title, teams,
kickoff, lock time, or defaults differ, and rolls back both leagues together
when any validation fails. Operators can inspect `cron.job` and
`cron.job_run_details`, correct the catalog or schedule data, and—using an
authorized service-role context—retry with the original Tuesday 1:00 AM
Eastern anchor by calling `generate_weekly_betting_markets(anchor)`. The
generator never resolves, cancels, or recreates weekly events.

Trusted jobs use service-role credentials because they operate across users or
write tables with no normal-user write policy. Keep their secrets in GitHub
Actions/Vercel/Supabase configuration, not in source or client bundles.

## Agent workflow by task type

1. **UI or page change:** start in the route under `src/app/` and its nearby
   component/domain folder. Follow existing server-vs-client boundaries and
   add the focused Vitest/component test next to the implementation.
2. **Business-rule change:** find the domain module in `src/lib/` and its
   tests. If the rule protects shared state or money, confirm whether the
   authoritative check belongs in a Postgres RPC as well.
3. **Database or permission change:** inspect the latest related migration,
   add a new migration and pgTAP test, then verify grants/RLS for anon,
   authenticated, and service-role callers.
4. **Realtime change:** inspect the subscription and initial-fetch path
   together. Test reconnect/catch-up and the behavior of a second browser.
5. **External or scheduled integration:** update the script/Edge Function,
   its workflow/configuration, the required secret list, and a safe local
   or unit test path.

Before handing off, run the narrow tests first, then `npm run lint`, `npm test`,
`npm run build`, and `npx supabase test db` when the change touches the
database. Run `npm run e2e` for auction, betting, or other multi-browser
flows when Docker/Supabase is available.

## Common pitfalls

- Never use `SUPABASE_SERVICE_ROLE_KEY` in a Client Component or a
  `NEXT_PUBLIC_*` variable.
- Do not treat an `is_admin` value fetched for display as authorization; the
  database policy/RPC must enforce the operation.
- Do not write betting balance/ledger transitions as a sequence of ordinary
  table updates. Use the existing betting RPCs and service-client/auth gates.
- Do not bypass the RPC for auction or match-draft state transitions just to
  make a UI action appear faster.
- Do not edit an old migration to repair a cloud database. Add a forward
  migration and a regression test.
- Changing the card rating formula in `src/lib/cards/build.ts` does **not**
  change what packs mint. Packs draw from `card_editions`, a frozen json
  snapshot of each week's cards, so the site shows new overalls while packs
  keep handing out the old ones. Rebuild the archive afterwards with
  `npx tsx scripts/archive-card-edition.ts all`, or the "Archive card
  edition" workflow with "Rebuild every week" ticked. Cards already pulled
  live in `card_inventory` and stay frozen by design.
- A copy in an unclaimed expedition cannot leave its collection. The
  `card_inventory_expedition_guard` trigger raises `card is on expedition` on
  any delete or owner change, so melt and trade fail at the database no
  matter what the UI offers. Hide deployed copies from those screens for the
  explanation, not for the enforcement.
- When a stats row has no `team_name`, the stats views intentionally handle it
  as unknown rather than inventing a team. Use the report-side resolution or
  the documented `--team-map`/backfill path.
- Keep `playwright.config.ts` at one worker: the e2e fixtures share one local
  database and the auction test relies on two browser contexts.
