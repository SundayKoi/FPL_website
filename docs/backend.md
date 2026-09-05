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
  - `src/app/card/[slug]/card.png/route.tsx` and
    `src/app/copy/[id]/card.png/route.tsx` render player-card images — the
    card, and one owned copy of it. See "Copy images" below.
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
target league home. Premium HQ is the intentional exception: its
Premier/Academy toggle keeps card and fantasy destinations in the selected
league.

`SiteNavigation` renders three direct links for the active league—Stats, My
Team, and Cards—where Cards is active across both leagues' collection hubs, the
single-card share pages, and public binders. Active-league destinations plus
Auction Draft remain under League, the gated Premium HQ heads a Premium menu
alongside Betting, The Daily Stu, Match Drafter, FPL'dle, Higher or Lower, and
Guess the Card, and shared destinations stay under Info. Premium HQ previews and
links Betting, The Daily Stu, Player Cards, Draft League, Match Drafter, and the
card economy.
Admin and Broadcaster are Staff entries within Info, conditionally rendered
from the server-provided staff tier. Those props do not authorize access:
`/admin` and `/broadcaster` continue to perform their existing server-side
gates, and the route checks remain authoritative if a link is hidden or
manually visited.

**The cards section** (`/cards/*`, mirrored under `/academy/cards/*`) is laid
out by one map, `src/lib/cards/sections.ts`: six tabs — Home, My Collection,
Packs, Browse, Market, Play — the last three with sub-tabs (Team cards,
Compare, Moments, the Vault under Browse; Listings & bounties and Trade
offers under Market; Fantasy, Gauntlet, Expeditions, Weekly Draw and Stats
under Play). `CardsTabs` renders that map on every cards page from the two
`layout.tsx` files, marks the current tab and sub-tab from the pathname, and
carries the only Premier/Academy switcher a cards page has (`pairedCardsHref`
keeps the same page across leagues, sending the premier-only Gauntlet to the
academy's Play tab). Pages do not draw their own back links or league
toggles. Every old URL still resolves; the map decides which tab it lights.
A page the map does not list (`/cards/claims`, a redirect) lights nothing.

Cards Home (`src/app/cards/page.tsx`) is about the viewer and the week —
their card or claim, a one-line shelf count with today's free rip, this
week's notices, the draw, and a "what's where" line per tab — and reads only
through the read-only `loadHomeExtras` (never `getBettingUser()`, which
writes). The wall of every card is Browse. Shop-week notices (Live Drops,
Champion's Tribute, the Faceless Drop, the chase) come from the pure
`weekNotices()` in `src/lib/packs/weekNotices.ts`, most urgent first, and
`ThisWeekStrip` draws the first as a full line and the rest as chips, so a
busy week is one row above the buy button instead of four banners. Page
titles match tab labels (Packs, Market, Trade offers, Stats, Compare, Weekly
Draw, Team cards); routes did not move.

Under a tab, pages share `CardsPageHeader` (eyebrow "Browse · Premier ·
Season S5", the sub-tab's own name as the title, one paragraph). The Market
tab is three pages on one loader (`src/app/cards/market/load.ts`): Listings
(`/market`), Bounties (`/market/bounties`) and Trade offers (`/trades`), so
what a copy may do is the same answer on each. The Play index reports each
game's state for the viewer — lineup in and when it locks, a run in progress
or the week's best, a squad out and when it is back, tickets held — from the
pure `playStatuses()` in `src/lib/cards/playStatus.ts`, with the viewer
resolved read-only by `readViewerDiscordId()` (never `getBettingUser()`).

A copy acts from where it sits. In My Collection each copy's row (the
"Manage copies" drawer) has a Use menu — Sell, Trade, Send out, Field — that
opens Market, Trades, Expeditions or Fantasy with that copy already chosen,
via `?sell=`, `?offer=`, `?send=` and `?field=` (`parseInventoryId` in
`src/lib/cards/params.ts`). Those are hints, never permissions: each form
selects the copy only if it is the viewer's and available, and a junk value
opens the form empty. The share page `/card/[slug]` shows the viewer how
many copies they hold and how many are for sale, read-only. Every game and
the market share one empty state, `EmptyShelf`, with the pack shop as the
one button.

Gating within Cards uses one wording, `CardsGate` with `PREMIUM_GATE_TITLE`
and `PREMIUM_GATE_BODY`, whichever check a page runs: `premiumAccess()` (the
premium role) and `getBettingUser().allowed` (the wallet) both resolve the
same Discord role in production, so the two names the pages used to show for
it were two names for one thing.

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
- Premium HQ uses `src/lib/premium/access.ts` as the shared server-side gate;
  `DISCORD_REQUIRED_ROLE_ID` in `DISCORD_GUILD_ID` is the canonical FPL
  Premium role, with the legacy drafter variables retained as a fallback.
  The gate reads the payment URL from the League Links payment resource only
  for visitors who are not already admitted.
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
| Match reporting and stats | `match_reports`, `match_report_games`, `match_codes`, `raw_stats`, `stats_*` views | Captains report series; the Riot ingester writes raw rows; views provide player, team, champion, record, and game-log aggregates. A series that ended early carries `match_reports.forfeit_team_id` — see "Forfeits" below. |
| Betting | `betting_profiles`, `betting_teams`, `betting_events`, `betting_markets`, `betting_bets`, `betting_ledger`, pick'em/store/season tables | Service-role RPCs handle wallet, bet, lock, resolve, cancel, and audit transitions after app-layer Discord/staff checks. Schedule-linked events identify the reusable Premier/Academy season catalog entries; generated markets retain `fixture_id` for idempotent retries. |
| Banger Board | `banger_posts`, `banger_votes`, `daily_banger_checks`, `daily_banger_votes` | Public tweet reads and aggregate ratings use definer RPCs; server actions derive the signed-in Discord wallet and call service-role vote/reward RPCs. Daily rewards are atomically ledgered and limited by `(UTC date, voter)`; `daily_banger_votes.reward_amount` records the amount actually paid. |
| Banger Board settings | `banger_board_settings` | Public title reads; authenticated admin/owner-only updates enforced by RLS using `is_admin()` / `is_owner()`. |
| Fixture match drafts | `match_drafts`, `match_draft_settings` | Captains draft champions for scheduled fixtures; actions, ready checks, side choice, change requests, winners, and role positions are database-backed. |
| Public match-draft lobbies | `open_draft_lobbies`, `open_drafts` | Token-scoped champion drafts for external/public links, with a premium-gated creation path. |
| Player cards | `card_art_prefs`, `card_snapshots`, `card_rating_history` | User/admin art and motto preferences plus service-written weekly rating baselines/history. |
| FPL'dle | `fpldle_daily_candidates`, `fpldle_daily_puzzles`, `fpldle_daily_progress`, `daily_game_rewards` | Public candidate labels come from the latest frozen `card_editions` week; service-role RPCs lazily snapshot and select one stable answer per UTC date and league, record each signed-in wallet's guesses, and claim the shared daily-game reward when solved within five guesses. `daily_game_rewards` pays one 200 betting-dollar base reward per profile and UTC date (300 for an active patron), regardless of which daily game completes first; FPL'dle `reward_amount` records the shared amount. Answer and progress rows have no `anon`/`authenticated` read grant. |
| Guess the Card | `box_score_daily_candidates`, `box_score_daily_puzzles`, `box_score_daily_progress`, `daily_game_rewards` | Admin-testing daily puzzle at `/guess-the-card` and `/academy/guess-the-card`. Trusted server actions fetch complete current-season `raw_stats` rows, use a transaction advisory lock to freeze one eligible game per UTC date and league, return only the progressive reveal DTO, record at most five distinct guesses through service-role RPCs, and claim the shared daily-game reward on a correct answer. Candidate, target, and progress tables have RLS with service-role-only grants; the final target JSON is an explicit allowlist of game-stat fields rather than the full raw row. |
| Higher or Lower | `higher_lower_daily_candidates`, `higher_lower_daily_runs`, `higher_lower_weekly_settlements`, `higher_lower_weekly_payouts`, `daily_game_rewards` | Premium daily game for Premium members, admins, and owners. Trusted server actions use the shared Premium gate and service-role RPCs to freeze one full `card_editions` pool per UTC date and league, run a stable 45-round server-timed sequence with optimistic run versions, claim the shared daily-game reward when a run ends, preserve every unlimited attempt for best-score ranking, reveal challenger cards only after settlement, and split the fixed 2,000 weekly pool among tied top combined-league runs. Hidden candidate state has no `anon`/`authenticated` read grant. |
| Weekly Draw | `weekly_draws` | One row per season and week records the `card_inventory` copy drawn that week, its owner, the frozen card json, and the pot. Anyone may read it for the draw history page; only the service-role `run_weekly_draw` writes it. |
| Card expeditions | `expedition_runs`, `expedition_supplies`, `expedition_policies`, `expedition_graveyard` | One row per squad sent out: the three `card_inventory` copies, the tier (six runs, plus `lost` — the HOLD on a lost card, which reuses the deploy lock), the squad's shine, its forks and the choices made at them, insurance, a target card, the fee, when it resolves, and the whole outcome once it is claimed. Supplies hold map fragments; policies are a patron's weekly free insurance, claimed by primary-key insert; the graveyard keeps dead cards. Owners read their own rows; every write goes through `launch_expedition` / `decide_expedition_fork` / `resolve_expedition` / `ransom_lost_card` / `expire_lost_cards`. `card_inventory.mutation` is a generated column off the card json; `card_inventory_expedition_guard` keeps a deployed or lost copy from leaving the collection and `card_inventory_curse_guard` keeps a fresh Cursed card off the market. |
| Card print runs | `card_print_runs`, `card_inventory.print_number` | One counter row per print — `(season, edition_week, slug)` — recording how many copies that print has ever stamped. A `BEFORE INSERT` trigger on `card_inventory` bumps the counter in one `insert … on conflict do update … returning` and writes the resulting serial onto the new row, so no caller picks its own number. `minted` is monotonic: dusting retires a number rather than freeing it. Counts are world-readable (permissive select policy plus an `anon`/`authenticated` grant); every write comes from the trigger. |
| Card provenance | `card_provenance` | One row per thing that happened to a copy: `minted`, `transferred`, `dusted`. Written by `AFTER` triggers on `card_inventory`, deliberately with no foreign key so a chain outlives the copy it describes. Deny-all RLS with a service-role grant, like `card_inventory` itself. See "Print runs and provenance" for the `fpl.provenance_ref` contract. |
| Card market | `card_listings`, `card_wants` | The for-sale and wanted boards behind `/cards/market`. A listing names one `card_inventory` copy, an ask, and a fourteen-day expiry; a want names a slug and a bounty. Both are deny-all, service-role only. `buy_card_listing` and `fill_card_want` hand off to `execute_card_sale`, which locks the copy and both wallets, writes the ledger pair and moves ownership in one transaction. A partial unique index allows one OPEN listing per copy. |
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
  `vote_daily_banger`, `claim_daily_game_reward`, and `pay_match_win`. The wallet
  is locked before `patron_until > now()` is checked. Only the base is
  multiplied: `base * 1.5 + step * (streak - 1)` for an active patron,
  otherwise `base + step * (streak - 1)`. Callers cannot request a patron
  amount; each payout records the calculated amount in its ledger and claim,
  progress, vote, or payout row. Existing payouts are never backfilled.
- FPL'dle: `ensure_fpldle_daily_puzzle` creates one stable puzzle per UTC date
  and league; `record_fpldle_guess` enforces the five-guess progress limit and
  claims the shared daily-game reward. A correct replay returns the stored
  `reward_amount` without writing another ledger row.
- Higher or Lower: `ensure_higher_lower_daily_candidates_weeks` freezes the latest
  card-edition pool once per UTC date and league; the shared Premium gate
  authorizes access, and the trusted `start_higher_lower_run` path preserves
  completed attempts for unlimited replay; `submit_higher_lower_choice` claims
  the shared daily-game reward when a run ends, while that function and
  `advance_higher_lower_round` own the server-timed state machine and
  expected-version race handling;
  `settle_higher_lower_week` pays tied top combined-league runs exactly once.
  The `higher-lower-settlement` GitHub workflow triggers at both UTC hours
  that can represent 8 PM America/New_York, and the script skips the wrong
  DST half, supports a chosen Monday and dry-run preview, and relies on the
  settlement RPC's idempotency for the second trigger.
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
- Card market: `execute_card_sale` is the atom under both boards — it locks
  the copy, verifies the seller still owns it, locks both wallets in
  `least/greatest` order, refuses a buyer who cannot cover the price, writes
  the two `betting_ledger` rows (reason `card_sale`, ref'd at the listing or
  want), and moves `card_inventory.discord_id`. `buy_card_listing` and
  `fill_card_want` are the two ways in. See "Market" below.
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
- The Gauntlet's ghost draw is PRIVATE. The pool is shared and cached per
  week (last week's runs, immutable), but each run draws its own eight
  using `ghost_seed` — a CSPRNG value rolled once at entry and stored, so a
  run's bracket is fixed from the moment it starts and stays auditable.
  The reason is the leaderboard: it takes a player's BEST run, and
  best-of-N rewards the WIDTH of a score distribution, so a memorisable
  week would pay attempts rather than skill. The round's rules (wall,
  patch, traits) stay week-seeded — round four is round four for everyone.
  Three of last week's top finishers, one per player, stand in the pool as
  bounties worth `BOUNTY_MULT`; the multiplier is applied in
  `chooseGauntletPathAction`, never in the engine, because who you are
  fighting is a fact about the bracket and not about the match. Entry
  refuses a lineup identical to the player's last one (`sameLineup`,
  compared as a set of inventory ids) — checked before the fee is taken, so
  a refused entry never costs anything.
- Expedition payouts are guarded at `maxExpeditionPayout()` (11,250 = the
  best base x the shine cap x the brief bonus x the loot-multiplier cap),
  and a test reads the literal out of
  `20260914000001_expedition_routes.sql` (`resolve_expedition`) so the
  TypeScript and the SQL cannot drift. They did once: the guard shipped as
  the legend jackpot's BASE (2,000) rather than its maximum, so every
  bonused legend jackpot was refused — and since `rollOutcome` re-rolls on
  each attempt, retrying paid a lower grade and closed the run. Any guard
  that encodes a config rule in SQL needs a test bridging the two.
- The Gauntlet's purse (`src/lib/gauntlet/purse.ts`, migration
  `20260918000001_gauntlet_purse.sql`): every won round adds `PURSE_STEPS`
  to `gauntlet_runs.purse` in the same CAS update that advances the round.
  `gauntlet_cash_out(p_user, p_run)` is the one door: under the row lock it
  moves a live run to `banked` (refused with 'fight in progress' while
  `crossroads` is set — the purse is on the table from the first half to
  the whistle), or collects a `cleared` run, pays `purse` on a
  `gauntlet_purse` ledger row, and stamps `purse_paid` so it can never pay
  twice. A fallen run keeps its `purse` for the record and pays nothing.
  `chooseGauntletPathAction` calls the door on a clear; if that fails the
  end screen offers "Collect" through `bankGauntletRunAction`. Walking
  away between fights IS banking (`resetGauntletRunAction` delegates).
  The sink is unchanged: `gauntletPot` subtracts the week's `purse_paid`
  from the fees before the 40/25/15 shares, and `purse.test.ts` holds the
  schedule to returning under half the fee on average under every
  stopping rule at the advertised clear curves.
- Gauntlet ascension (`src/lib/gauntlet/ascension.ts`, migration
  `20260919000001_gauntlet_ascension.sql`): `gauntlet_ascension` holds
  what each player has unlocked per season; `gauntlet_ascend(p_user,
  p_season, p_level)` is called by the claim of a cleared run and is a
  `greatest`, so it is idempotent and never skips a level. Every run is
  stamped with `ascension` at entry (clamped to what is unlocked —
  `clampAscension`, a stale request plays level 0 rather than being
  refused) and the level reaches the engine through `ascensionRules`:
  the gate walls' rounds (`gateRoundsAt` in bosses.ts), a ghost's relic
  potency and target relief (`matchContextFor`, `ghostOpponent`), the
  offer size (sliced in `chooseGauntletPathAction` off the same seeded
  three, so a retry offers the same cards), the bracket bump
  (`generateOpponent`/`ghostOpponent`) and the Pit King's `holdsPit`
  folded into the boss effects. The board and the settlement rank by
  `weightedScore` (+10% a level) and the purse by `ascensionPurseMult`;
  the round log carries `ascension` so the balance report can split lift
  by level. Nothing about a level is rolled: every rule is printed on the
  draft screen, the run header and the rulebook.
- Gauntlet heirlooms: a run may bring ONE moment or roster plate from the
  shelf (`src/lib/gauntlet/heirlooms.ts`), frozen into `gauntlet_runs.heirloom`
  at entry like the lineup. It is never spent and never fielded. Everything
  it does is expressed as `RelicEffects` and folded in with
  `mergeRelicEffects`, so the engine needed no changes to accept one: a
  moment pays its colorway family's dial, and a plate multiplies
  `chemistryMult` by how many of the five actually played for that team —
  zero matches means an empty effects object, not a small one. Sizes are
  measured, not chosen: the four families land within 0.3 points of each
  other on rounds won (6.6-6.9% over no heirloom at 3,000 runs), and the
  numbers differ per family precisely because the beats are not equal in
  value. The bracket is still priced off the raw lineup average, so an
  heirloom is an edge the same way Fresh Legs is.
- Card expeditions: `launch_expedition` (v3, twelve arguments; the old
  six-argument signature is a wrapper) validates the squad, confirms the
  caller owns all three copies, enforces the tier slot (one unclaimed run
  per tier — `tier already out`; holds never occupy one) and the per-day
  launch limit under the same wallet lock, refuses a copy that is already
  deployed or lost, wounded (`card is wounded`), or one of one on a route
  past wounded (`card is one of one`), checks a Rescue's hold and an
  Exorcism's afflicted target, spends fragments and the weekly free policy
  (primary-key insert, `policy already used`), and debits the fee last.
  `decide_expedition_fork` records one answer per fork inside the window
  `expedition_fork_window` computes (`fork not open` / `fork closed` /
  `fork already decided`). `resolve_expedition` takes the whole app-rolled
  outcome as json, checks every field against the route (a death only on
  the Legendary route, a loss only where the ladder allows one, a
  Voidtouched stamp only off the Legendary route, one mutation per copy),
  claims FIRST so the deploy guard releases the squad, then stamps wounds
  and mutations, inserts a `lost` hold per lost card, buries and deletes a
  dead card (provenance records `died`, via the `fpl.card_fate` GUC),
  releases a rescued card's hold, strips an exorcised card's stamp, and
  pays the dollars, the comp and the fragments. `claimed_at` is still the
  reroll lock. `ransom_lost_card` debits the wallet and releases a hold;
  `expire_lost_cards` buries every hold past its week (the sweep calls
  it). All service-role only; the shine, gates, odds, payouts and every
  fork's story come from `src/lib/expeditions/config.ts` and
  `src/lib/expeditions/routes.ts`.

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

The shared read-only dashboard may enrich the next opponent with the current
season's `stats_team_agg` row. That aggregate is public convenience data: a
missing row or aggregate-query failure leaves the dashboard and lineup usable.
Roster identity, tournament codes, and draft-pattern views remain on their
existing cookie-bound/RLS paths; an opponent roster failure is isolated from
the signed-in team's own roster. The aggregate preview never uses the service-
role client.

The Stats team-detail URL contract is `tab=Teams&team=<name>&season=<code>&phase=<phase>`
under `/stats` or `/academy/stats`. `phase=All` and the default season are
omitted when they are defaults. Team queries trim and case-fold for exact
resolution only, then canonicalize to the loaded aggregate name; fuzzy or
ambiguous names do not select a team. Team selection and player selection are
mutually exclusive, and leaving a team detail clears only `team` while
retaining the Teams tab and current scope.

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
| Nightly match stats | `.github/workflows/ingest-stats.yml` → `scripts/riot_stats_ingest.py --from-reports` | Reads pending reports, fetches Riot matches, writes `raw_stats` with the service key, resolves sides, and marks report games ingested/failed. A report with no games settles as `forfeit` when one is declared and fails loud when one is not. |
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

### Copy images

Two routes render the same 1200x630 picture, from
`src/lib/cards/render/cardImage.tsx`:

- `/card/{slug}/card.png` pictures the CARD — a player as they stand, or
  `?w=YYYY-MM-DD` for that week's archived edition print. It reads public
  data with the anon client, because link unfurlers arrive with no cookies.
- `/copy/{id}/card.png` pictures one OWNED copy out of `card_inventory`,
  with the cosmetics that copy actually printed: its parallel, its Eclipse
  frame and hallmark, its autograph. `card_inventory` is deny-all RLS, so
  this route reads through `createBettingServiceClient`. That is not a
  privacy hole — copies are already public through binders and the trade
  board, and the frozen json it prints is the same public card plus ink the
  live card prints too — but it is why the id is validated as a positive
  integer before a client is built, and why a miss returns a placeholder
  IMAGE rather than a 404: these urls sit inside Discord messages, where a
  404 is a broken-image icon.

The layout is shared rather than copied because a copy image that laid its
stats out differently would read as a different card of the same player,
which is the one thing a collectible must never do. satori (next/og's
renderer) has no CSS 3D, blend modes or animation, so the parallels the live
card wears as moving light are reduced to flat marks — a named badge, a
frame colour, a "1 OF 1" stamp — by `src/lib/cards/render/treatment.ts`.

**Both urls carry a cache key, and neither may be built by hand.** Discord's
image proxy caches by URL, so a url that never changes pictures whatever was
rendered the first time it was fetched, forever; that is a bug this repo has
already shipped once. Use `cardImageUrl(site, slug, editionWeek)` for a card
and `copyImageUrl(site, copy)` for a copy, both from
`src/lib/cards/shareImage.ts`. The keys differ because the subjects differ: a
card is alive and re-rates weekly, so its key is the week; a copy is frozen
at mint except for the expedition mark it can come home wearing, so its key
is `card.expedition?.mark ?? "none"`.

The copy image's caption line carries the copy's identity: the edition it
came out of and, when both halves are known, its stamp — "WK Aug 24 edition ·
#7 of 43". The route reads `card_inventory.print_number` and the one
`card_print_runs` row keyed by (season, edition_week, slug); a copy minted
before print numbering, or a run whose counter cannot be read, keeps the
plain edition line rather than losing it.

### Discord card commands

Two slash commands live outside `commands.ts`, each in its own module
registered into `commandHandlers` by a side-effect import in
`src/app/api/discord/interactions/route.ts`:

- **`/rip`** (`src/lib/betting/discord/rip.ts`) opens the free daily pack and
  posts the pulls, one embed per card, pictured with `cardImageUrl`.
- **`/flex`** (`src/lib/betting/discord/flex.ts`) posts the caller's best copy
  of a named player, pictured with `copyImageUrl` so the parallel, the ink and
  the Eclipse frame that copy actually printed are what the channel sees.
  "Best" is `bestCopy`: Eclipse, then signed, then the parallel ladder
  (`FOIL_TYPES` order, ice down to prisma), then overall, then the newest
  pull. An optional `copy` option overrides the ranking with one specific
  copy (`pickCopy`, scoped to the named player's copies, so a stale id can
  never surface someone else's card). The flex is public; every refusal —
  owning none, a name matching several players, a week that isn't archived,
  a copy that no longer fits — is ephemeral.

  Both `player` and `copy` **autocomplete** out of the caller's own
  collection (`autocompleteHandlers.flex`): `playerChoices` offers one entry
  per owned player, best copy first, with the slug as the value; `copyChoices`
  offers every copy of the chosen player, best first, labelled by
  `copyLabel` (edition · parallel · ink · stamp · art · grade) with the
  inventory id as the value. A value typed rather than picked still works —
  `matchPlayer` accepts a slug or part of a name, and `pickCopy` matches
  typed text against the same labels the picker showed. Autocomplete has no
  deferral and does no wallet provisioning: one read, answer inside three
  seconds, and every failure is an empty list because Discord accepts nothing
  else in reply to an autocomplete interaction (`route.ts` answers the access
  gate and an unknown command the same way).

Both defer (`deferred()` + `after()`) and answer on the interaction's followup
webhook, because a pack open and a paged collection read both outrun Discord's
three-second deadline. Both take an optional free-text `week`, resolved by
`resolveRipWeek` against the live archive.

**Discord only learns a command exists from a run of
`scripts/register-discord-commands.ts`** (`npm run register:discord-commands`,
which PUTs `DISCORD_COMMANDS` from `commandDefs.ts`). Adding a handler is half
the job; the registration is the other half.

### Skin-line parallels

**Season 5's foils are drawn as Battlecast.** `SEASON_LINES` in
`src/lib/cards/skinLines.ts` maps a season to a line; a copy minted in a
listed season draws and names its parallel as that line's tier (prisma →
Standard, aurora → Chroma, refractor → Prestige, ice → Ultimate) via
`lineTreatmentFor` (PlayerCard3D, drawn exactly as a mockup `preview`
is) and `parallelLabelFor` (the shelf caption, the flat PNG's badge and
accent in `render/treatment.ts`, the Discord rip and flex lines, the
stats page). The STORAGE never changed: `foil_type` still holds the
ladder, the roller still walks it, dust still reads its multipliers, and
Eclipse is not a tier of anything. To rotate, add the next season's key;
the seasons before keep their look, because the mapping is by the copy's
own season.

`/skin-lines` is the design table the idea came from, open to staff and to
active patrons (`fetchPatronActive`, a `betting_profiles.patron_until` read;
the Premium Discord role does not open it, and everyone else is sent to
`/support-devs`). It is listed as a patron perk in `src/lib/patron/perks.ts`
and linked from the admin hub. The proposal: draw each
season's foils in one League skin line, a new line every season, with four
tiers inside it (Standard, Chroma, Prestige, Ultimate) sitting on the rungs —
and therefore the weights and dust multipliers — of Prisma, Aurora, Refractor
and Cracked Ice. Eclipse is not a tier of anything, keeps its name and look,
and does not rotate. `src/lib/cards/skinLines.ts` holds the six candidate
lines (label, look, accent, blend, utility), the tier ladder (`LINE_TIERS`,
`lineTierLabel`) and a worked Season 5 set. The treatments are
`card-foil-line-<key>` utilities in globals.css; each line owns one shape
(a circuit grid, a crescent moon, gilded corners, a pixel mosaic, a
sunburst in a ring, a reticle) and no line sweeps a bar, because Refractor
owns the streak. Every colour in a line is read from `--m1/--m2/--m3`
triplets, so a tier restates the same shape in another material without
redrawing it: `card-foil-tier-chroma` swaps in the line's own `--c` palette,
`card-foil-tier-prestige` turns every colour gold, `card-foil-tier-ultimate`
saturates; the sheen, gold frame and rising embers are sibling layers
(`-sheen`, `-frame`, `-embers`). They reach the card through `PlayerCard3D`'s
`preview` prop (`modifier` on the line layer, `layers` as siblings coloured
by `--line-accent`), which the mockup pages pass and which a season line
fills the same way. The tier's sibling layers are static (they do not swing
with the pointer); the line layer itself rides the holo ref like any
parallel.

### Showdown (Hold'em with the cards)

Showdown is Texas Hold'em played with player cards for betting dollars.
Hole cards come from a player's own ten-card stack, the board from the
current week's edition, and only dollars are ever at stake: a card sits at
a table and is never won, lost or put up. `src/lib/showdown/config.ts` is
the one source for every number (seats, stack size, brackets with blinds,
buy-ins and stack caps, the 3% rake capped at five big blinds with "no
flop, no drop", the 45-second clock); `src/lib/showdown/hands.ts` is the
pure evaluator (role is the suit, team pairs, tier makes the Ladder,
overall breaks ties; nine ranks from High Card to Foil Royal, with no plain
flush because five from one team is already a full roster) and exports
`HAND_RANKS`, which the rules panel `src/components/showdown/ShowdownRules.tsx`
renders so the rules a player reads cannot drift from what settles a hand.
`/cards/showdown` is premier-only and, until the tables land, is the
rulebook.

The engine is `src/lib/showdown/engine.ts`, a pure reducer over a table's
public state (seats, chips, board, pot, whose turn, the log) and secret
state (each seat's stack, hole cards, the rest of the deck): `startHand`
deals and posts blinds (heads up, the dealer is the small blind), `applyAction`
validates turn and legality (min-raise, short all-ins do not reopen the
action), streets advance when nobody is owed an action, `buildPots` makes
one side pot per contribution level, and settlement takes the rake off the
main pot first, splits ties with odd chips to the seat left of the dealer,
retires leavers and busted stacks, and returns the `HandResult`. `viewFor`
is the per-viewer snapshot: everyone's public state plus only your own
hole cards. It takes a random source, so tests script it.

The schema is `20260913000001_showdown.sql`: `showdown_brackets` (seeded
from config and held to it by `brackets.test.ts`), `showdown_tables`
(public state, a version, a deadline; publicly readable and in the
realtime publication), `showdown_secrets` (deny-all, never published),
`showdown_seats` (public; one seat per person anywhere), `showdown_seated_cards`
with a definer-rights guard trigger on `card_inventory` that refuses to
delete or re-own a seated copy ("card is at a table", the expedition lock
again), `showdown_hands` (history) and `showdown_rake` (the burn). Three
service-role RPCs: `showdown_sit` checks the buy-in range and the stack
(ten owned cards under the cap, or a house stack), debits the wallet,
seats and locks in one transaction; `showdown_stand` credits chips back
and releases the cards, refused mid-hand unless the seat is sitting out;
`showdown_commit` is the engine's one write — compare-and-swap on the
version, then public and secret state, every seat's chips and status, the
rake row and the history row — and it refuses any commit where the seats'
chips plus the pot do not balance before and after. Chips at a table have
left the wallet; the pot lives in the public state; the rake is chips
never credited back. pgTAP: `0087_showdown_test.sql`.

`src/lib/showdown/server.ts` is the transition layer (Higher-Lower's
shape; `actions.ts` is the thin `"use server"` adapter): `createTable`,
`sitDown` (validates the buy-in and the stack — ten owned copies of this
season, no relics or plates, under the cap — or deals a house stack with
`dealHouseStack`, calls `showdown_sit`, then commits the seat into public
and secret state and deals if the table can), `standUp` (mid-hand the seat
is marked leaving and auto-folds when asked to act; once out of the hand
`showdown_stand` returns the chips and the seat leaves the state), `act`,
and `syncTable` (any client: fold whoever ran out of clock, deal if
possible, return the view). Every transition is `transition()`: read the
row and the secret, run one engine step, `showdown_commit` against the
version read, and on "stale table version" read again, up to three times.
The identity is always the session's `getBettingUser()`; the client only
names a table and a move. `loadTableView` returns `viewFor`'s per-viewer
snapshot: everyone's public state plus your own hole cards and stack.
The felt (`src/components/showdown/ShowdownTable.tsx`) subscribes to
`postgres_changes` on the table's row and its seats and, on any change,
asks `syncTable` for a fresh view — hole cards never travel over the
channel — and runs a 500 ms clock on the server's time that calls the same
sync once a deadline is a second gone. `/cards/showdown` is the lobby and
`/cards/showdown/[id]` a table; anyone can watch. Card copies at a table
are locked by the guard trigger, so dusting, listing and trading refuse
them without any change to those features.

While the game is being tried out every table is a **practice** table
(`20260913000002_showdown_practice.sql`, pgTAP `0088`): the `free`
bracket's buy-in is the play-chip stack in front of you, `showdown_sit`
and `showdown_stand` skip the wallet and the ledger on a free bracket, and
`rakeFor` returns zero. `PRACTICE_ONLY` in `config.ts` is what keeps the
lobby from opening Low or Open tables; turn it off to allow real stakes,
with no database change.

The sweep, `sweepTables` in `server.ts`, runs the two transitions a
watching client would (fold whoever ran out of clock, deal if the table
can) for every table `fetchTablesDue` finds: a hand whose deadline is a
second gone, or a waiting table with two active seats. It is the only
Vercel cron in the app (`vercel.json`, every minute, `/api/showdown/sweep`)
and the route refuses without `CRON_SECRET`. The week's board on the
lobby page is `aggregateWeek` over `showdown_hands` since Monday
(`fetchHandsSince`); every hand record carries `players` (seat to person)
so the board reads by person. A settled Foil Royal posts to the cards
webhook from inside `transition`, after the commit and best-effort. Cards
on the felt carry an `art` path — `/copy/<id>/card.png` for an owned copy,
`/card/<slug>/card.png?w=<week>` for an edition card — and `MiniCard`
draws it. Patronage never touches any of it.

### Expedition routes

A run is a route with forks (`src/lib/expeditions/routes.ts`): N forks
split it into N+1 legs, fork i opens at the end of leg i+1 and closes at
the end of the next, and `expedition_fork_window` computes the same window
in SQL that `forkWindows` computes for the page. A fork is answered by
`decideForkFor` (which first checks that THIS squad can make THIS choice —
a favour needs a signed card, a light a foil and a dark fork, a rally one
roster — before the RPC checks the window) or by silence, which
`resolveRoute` reads as camp. Nothing sweeps a silent fork; the sweep
(`sweepExpeditions`, `/api/expeditions/sweep`, `*/5 * * * *` in
`vercel.json`) only pings each fork once as it opens — with a real mention
in the message `content`, because a mention inside an embed never
notifies — and buries holds past their week.

The claim (`claimExpeditionFor`) rolls the base outcome as before, then
walks the route with the recorded choices: each push adds to a loot
multiplier and rolls one harm on one living card (wounded, lost, dead in
that order, dead only on the Legendary route and only once the run has
pushed twice); a warned fork's harm comes with a Cursed stamp; the Legend
Hunt's second checkpoint haunts a camper; every Legendary fork bites even
a camper and every survivor of it comes home Voidtouched (a second at 25%);
a one-roster Legend Hunt ignored twice loses all three; a Cursed card sent
out again on a route that can lose it may not come back; insurance steps
every fate down one rung, last. The whole result goes to
`resolve_expedition` as one document. A dead card is deleted the way a
dusted one is (so nothing else on the site can touch it) and remembered in
`expedition_graveyard`; a lost card stays in `card_inventory` inside a
`lost` hold row, so the existing deploy lock — the trigger, the greyed
chips, the market refusals — covers it with no new guard, and
`ransom_lost_card` or a successful Rescue releases the hold.

Mutations are stamped into `card.mutation` (`{key, date, run}`) and lifted
into the generated `card_inventory.mutation` column. `PlayerCard3D` reads
`card.mutation` itself, so a minted mutation shows on every surface.
`MUTATION_EFFECTS` (`src/lib/cards/mutations.ts`) is the one table the
scorers read: Fantasy multiplies the slot (`scoreLineup`, through the live
`CurrentIdentity` read, with an Irradiated flare drawn deterministically
from the copy and the week), the Gauntlet adds to the card's bars in
`statOf` and folds the lineup's `mutationEffects` in as relic effects (the
heirloom pattern), dust pricing multiplies the whole value in
`dustValueOf`, auto-dust never touches a mutated copy, and the market's
Cursed refusal is `card_inventory_curse_guard` (seven days from the
stamp's date, so an Exorcism lifts it at once). The Gauntlet also refuses
a deployed, lost or wounded card at entry, which it never checked before.
The copy on the page and on `/admin/mutations` derives its numbers from
the same table.

The trail — the journal under each run, the encounters on it, the squad's
line at a fork and the route map — is derived, never stored
(`src/lib/expeditions/journal.ts`). Everything is seeded from the run id
and the leg (`mulberry32`, the Gauntlet's generator), so the server, the
page and the sweep agree on what happened without a table for it:
`encountersFor` places at most one encounter per leg at 35%, and only on a
route with forks that is not the Exorcism — a **merchant** (a flat
`MERCHANT_DOLLARS` on top of the multiplied payout, which is why
`maxExpeditionPayout` and `resolve_expedition`'s ceiling both add it), a
**storm** (the sweep calls `delay_expedition` once, pushing the run's
clock by `STORM_HOURS`, and records the leg in `expedition_runs.encounters`
so the next sweep skips it), or a **stranded card** (only where the route
can lose a card; at the claim, the oldest open `lost` hold belonging to
someone else is released, its card comes home wounded, and the finder is
paid `STRANDED_BOUNTY` on a separate `expedition_bounty` ledger row). The
claim sends `merchant`, `stranded` and `bounty` inside `p_outcome`;
`resolve_expedition` refuses a hold the caller owns, a hold that is not
open, and a bounty over its cap. The journal (`journalFor`) reads the
clock: a leg's two trail lines surface at 30% and 70% of it, the
encounter at 50%, the arrival when the fork opens, and the fork ping quotes
the latest line. `banterFor` is the same idea at the fork: a line from one
of the squad, chosen by what they can actually do there.

The league calendar (`src/lib/expeditions/matchday.ts`, pure over rows
from `fixtures` and `card_editions`): `teamsPlayingOn` reads a fixture's
day on the Eastern calendar (an 8pm Eastern fixture is the next day in
UTC, so `fetchFixturesSince` is asked from a day before the launch);
`surgeTeams` names the playing teams a squad carries, and the claim
multiplies the dollars by `1 + SURGE_BONUS` after the forks and before the
merchant, which is why `maxExpeditionPayout` and `resolve_expedition`'s
ceiling (13575) both carry the surge. The teams go into the outcome as
`surge` for the log. `rosterTeam` + `nextOpponent` give the page the
rival for a one-roster squad on the Legendary route's second fork —
copy only, computed at render, nothing stored. The echo: each moment on
the squad rolls `ECHO_CHANCE` once at the claim (after every other draw,
so a squad without one consumes nothing extra); a hit picks uniformly
from `echoPool` — the archived edition of the moment's week, both sides
of its game — and sends `echo {slug, week, moment}` in `p_outcome`.
`resolve_expedition` checks the moment is a moment on THIS run's squad,
mints the copy off `card_editions` (matte, unsigned, `pack_open_id` null,
`card.echo {run, moment, date}`), lets the existing triggers stamp the
print number and the 'minted' provenance, and returns `echo_id`. A week
that was never archived cannot echo, and the claim never offers it.

The ledger of the fallen and the found (`fetchLedger`, the public
`/cards/expeditions/ledger`) is a service-client read across every
owner's graveyard and every `lost` hold: open holds are "missing", a hold
closed by a Rescue, a ransom or a stranger's squad is "found", and a hold
that ran out is skipped because its grave is already listed. Usernames
and avatars come from `betting_profiles`, which every public card surface
already shows.

Convoys (`expedition_convoys`, `expedition_runs.convoy`, the 13-argument
`launch_expedition` whose `p_convoy` is null, `'new'` or a code): the host
launches as normal and the RPC opens the convoy with a code from
`expedition_convoy_code()`; a join is checked BEFORE the inner launch
writes anything (the code exists, has room, is not the caller's, is the
same tier, and the host's first fork has not opened), then the joiner's
run is updated onto the host's `started_at`/`resolves_at` so
`expedition_fork_window` agrees for both. Each run keeps its own
`choices`; `decideForkFor` posts the answer to the channel mentioning the
partner when they have not answered; at the claim `convoySheet`
(`src/lib/expeditions/convoy.ts`) merges the two sheets — a fork pushes
only where both pushed, my own kind of push is kept because favour, light
and rally are what MY squad can do — and `resolveRoute` rolls this run's
loot and harm off it. `encountersFor` leaves storms out of a convoy so the
shared clock never drifts. Every check is the RPC's; the page's
`ConvoyView` (`fetchConvoyViews`) is presentation.

### Auto-dust

A collector can set one rule (`card_auto_dust`, one row per Discord id,
migration `20260913000003`) that dusts spare copies for them: a ceiling
tier, a ceiling overall, how many copies of a print to keep, and whether it
also runs as a pack opens. Everything about which copies go is decided by
the pure `selectAutoDust` in `src/lib/cards/autoDust.ts`: a copy is
eligible only when its tier and overall sit at or under the ceilings, it
is not an Eclipse or a relic (moment, champion, team plate), and the
foil/signed switches let it through, and it carries no mutation; then,
per keep group — the slug, or the slug and edition week when the rule's
`per_edition` switch (migration `20260914000002`) is on, so last week's
print of a player survives this week's — the best copies are kept (signed,
then foil, then overall, then the older print) and the rest are the
selection. Copies already on the shelf count towards the keep
number when a pack is being judged, so a rule of "keep one" never leaves
you with none.

The server side (`src/lib/cards/autoDustServer.ts`, service role only)
re-reads ownership, applies the trade locks and the Eclipse refusal, and
dusts row by row through `dust_card` at the patron-aware value, exactly as
a tapped dust does — the rule never touches odds or pricing. A collection
run is capped at `AUTO_DUST_RUN_CAP` copies per call and reports how many
remain. `openPackAction` and `openDailyRipAction` wrap their result in
`withAutoDust`, which attaches `autoDusted: { ids, dusted, value }` so the
overlay seeds its dusted set and shows an "Auto-dusted" chip; an auto-dust
failure is logged and the open still succeeds. The panel on
`/cards/collection` previews the selection live against the shelf and
only enables "Dust now" once the rule is saved. The table is RLS
deny-all: reads and writes go through the actions in
`src/lib/cards/autoDust-actions.ts`.

### The card shelf

`card-cell` is 20rem wide plus padding, and a row that cannot fit a
whole number of them drops the last card alone onto the next line. The
`card-shelf` utility in globals.css makes the wrapping container a size
container and, at the widths where that happens, sets `--shelf-zoom` on
its cells so `zoom` shrinks each card just enough for the row to hold
one more. Zoom, not transform, so layout follows the smaller card.
`CollectionGrid` and `CardsGallery` both use it; add it to any new
wrapping shelf of `card-cell`s.

### Card motion at rest

`PlayerCard3D` stamps `data-motion="rest"` on its root until the pointer
arrives (or a finger lands) and `"live"` while it is there; an Eclipse is
always live. A rule in globals.css pauses every looping decoration on a
resting card — tier halos, drifting frames, patron flame and champion
embers, the signature blink, and a skin line's motion and tier layers —
with `animation-play-state: paused`, so a forty-card shelf idles for free
and resumes mid-cycle on hover. The foils themselves are pointer-driven
already and cost nothing at rest. Add any new looping card decoration to
that selector list.

### Pack odds, measured

Every roll in a pack — class, card within class, foil, parallel, autograph,
moment, team plate, Eclipse — draws from node's CSPRNG (`randomBytes(6)` over
2^48) through the pure functions in `src/lib/packs/rng.ts`,
`signatures.ts` and `eclipse.ts` (`rollEclipseCandidates`). Besides the
scripted-`rand` tests that pin the order of the roll, `src/lib/packs/odds.test.ts`
rolls the real random source tens of thousands of times and expects every
configured rate back within five standard errors, including that the Eclipse
gate opens on `ECLIPSE_CHANCE` of Card-of-the-Week pulls and never on
anything else, and that a foil does not make the next slot more likely to
foil. `npm run simulate:packs` (`scripts/simulate-packs.ts`, read-only,
needs the service key) rolls a real archived edition through the same code
and prints the expected rates beside what `card_inventory` actually holds,
by edition. The Eclipse rate is per crowned PULL: how often a crowned card
turns up depends on how many cards share its rarity class, so a thin top
class makes the same crowned card — and therefore Eclipses — cluster.
`scripts/sql/rare-pulls-audit.sql` asks the ledger directly: who has ink on
file (the only players a signed copy can be of), signed copies per player
against all their copies, every signed copy and every Eclipse in pull order
with the gap to the previous one, the Eclipse rate against crowned pulls per
edition, and a duplicate check that must return no rows.

### Eclipse, the one-of-one

An Eclipse can only fall on a **Card of the Week** — the top-rated card in
each role, five per edition week. `ECLIPSE_CHANCE` (0.5%) is the roll on such
a pull; multiplied by the ~2-4% of slots that are one, that is roughly one
Eclipse per 1,000-2,000 packs.

Two rules live in the database, not the application, because "there is only
one of these" must survive a race, a retry and whatever gets written next
year:

- **One per card, per week, forever** — `card_inventory_one_eclipse_per_print`,
  a partial unique index. A duplicate raises 23505. The opener reads first so
  the common case never hits that path, since a rejected row would fail the
  whole five-card insert and refund a pack that had already won.
- **It cannot be dusted** — refused inside `dust_card`, under the same
  `FOR UPDATE` lock as the ownership check. It can still be traded; that is
  the point of owning one. The mass-dust path skips Eclipses rather than
  failing, because a fifty-card sweep is where one would actually be lost.

**It takes the player's ink automatically** when they have drawn one. Left to
the ordinary 1% autograph roll the two gates compound to ~1 in 91,000 packs —
one signed Eclipse every twelve years at current volume — while an *ordinary*
copy of the same player can roll signed. Chance would make the rarest card in
the game the plain version of a player whose commons are autographed. A player
who never inked one still gets an Eclipse; it is simply the lesser of the two,
which is what gives drawing a signature a job. The rules live in
`src/lib/packs/eclipse.ts` as pure functions (`isEclipseEligible`,
`applyEclipse`) rather than inline in the opener.

Eclipse stays out of `FOIL_TYPES` and `FOIL_TYPE_WEIGHTS` on purpose: it does
not compete with Cracked Ice for the foil pull, and no edit to the weights
table can produce one by accident.

An unclaimed Eclipse stays claimable **forever** through that week's packs, so
the back catalogue of unminted ones grows every week. That is why the rate can
be flat and small rather than escalating to guarantee a weekly hit.

### The Vault

`/cards/vault` (and `/academy/cards/vault`) is the register of one-of-ones,
and it is **public** — no sign-in, like the moments wall and the ledger. An
Eclipse falling is league news, the Discord announcement links here, and a
page that answers "who owns that one" cannot sit behind a members gate and
still do its job. The reads go through the service client because
`card_inventory` and `card_provenance` are deny-all RLS, the same way
`/binder/[token]` reads a binder: the tables are closed, the content is not.

Two halves. **Found** is every `card_inventory` row with
`foil_type = 'eclipse'` for the season, drawn as the copy actually printed
(`PlayerCard3D` with `forceFoil`, `#1 of 1` by construction), with the holder's
name, avatar and patron flame, the date it was pulled, its chain of custody
from `describeProvenance`, and a link to its copy PNG. **Still out there** is
every crowned print (`card_editions.card->>'standout' = 'true'`) with no
Eclipse against its `(season, edition_week, slug)` — the same key the partial
unique index covers — grouped newest week first, in role order, with a *mints
signed* chip where the player has inked a signature. That chip is computed by
running `cardSlug()` over `card_art_prefs` in TypeScript rather than joining on
the database's `card_slug()`, so the board works in an environment where that
migration has not been applied.

Ordering and grouping are pure functions in `src/lib/cards/vault.ts`
(`groupUnclaimedByWeek`, `orderFound`, `vaultTotals`); the IO is
`fetchVault(service, season)` in `src/lib/cards/vaultQueries.ts`, framework-free
and paged like every other card read.

### Print runs and provenance

Two facts about an owned copy that the card itself cannot carry: which stamp
it took, and whose hands it has been through.

**Print numbers.** `card_print_runs` holds one counter per print —
`(season, edition_week, slug)`, the same key the Eclipse index uses — and
`card_inventory.print_number` holds the serial. The `card_inventory_print_number`
trigger (`BEFORE INSERT`) bumps the counter with a single
`insert … on conflict do update set minted = card_print_runs.minted + 1 returning minted`
and assigns the result, so two packs opened in the same instant serialize on
that counter row instead of both reading a stale maximum.

`minted` is **minted-to-date, never a live count**, and it never decreases.
`dust_card` deletes the row, so a live count would renumber the world every
time somebody melted a duplicate: `#7 of 43` would become `#7 of 42`, then
eventually a serial larger than its own run. A dusted copy retires its
number instead — the press ran 43 times whatever happened afterwards — which
is the only reading under which the stamp on a copy is a fact rather than a
snapshot of the market. How many are still held is a separate question, one
`count(*)` away.

Eclipse falls out as `#1 of 1` by construction rather than by a special case:
`card_inventory_one_eclipse_per_print` already caps a print at one Eclipse,
and an Eclipse pulled from a print nobody else has hit is the first thing
that counter ever stamped.

The counts are world-readable (`card_print_runs` has a permissive select
policy and an `anon`/`authenticated` grant) because "43 of these exist" is a
fact about a print, not about anybody's shelf, and it is printed on cards
that signed-out visitors see. Reads go through `fetchPrintRuns` in
`src/lib/packs/queries.ts`, which takes the `(week, slug)` pairs a page is
actually rendering and pages its chunks — the counter table has a row per
card per edition week and would otherwise trip PostgREST's 1000-row cap.

**Provenance.** `card_provenance` records every move: `minted` (with the
`card_pack_opens` row it fell out of, read off `pack_open_id`), `transferred`
(from the old owner to the new one) and `dusted` (with who destroyed it).
The rows are written by `AFTER` triggers on `card_inventory` rather than by
each caller, so a transfer path written next year is recorded correctly by a
developer who has never read this file. There is **no foreign key** to
`card_inventory` on purpose: a chain that vanished when the copy did would
answer "who owned this?" only while the answer is trivial. The triggers are
`AFTER`, so `card_inventory_expedition_guard` — a `BEFORE` trigger that
raises — refuses a deployed copy's move without leaving a record of a move
that never happened.

**The `fpl.provenance_ref` contract.** A row change carries no context: the
UPDATE that moves `discord_id` looks identical whether it came from a trade,
a sale, or an admin fixing a typo. So a caller that knows why states it, in
the transaction, immediately before its update:

```sql
perform set_config('fpl.provenance_ref', 'card_trades:' || p_trade, true);
```

The value is `table:id`; the trigger parses it and stamps `ref_table` /
`ref_id`. `true` makes it transaction-local, so it cannot leak onto the next
statement on a pooled connection, and an unset or malformed GUC produces a
transfer with no ref rather than an error — an unattributed transfer is still
a true transfer. `accept_card_trade` sets it, and **any future RPC that moves
a copy should set it the same way**. Mints do not use it: an insert already
carries `pack_open_id` on the row, and a fact stored on the row beats a fact
the caller had to remember to announce.

Reads go through `fetchProvenance` in `src/lib/cards/provenance.ts` (service
client — the table is deny-all like the inventory it describes), with the
pure `describeProvenance` turning rows into lines. The server action is
`fetchProvenanceAction` in `src/lib/trades/actions.ts`, gated exactly like
`fetchInventoryCardAction` and for the same reason: the chain of a copy you
are being offered names people who are not you, which is precisely what you
want to see before agreeing.

### Market

`/cards/market` (and `/academy/cards/market`) is the trading post's blunter
half. A trade needs two people to agree on everything at once; a listing needs
one person to name a price and another to accept it. Both boards are
members-only, gated on FPL Better exactly like trades, and read entirely
through the service client — `card_listings` and `card_wants` have RLS on with
no policies at all.

**The two boards.** `card_listings` names one `card_inventory` copy, an ask,
an optional note and an expiry fourteen days out. `card_wants` names a slug, a
season and a bounty — the card you are hunting, not one that happens to be for
sale. Nothing is escrowed on either side: a listing is a snapshot of an
intent, exactly like a `card_trades` row, and every promise in it is re-checked
at the moment money moves.

**One open listing per copy** is a partial unique index, not an application
check. Two open listings for the same card would let two people pay for it and
only one of them be given it, and the second's money would have to be walked
back by hand. A sold, cancelled or expired listing frees the copy again.

**The sale.** `execute_card_sale(p_inventory, p_seller, p_buyer, p_price,
p_ref_table, p_ref_id)` is where the atomicity lives: lock the copy `FOR
UPDATE`, confirm the seller still holds it, lock both wallets in
`least/greatest` order (the deadlock-safe order `tip_points` and
`accept_card_trade` use), refuse a buyer who cannot cover the price, write two
`betting_ledger` rows with reason `card_sale` ref'd at the LISTING or WANT
rather than at the copy, stamp `fpl.provenance_ref`, and move
`card_inventory.discord_id`. `buy_card_listing` adds the listing lock, the
open/expired checks and the "not your own listing" rule; `fill_card_want` adds
the slug-and-season match and marks the want filled. Both are service-role
only and neither authenticates its caller — the server actions in
`src/lib/market/actions.ts` derive the Discord id from the session.

**A deployed copy cannot be sold.** `card_inventory_expedition_guard` refuses
the ownership update from under the sale, and the exception propagates as
`card is on expedition` with the whole transaction rolled back. The app checks
the deploy lock and the fantasy lineup lock at LISTING time as well, so a card
that cannot be delivered never reaches the board — but the trigger is the
guarantee.

**Expiry has no sweeper.** Nothing crons over `expires_at`. The board query
filters on it, `buy_card_listing` refuses a lapsed listing, and `createListing`
retires the seller's own lapsed rows to `expired` before writing a new one —
without that last step one dead listing would make its copy permanently
unlistable under the unique index.

**Limits** live in `src/lib/market/config.ts` (`MAX_LISTING_ASK`,
`MAX_WANT_BOUNTY`, `LISTING_DAYS`, `MAX_OPEN_LISTINGS`, `MAX_OPEN_WANTS`,
`MAX_NOTE_CHARS`). The migration restates the ask cap, the bounty cap, the
note length and the fourteen days, so `config.test.ts` parses the SQL and
asserts the pairs agree.

A completed sale posts a best-effort "SOLD" embed to the cards channel through
`postCardsWebhook`. Like every other announcement it is garnish: the money has
already moved, and a Discord outage must never turn a settled sale into an
error.

### Player renames

A Riot rename moves a player's identity, and this site writes that identity
down in about twenty places — `raw_stats`, `riot_accounts`, `player_pool`,
the draft roster, the claim, the art prefs and their signature, every card
table keyed on the slug, the fantasy lineups, the daily-game candidates.

Do not hand-write a script for it. Use the function:

```sql
select * from public.preview_player_rename('OldName', 'OLD', 'NewName', 'NEW');
select * from public.rename_player('OldName', 'OLD', 'NewName', 'NEW');
```

`rename_player` is idempotent, returns a per-table report, and ends with a
LEFTOVERS count that must be 0. Wrap it in `begin; … rollback;` to rehearse.

Three things worth knowing:

- **It merges when it has to.** If the new identity already has rows — which
  is what happens when a stats ingest runs between the rename and the fix,
  filing the newest games under the new name while the rest stay under the
  old — the two halves are folded together rather than colliding on
  `raw_stats_match_summoner_key`.
- **It refuses when the two are different people**, proven by the one fact
  that settles it: appearing in the same match on different teams. It also
  refuses when both identities are claimed by different profiles.
- **`card_art_prefs` is folded field by field**, not row-wise. Skin and motto
  usually come from the old side, but a signature may have been inked *after*
  the rename and exists only on the new one. Ink is not recoverable.

After a rename, re-run the **Archive card edition** workflow with "Rebuild
every week" ticked: packs mint from `card_editions`, and a week archived while
the identity was split holds two half-players.

`public.card_slug()` mirrors `cardSlug()` in `src/lib/cards/build.ts`. The two
are pinned to one shared case table — the pgTAP suite owns it and
`src/lib/cards/slugBridge.test.ts` reads those cases out of the `.sql` file
and asserts the TypeScript agrees, so the implementations cannot drift apart
silently. Add a case in the pgTAP file and both sides pick it up.

### Forfeits

A series can end without every game being played. `match_reports.forfeit_team_id`
names the side that conceded (constrained to one of the two teams in the
series) and `forfeit_note` carries the human reason.

The rule that matters everywhere downstream: **a forfeit removes the games
nobody played, not the ones they did.** Report the series score as the
forfeit result and list only the games with real Riot match ids. Those games
ingest normally into `raw_stats`, so player stats, cards, fantasy points and
the leaderboards all see exactly what was actually played. Never invent game
rows to make the games list add up to the score — the gap between them IS the
forfeit, and `compute_score_warning` knows to expect it.

Two knock-on behaviours in `scripts/riot_stats_ingest.py`:

- `compute_score_warning` takes a `forfeit_side`. Without a forfeit it demands
  the tallied wins equal the reported score; with one it only complains about
  what is still impossible — a side showing more real wins than the score
  credits it, or the conceding team being reported as the winner.
- `rollup_report_status` rolls an empty game set up to `forfeit` when one is
  declared and `failed` when it is not. `forfeit` is deliberately not
  `ingested`: nothing was verified, because there was nothing to verify. It is
  still terminal, and `sync_fixture_score` treats it as such, so the result
  reaches `/schedule`.

The stats page's Teams tab lays forfeits back over the aggregate: for
every report that names a conceding side, the reported score minus the
games with a match id is credited as wins to the other side and losses to
the conceding one (`src/lib/stats/forfeits.ts`, `fetchForfeitRecords`).
The record and win rate include them; every per-game rate stays over games
played, and the card says "N by forfeit" so the two never read as one.

Not gated behind admin approval, deliberately: a captain can already push a
self-declared score onto a fixture by reporting one real game with an invented
series score, so a zero-game forfeit removes the last verifiable game rather
than the first. The existing controls still apply — `sync_fixture_score` writes
only while the fixture's score is null, and `/schedule`'s editor is the
correction path.

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
