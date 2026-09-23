# Backend architecture

This is a reference for FPL architecture and domain contracts. Read the sections
relevant to the affected feature. It describes the infrastructure that exists in this repo;
the migrations and source code are the final authority when this document and
the implementation disagree.

## Reference index

- [Request and data boundaries](#request-and-data-boundaries)
- [Authentication and authorization](#authentication-and-authorization)
- [Database organization](#database-organization)
- [Premier playoff advancement](#premier-playoff-advancement)
- [Player identity and My Team](#player-identity-and-my-team)
- [Realtime behavior](#realtime-behavior)
- [Scheduled and trusted workflows](#scheduled-and-trusted-workflows)
- [Common pitfalls](#common-pitfalls)

Feature-specific contracts are under their named headings; search for the domain
or RPC being changed rather than loading the whole reference.

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
Compare, Moments, Season's End, the Vault under Browse; Listings & bounties and Trade
offers under Market; Fantasy, Expeditions, The ledger and Weekly Draw
under Play). `CardsTabs` renders that map on every cards page from the two
`layout.tsx` files, marks the current tab and sub-tab from the pathname, and
carries the only Premier/Academy switcher a cards page has (`pairedCardsHref`
keeps the same page across leagues — every cards page exists under both). Pages do not draw their own back links or league
toggles. Every old URL still resolves; the map decides which tab it lights.
A page the map does not list (`/cards/claims`, a redirect) lights nothing.

My Collection has a local Weekly cards / Season's End selector. The weekly
shelf, roster sets, and binder use `card_inventory`; the Season's End view
shows the signed-in collector's active public copies from every published
release in that league, grouped by release. The public Season's End checklist
remains under Browse.

Browse is public. Every page under the Browse tab (all cards, team cards,
Compare, Moments, Season's End, the Vault) and the per-card share pages render without
a session: ordinary cards use public reads, while Season's End shows only
published, verified release designs through its trusted server reader.
Nothing on these pages claims, customises, buys, trades or fields a card. The
premium gate stays on Home, My Collection, Packs, Market and Play, and
`CardsGate` now offers the signed-out visitor the Browse door.

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

**The Dribb card.** A chase print that is not a player: Dribb, a 99 in
every column, on Bard, in the Aether Rift treatment
(`src/lib/cards/dribb.ts`, `DRIBB_LOOK`; the look is drawn off the copy's
`card.dribb` stamp). `openPackFor` rolls it once per standard pack at
`DRIBB_CHANCE` (1 in 10,000), after the finishes, and when it lands the
pack's last slot becomes the Dribb, numbered after however many the world
has found (a head-count of `card->dribb`). Five ever (`DRIBB_COPIES`):
migration `20260929000001` adds a check that the number is 1..5 and a
partial unique index on it — a sixth, or two fifths in the same instant,
fails the insert and the pack refunds — and redefines `dust_card` to refuse
it (`dribb cannot be dusted`), `launch_expedition` to keep it off any route
past wounded (`card is one of one`), and `record_card_provenance` to stamp
`dribb` on the minted print so it is counted apart from the player
cards. Filed under tier `dribb`, like a moment's `moment`, so
nothing prices or sorts it as an ordinary card; auto-dust treats it as a
relic; on an expedition it carries 16 shine, the most a single card can.
It can be traded. A secret: the rarities page never mentions it; the
first anyone hears of it is the announcement when one lands.
pgTAP `0105_dribb_card_test.sql`.

**On Air.** The casters' card, and the one insert whose scarcity is
attendance rather than odds: one of the league's broadcasters, 100 overall,
in a broadcast treatment — SMPTE colour bars, a lit ON AIR lamp, a waveform
along the foot, a REC dot (`src/lib/cards/onAir.ts`,
`ON_AIR_LOOK`/`onAirLook`; the look is drawn off the copy's `card.onAir`
stamp). Its lower third is a **production slate** (`card-onair-slate*` in
`globals.css`, drawn by `PlayerCardFace` off `card.onAir`): a
clapperboard's sticks over chalk-on-black fields — CAM (what the art is
shot on, or NO SIGNAL), SEASON, ROLE, TAKE
(this copy's number, the loudest thing on the slate), SCENE (the window)
and NOTES (the tagline) — which REPLACES the signature row, the five stat
bars and the record footer, in the same 168px those took, so the archetype
band and everything above it stay where they are; `onAirCard` therefore
freezes `subStats: []`. `openPackFor` rolls it once per standard pack at
`ON_AIR_CHANCE` (1 in 15) and **only while a Live Drops window is open**
(`liveNow`), in the last slot, directly after the Dribb block — if the
rarer relic already took that slot the On Air roll is not spent at all.
The pool is every profile an owner has marked `is_broadcaster`, joined to
its row in the new `on_air_casters` table (champion, skin, role word,
tagline, in/out); a broadcaster with **no** row is in the pool on the
defaults, and a caster with no champion prints the colour-bar test pattern
where the art would be — no signal is the print, not a fallback.
`fetchOnAirDesk` / `fetchOnAirCasters` / `countOnAirThisSeason`
(`src/lib/cards/onAirQueries.ts`)
are the two reads the roll cannot do in pure code; `pickOnAirCaster` takes
whoever has the fewest prints this season, a tie broken by `rand()`.
Twenty-five per caster per **season** (`ON_AIR_COPIES`): migration
`20261020000001` adds the settings table with its RLS (public read; staff
or the caster themself write), a check that the number is 1..25 and a
partial unique index on `(season, caster, number)` — a 26th, or two of the
same number in the same instant, fails the insert and the pack refunds —
and redefines `dust_card` to refuse it (`on air cannot be dusted`),
`launch_expedition` to keep it off any route past wounded (`card is one of
one`), and `record_card_provenance` to stamp `onAir` on the minted print.
Filed under tier `onair`, so nothing prices or sorts it as an ordinary
card; auto-dust treats it as a relic; on an expedition it carries a relic's
shine. It can be traded. Unlike the Dribb it is **not** a secret: it is
listed on `/cards/rarities`, named in the go-live announcement and in the
shop's Live Drops notice, and announced to the cards channel when one
lands — the point is that people know to be in the room. Staff tune the
casters on `/admin/on-air`, where the desk's skin picker reads the
champion's catalog through a staff-gated action
(`fetchOnAirSkinCatalogAction`, `src/lib/cards/onAir-actions.ts`) and refuses
a num outside it; the cap on the column is 200 (`20261021000001`), the same
ceiling `save_card_art_preference` uses. pgTAP `0124_on_air_card_test.sql`,
`0125_on_air_skin_range_test.sql`.

**Finishes (Shiny, StatTrak, Secret).** Three stamps a player-card print
can take on top of its parallel and its ink, rolled in
`src/lib/packs/rarities.ts` from the gates in `src/lib/packs/config.ts`
(`SHINY_CHANCE`, `STATTRAK_CHANCE`, `SECRET_CHANCE`) AFTER the Eclipse
pass in `openPackFor` and only for eligible prints (never a moment, plate,
relic or Eclipse), so every earlier draw in a pack is undisturbed. They
are frozen into the card json like `live`/`chase` — `card.shiny`,
`card.stattrak {points, since}`, `card.secret {number, of}` — with no new
columns: dust callers read them through PostgREST aliases
(`shiny:card->shiny, secret:card->secret`) and `dustValueOf` multiplies
by `SHINY_DUST_MULT`/`SECRET_DUST_MULT` under the autograph add. A Secret
is numbered past the checklist from a count of the season's existing
Secrets (`card->secret is not null`), at most one per pack, and is
announced to the cards channel like an Eclipse. Auto-dust never touches a
Secret or a slabbed copy, keeps a Shiny and a StatTrak copy unless the
rule's `skip_finishes` toggle (migration 20260925, default on) is turned
off, and treats a Shiny as a foil for the skip-foil rule besides. Expedition shine:
Shiny +2, Secret +3.

**Wear, slabbing, the StatTrak counter** (migration 20260922, pgTAP
0099). `card.wear` counts fieldings: `wear_cards(p_ids)` (service-only)
is called by the weekly drop for every scored lineup, and a trigger on
`expedition_runs` calls it for the squad
in the launch's own transaction. `slab_card(p_user, p_inventory)` seals a
copy (`card.slab {wear, at}`) after proving ownership and that it is not
away on a route; the `slab_seal` trigger then refuses any update that
removes or rewrites the slab or moves the wear under it. A slabbed copy
is refused everywhere it could be fielded: the `expedition_runs_slab_guard`
trigger in SQL, and `slabRefusal()` (src/lib/cards/wear.ts) in the
Fantasy server actions, whose pickers also leave it out. It
can still be sold, traded and dusted. `bump_stattrak(p_id, p_points, p_through)` (migration 20260924) adds the
pictured player's Fantasy Pts — `gamePoints()` from
`src/lib/stats/fantasyPoints.ts`, the stats tab's own tally — for every
game dated after the copy's `stattrak.through` (or `since`), fielded or
not, and moves `through` to the last game counted; the weekly drop's
`creditStatTrak` pass computes the credits with the pure
`stattrakCredits()` (`src/lib/cards/stattrak.ts`) and is idempotent. The
`stattrak_reset` trigger zeroes the count and restarts `since` on any
change of `discord_id`, dropping `through`, so a count is one owner's.
Grades (Factory New 0, Minimal Wear 1–2, Field-Tested 3–5, Well-Worn
6–10, Battle-Scarred 11+) are read in TS only; SQL stores the count.

**True pull rates** (migration 20260923, pgTAP 0100). `card_provenance`
gained `season` and, on the `minted` row, `print` — the flat facts of the
copy at mint (tier, foil, foil_type, signed, alt, shiny, secret,
stattrak, moment, team, champ, edition_week), written by
`record_card_provenance()` in the insert's own statement. Because the
row has no FK, it survives `dust_card`: a melted copy still leaves the
flat facts of its mint behind, which is what makes a true pull rate
countable at all (held counts carry survivorship bias). Mints from before
the migration carry no print.
`/cards/rarities` (and the academy twin) prints every rarity from
`src/lib/cards/rarityGuide.ts`, whose numbers import from the config; the
Discord announcement (`src/lib/cards/rarityAnnouncement.ts`) is posted
from `/admin/announce`.

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
| Premier playoffs | `premier_playoff_config`, `premier_playoff_entrants`, `fixtures` | Season-scoped Premier bracket settings and frozen seeds; quarterfinals, semifinals, and finals remain stable rows in `fixtures`. Advancement is revalidated and written by narrow admin/owner RPCs. |
| Auction draft | `drafts`, `players`, `lots`, `bids` | Nomination, bidding, countdown settlement, admin overrides, roster assignment, chat, and Nemesis picks are protected by RPCs and RLS. |
| Canonical players and free agency | `player_pool`, `free_agency_avg_bids`, `signups`, `info_resources` | Cross-draft player metadata, free-agency data, signups, and editable information resources. |
| Match reporting and stats | `match_reports`, `match_report_games`, `match_codes`, `raw_stats`, `stats_*` views | Captains report series; the Riot ingester writes raw rows; views provide player, team, champion, record, and game-log aggregates. A series that ended early carries `match_reports.forfeit_team_id` — see "Forfeits" below. |
| Betting | `betting_profiles`, `betting_teams`, `betting_events`, `betting_markets`, `betting_bets`, `betting_ledger`, pick'em/store/season tables | Service-role RPCs handle wallet, bet, lock, resolve, cancel, and audit transitions after app-layer Discord/staff checks. Schedule-linked events identify the reusable Premier/Academy season catalog entries; generated markets retain `fixture_id` for idempotent retries. |
| Banger Board | `banger_posts`, `banger_votes`, `daily_banger_checks`, `daily_banger_votes` | Public tweet reads and aggregate ratings use definer RPCs; server actions derive the signed-in Discord wallet and call service-role vote/reward RPCs. Daily rewards are atomically ledgered and limited by `(UTC date, voter)`; `daily_banger_votes.reward_amount` records the amount actually paid. |
| Banger Board settings | `banger_board_settings` | Public title reads; authenticated admin/owner-only updates enforced by RLS using `is_admin()` / `is_owner()`. |
| Fixture match drafts | `match_drafts`, `match_draft_settings` | Captains draft champions for scheduled fixtures; actions, ready checks, side choice, change requests, winners, role positions, and server-authoritative signed deadlines are database-backed. Pick overtime is stored as side-local debt and consumed only by that side's next pick; bans retain their existing timeout/skip behavior. |
| Public match-draft lobbies | `open_draft_lobbies`, `open_drafts` | Token-scoped champion drafts for external/public links, with a premium-gated creation path. Lobby rows persist the same signed deadline and side-local pick overtime, while only bans can be skipped after the grace period. |
| Player cards | `card_art_prefs`, `card_snapshots`, `card_rating_history` | User/admin art and motto preferences plus service-written weekly rating baselines/history. |
| FPL'dle | `fpldle_daily_candidates`, `fpldle_daily_puzzles`, `fpldle_daily_progress`, `daily_game_rewards` | Public candidate labels come from the latest frozen `card_editions` week; service-role RPCs lazily snapshot and select one stable answer per Eastern calendar date and league, record each signed-in wallet's guesses, and claim the shared daily-game reward when solved within five guesses. `daily_game_rewards` pays one 200 betting-dollar base reward per profile and Eastern date (300 for an active patron), regardless of which daily game completes first; FPL'dle `reward_amount` records the shared amount. Answer and progress rows have no `anon`/`authenticated` read grant. |
| Guess the Card | `box_score_daily_candidates`, `box_score_daily_puzzles`, `box_score_daily_progress`, `daily_game_rewards` | Admin-testing daily puzzle at `/guess-the-card` and `/academy/guess-the-card`. Trusted server actions fetch complete current-season `raw_stats` rows, use a transaction advisory lock to freeze one eligible game per Eastern calendar date and league, return only the progressive reveal DTO, record at most five distinct guesses through service-role RPCs, and claim the shared daily-game reward on a correct answer. Candidate, target, and progress tables have RLS with service-role-only grants; the final target JSON is an explicit allowlist of game-stat fields rather than the full raw row. |
| Higher or Lower | `higher_lower_daily_candidates`, `higher_lower_daily_runs`, `higher_lower_weekly_settlements`, `higher_lower_weekly_payouts`, `daily_game_rewards` | Premium daily game for Premium members, admins, and owners. Trusted server actions use the shared Premium gate and service-role RPCs to freeze one full `card_editions` pool per Eastern calendar date and league, run a stable 45-round server-timed sequence with optimistic run versions, claim the shared daily-game reward when a run ends, preserve every unlimited attempt for best-score ranking, reveal challenger cards only after settlement, and split the fixed 2,000 weekly pool among tied top combined-league runs. Hidden candidate state has no `anon`/`authenticated` read grant. |
| Weekly Draw | `weekly_draws` | One row per season and week records the `card_inventory` copy drawn that week, its owner, the frozen card json, and the pot. Anyone may read it for the draw history page; only the service-role `run_weekly_draw` writes it. |
| Card expeditions | `expedition_runs`, `expedition_supplies`, `expedition_policies`, `expedition_graveyard` | One row per squad sent out: the three `card_inventory` copies, the tier (seven runs, plus `lost` — the HOLD on a lost card, which reuses the deploy lock), the squad's shine, its forks and the choices made at them, insurance, a target card, the fee, when it resolves, and the whole outcome once it is claimed. Supplies hold map fragments; policies are a patron's weekly free insurance, claimed by primary-key insert; the graveyard keeps dead cards. Owners read their own rows; every write goes through `launch_expedition` / `decide_expedition_fork` / `resolve_expedition` / `ransom_lost_card` / `expire_lost_cards`. `card_inventory.mutation` is a generated column off the card json; `card_inventory_expedition_guard` keeps a deployed or lost copy from leaving the collection and `card_inventory_curse_guard` keeps a fresh Cursed card off the market. |
| Card print runs | `card_print_runs`, `card_inventory.print_number` | One counter row per print — `(season, edition_week, slug)` — recording how many copies that print has ever stamped. A `BEFORE INSERT` trigger on `card_inventory` bumps the counter in one `insert … on conflict do update … returning` and writes the resulting serial onto the new row, so no caller picks its own number. `minted` is monotonic: dusting retires a number rather than freeing it. Counts are world-readable (permissive select policy plus an `anon`/`authenticated` grant); every write comes from the trigger. |
| Card pack openings | `card_pack_openings` | Server-owned identity and outcome for every standard paid, daily, or comped opening. The request UUID makes retries idempotent; the row stores `standard`/`god`, frozen card JSON, inventory ids, reveal order, source, and fulfillment/refund state. Service-role RPCs begin, fulfill, and compensate it. |
| Card provenance | `card_provenance` | One row per thing that happened to a copy: `minted`, `transferred`, `dusted`. Written by `AFTER` triggers on `card_inventory`, deliberately with no foreign key so a chain outlives the copy it describes. New pack mints also carry `card_pack_openings.opening_id`; the opening id is immutable on the inventory row. Deny-all RLS with a service-role grant, like `card_inventory` itself. See "Print runs and provenance" for the `fpl.provenance_ref` contract. |
| Card market | `card_listings`, `card_wants` | The for-sale and wanted boards behind `/cards/market`. A listing names one `card_inventory` copy, an ask, and a fourteen-day expiry; a want names a slug and a bounty. Both are deny-all, service-role only. `buy_card_listing` and `fill_card_want` hand off to `execute_card_sale`, which locks the copy and both wallets, writes the ledger pair and moves ownership in one transaction. A partial unique index allows one OPEN listing per copy. |
| Season's End collectibles | `season_end_releases`, `season_end_designs`, `season_end_openings`, `season_end_inventory`, `season_end_provenance` | Versioned Premier/Academy release contracts. Catalogs, artwork payloads, signing books, numeric rules, economy inputs, and revision digests are frozen before `admin_test`; public copies preserve those references and are not player-card gameplay inputs. `begin_season_end_opening`, `prepare_season_end_opening`, and `fulfill_season_end_opening` are service-only, request-idempotent, first-writer-wins RPCs. Public reads use exact release IDs and paginated server adapters; test openings use isolated wallets and cannot enter the public collection. |
| Season's End commerce | `season_end_listings`, `season_end_wants`, `season_end_trades` | Dedicated public-only listing, wanted-board, direct-trade, and manual-dust boundaries. Each settlement rechecks release/mode/owner/lifecycle under row locks, locks shared wallets deterministically, records betting ledger and Season's End provenance entries, and leaves a tombstone after dust. Product-qualified routes under `/cards/season-end/market` and `/academy/cards/season-end/market` never resolve numeric IDs through `card_inventory`. |
| Homepage and announcements | `homepage_briefs`, `homepage_featured_settings`, `announcements`, `draft_chat` | Curated or generated homepage copy, featured matchups, operational announcements, and draft chat. |
| Broadcaster workspace | `homepage_featured_settings`, `fixtures`, `roster_memberships`, `match_drafts`, `raw_stats`, `stats_*` views | Read-only server composition of each league's featured fixture, rosters, match drafts, and in-house stats for owner/broadcaster commentary preparation. The homepage schedule's active stage follows the bracket once every regular-season week is played (the first playoff stage with an unplayed fixture, skipping stages a league does not play), and its `upcoming` list — the active stage and every later one — is what the admin's featured-match dropdown offers, so staff can feature a playoff game. `/broadcaster` also takes `?fixture=<id>` to caster-switch to any of those games without changing the featured pick. |

The exact schema is the ordered SQL in `supabase/migrations/`. Migrations are
append-only: add a new migration for a schema, policy, grant, view, trigger,
or RPC change instead of editing an already-applied migration. Put the
corresponding contract/authorization coverage in `supabase/tests/`.

### Premier playoff advancement

Migration `20261028000001_premier_playoffs.sql` adds the Premier playoff
contract. `premier_playoff_config` pins a season to its selected Premier draft,
stores the approved 2/2 and 4/0 pairing policies, and carries a
`config_version`; `premier_playoff_entrants` freezes the eight canonical team
identities, divisions, and seeds. Both tables are readable to signed-in and
anonymous clients, but direct writes are revoked. The rows do not replace
`fixtures`: seven stable fixture IDs per season remain the schedule, reporting,
match-code, draft, betting, and broadcaster references.

`initialize_premier_playoffs` is the only bracket initialization path. It
requires an admin or owner and verifies that its season and draft still match
the selected Premier configuration. It resolves every entrant against that
draft and exact season, verifies the eight frozen seeds and all four opening
matchups, and creates or updates the four quarterfinal, two semifinal, and one
final slots atomically. Re-running initialization preserves already advanced
teams in later-round placeholders. Existing duplicate slots or changes to a
fixture with scores, reports, codes, drafts, betting markets, or a featured
selection are errors; fixture rows are never deleted and recreated.

Result resolution is scoped to the exact source fixture and season. A complete
best-of-five score must be 3–0, 3–1, or 3–2. When the fixture has no usable
official score, exact-fixture playoff reports can provide evidence, including
provisional reports; failed, malformed, wrong-season, incomplete, or
conflicting evidence blocks advancement. The staff preview shows result
provenance and warnings. It does not make reporting itself publish the next
round.

`publish_premier_playoff_round` accepts a preview for the semifinals or final.
Inside one transaction it checks admin/owner authorization, serializes work
per season, locks configuration and source/target fixtures, re-resolves the
results, and compares the submitted source snapshots and configuration
version. It derives the proposed participants again, then fills the existing
target fixture rows together. A repeated identical publish is a no-op. Stale
previews and targets with dependent work are rejected, so an ordinary result
correction cannot silently rewrite a played bracket. `update_premier_playoff_policy`
is also admin/owner-only and increments `config_version`, invalidating previews
made against the old policy.

Pairing follows the rulebook: for a 3/1 division split, the top and bottom
seeds within the larger division meet, while the middle seed meets the lone
other-division team. With two survivors from each division, both semifinals
cross divisions, but the rulebook does not select which cross-pairing; a
league-approved `pairing_22` must be saved before publishing. If all four
survivors are from one division, the rulebook gives no fallback; `pairing_40`
must also be explicitly approved. A missing policy blocks the draw. Frozen
seed numbers still govern these choices after an upset. The system does not
assign game-one side selection for equal seeds from opposite divisions.

The Schedule admin panel calls these RPCs through the cookie-bound server
client, with route checks as a presentation gate and the database as the
authorization boundary. `scripts/seed-bracket.ts` defaults to a dry run; its
Premier write path uses the service role only in the trusted script and stays
disabled while `publishing_approved` is false. A local implementation or dry
run does not authorize a production write or deployment. pgTAP coverage lives
in `supabase/tests/0121_premier_playoffs_test.sql`.

Important RPC families include:

- Auction: `nominate`, `place_bid`, `close_lot`, `start_draft`,
  `pause_draft`, `resume_draft`, `cancel_lot`, `force_close_lot`, and admin
  assignment/undo functions.
- Stats/reporting: report and side-resolution functions plus the
  `stats_player_agg`, `stats_team_agg`, `stats_champion_agg`, `stats_records`,
  and `stats_game_log` views.
- Betting: `place_bet`, `cashout_bet`, lifecycle/lock functions, the admin
  create/resolve/cancel/grant functions, and the service-role-only
  `settle_betting_market_from_stats` RPC. Early `cashout_bet` is separate from
  post-series settlement.
- Recurring rewards: `calculate_recurring_reward` is the shared database
  calculator used by `claim_daily_streak`, `claim_weekly_streak`,
  `vote_daily_banger`, `claim_daily_game_reward`, and `pay_match_win`. The wallet
  is locked before `patron_until > now()` is checked. Only the base is
  multiplied: `base * 1.5 + step * (streak - 1)` for an active patron,
  otherwise `base + step * (streak - 1)`. Callers cannot request a patron
  amount; each payout records the calculated amount in its ledger and claim,
  progress, vote, or payout row. Existing payouts are never backfilled.
- FPL'dle: `ensure_fpldle_daily_puzzle` creates one stable puzzle per Eastern date
  and league; `record_fpldle_guess` enforces the five-guess progress limit and
  claims the shared daily-game reward. A correct replay returns the stored
  `reward_amount` without writing another ledger row.
- Higher or Lower: `ensure_higher_lower_daily_candidates_weeks` adds the
  newest two archived card weeks to a pool for the current Eastern calendar
  date and league. The weekly card drop invokes the same helper immediately
  after a successful edition archive; because the RPC preserves prior weeks,
  a date created before the drop may temporarily contain three weeks. The
  shared Premium gate authorizes access, and the trusted
  `start_higher_lower_run` path preserves completed attempts for unlimited
  replay; `submit_higher_lower_choice` claims the shared daily-game reward
  when a run ends, while that function and `advance_higher_lower_round` own
  the server-timed state machine and expected-version race handling;
  `settle_higher_lower_week` pays tied top combined-league runs exactly once.
  The `higher-lower-settlement` GitHub workflow triggers at both UTC hours
  that can represent 8 PM America/New_York, and the script skips the wrong
  DST half, supports a chosen Monday and dry-run preview, and relies on the
  settlement RPC's idempotency for the second trigger.
- Match drafts: `apply_match_draft_action`, `set_match_draft_ready`,
  `choose_match_draft_blue`, change/undo/reset functions, and their
  `open_draft_*` token equivalents. The action RPCs lock the draft row, use
  database time to calculate pick overtime, and write the next adjusted
  deadline atomically; a retry sees the advanced step and cannot charge twice.
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
- Expedition payouts are guarded at `maxExpeditionPayout()` (11,250 = the
  best base x the shine cap x the brief bonus x the loot-multiplier cap),
  and a test reads the literal out of
  `20260914000001_expedition_routes.sql` (`resolve_expedition`) so the
  TypeScript and the SQL cannot drift. They did once: the guard shipped as
  the legend jackpot's BASE (2,000) rather than its maximum, so every
  bonused legend jackpot was refused — and since `rollOutcome` re-rolls on
  each attempt, retrying paid a lower grade and closed the run. Any guard
  that encodes a config rule in SQL needs a test bridging the two.
- Card expeditions: `launch_expedition` (v3, twelve arguments; the old
  six-argument signature is a wrapper) validates the squad, confirms the
  caller owns all three copies, enforces the tier slot (one unclaimed run
  per tier — `tier already out`; holds never occupy one; there is no
  per-day launch limit since 20260926000001), keeps the Gilded Road to
  patrons (`patron road`, off `betting_profiles.patron_until`; migration
  20260927000001 — the route is a patron perk behind three signed cards,
  it pays 1,000–3,000 base, and nothing about it changes anyone's odds),
  caps insurance at one policy an Eastern week (two for a patron —
  `insurance used up`, counted off the runs insured since Monday; migration
  20260928000001, which also lifts `resolve_expedition`'s payout ceiling to
  `maxExpeditionPayout()`), refuses a copy that is already
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

### Scouting evidence and performance contract

`src/lib/scouting/queries.ts` reads the paged `raw_stats` history once and
selects identity, match, side, result, and the nullable per-game performance
columns `kills`, `deaths`, `assists`, `game_duration_min`,
`total_damage_to_champions`, and `kill_participation_pct`. The existing league,
Academy bridge, report bridge, alias, pagination, and roster identity gates are
preserved. `src/lib/scouting/derive.ts` keeps unresolved coverage as evidence,
rejects ambiguous ownership, deduplicates an accepted player/game, and only
then aggregates by canonical player and champion. Duplicate rows may fill a
missing metric; conflicting non-null values make only that metric unavailable.

The pure accumulator in `src/lib/scouting/performance.ts` uses ratio-of-totals
KDA, duration-weighted damage per minute, and the arithmetic mean of stored
per-game KP percentages. KDA requires finite non-negative K/D/A values; DPM
requires non-negative damage paired with a positive duration; KP accepts a
stored value from 0 through 100. Missing metrics render as unavailable rather
than zero, and each champion retains metric sample counts. Draft-only picks
remain count evidence without performance samples.

Scouting also excludes draft-only games that a forfeit confirms were never
played. `fetchScoutingHistory` treats a report with `status = 'forfeit'` as
having no played games, while a report with `forfeit_team_id` keeps only
`match_report_games` rows with a real `match_id`. The resulting fixture/game
keys are removed from draft evidence and from ingested stat coverage, so an
unplayed forfeited draft cannot contribute picks, champions, or stat values.

The checked-in `inhouse_stats` contract currently exposes only
`summoner_name`, `champion`, K/D/A, and `win`. In-house cards therefore expose
the existing games/win rate and KDA aggregation, while DMG/min and KP remain
unavailable until the owning schema and ingestion producer are verified. An
in-house read failure is reported with `inhousePlayerStatsStatus` and is
isolated from the regular scouting report; no guessed columns, remote schema
mutation, or page-load Riot request is used.

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
| Weekly match stats and betting settlement | `.github/workflows/ingest-stats.yml` → `scripts/riot_stats_ingest.py --from-reports` → `scripts/settle-betting-from-stats.py` | Tuesday at 07:23 UTC and manual runs. Ingests queued reports, then scans all linked Premier/Academy fixture markets—including older fixtures—and uses raw-stats evidence to settle markets and ready pick'ems. The settlement pass runs after partial ingest results too; each fixture is independently validated and the workflow remains non-zero for ingest failures, settlement failures, or evidence conflicts. |
| Weekly Premier brief | `.github/workflows/weekly-brief-premier.yml` → `scripts/generate-homepage-brief.ts --league premier` | Computes facts from Supabase, asks Anthropic for constrained prose, cleans it, and writes `homepage_briefs`. |
| Weekly Academy brief | `.github/workflows/weekly-brief-academy.yml` → same script with `--league academy` | Same flow, narrowed to the Academy season and teams. |
| Weekly cards | `.github/workflows/weekly-card-drop.yml` → `scripts/weekly-card-drop.ts` | Reads current ratings, writes `card_snapshots`/`card_rating_history`, archives the week's edition through `buildEditionForWeek` (a **Send-off** in a playoff week, announced with its own embed ahead of the Eclipse board), and posts movement/showcase content to Discord. |
| Weekly Draw | `.github/workflows/weekly-draw.yml` → `scripts/weekly-draw.ts` | Runs `run_weekly_draw` for every card season half an hour after the card drop, then posts each winner to Discord. The RPC does the writing (`weekly_draws`, the stamped copy, the ledger pot, the pack comp), so reruns and the `/schedule` admin fallback are safe. |
| Card edition archive | `.github/workflows/archive-card-edition.yml` → `scripts/archive-card-edition.ts` | Manual. Rebuilds one week (or every week, with `all_weeks`) into `card_editions` through `buildEditionForWeek` — the week's own `raw_stats` for an ordinary week, or a season-rated **Send-off** for a playoff week, exactly as the drop would have written it. Run it after any change to the rating formula, and to fill in a playoff week the drop met before its fixtures were scored — see the pitfall below and "The Send-off". |
| Bracket seeding | `.github/workflows/seed-bracket.yml` → `scripts/seed-bracket.ts` | Manual. Seeds a reviewed bracket file (`scripts/data/brackets/*.json`) onto `fixtures` for the file's season (`league_settings.academy_season`/`current_season`, or an explicit `season` in the file). Validates every team name against `league_teams` before writing anything, keys rows by `(season, stage, sort_order)` so re-runs rewrite rather than duplicate, leaves an already-scored fixture untouched, and never deletes. `dry_run` is **ticked by default** and prints the plan without writing. The decisions live in `src/lib/schedule/bracketSeed.ts` (`planBracketSeed`), not in the script. |
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
generator never resolves, cancels, or recreates weekly events. Each successful run also calls
`ensure_weekly_betting_pickems(target_monday)` to create one pick'em per league
from that exact fixture slate. Titles come from the published stage (`week_4`
becomes `Week 4`), not a calendar-week calculation. Existing pick'ems must match
the event, title, kickoff lock, and exact market IDs; mismatches abort the whole
transaction. Retries preserve cards and carryover, and single-series slates
are skipped because pick'ems require at least two legs. New slates require
open markets before kickoff and atomically claim the existing jackpot bank,
in event-ID order, just like manual creation. The result includes pick'em
created/existing/skipped counts. Service-role operators can repair missing
pick'ems alone with `ensure_weekly_betting_pickems('YYYY-MM-DD')` after verifying
the Monday and fixture stage; it refuses incomplete market coverage.

Trusted jobs use service-role credentials because they operate across users or
write tables with no normal-user write policy. Keep their secrets in GitHub
Actions/Vercel/Supabase configuration, not in source or client bundles.

### Stats-based betting settlement

The settlement migration adds `betting_markets.settlement_run_id` and frozen
`settlement_evidence`, plus the service-role-only
`settle_betting_market_from_stats(p_market, p_fixture, p_winning_team,
p_evidence, p_run_id)` RPC. The script derives a candidate in Python for
structured logging, but the RPC repeats the checks in the same transaction,
locks the market, and then invokes `_resolve_market`; Python never calculates a
payout or updates a wallet.

The verifier requires a Premier/Academy event whose schedule season matches the
fixture, exactly one non-prop betting-team mapping for each fixture participant,
all linked reports to agree on season and participants, every linked match to
have raw rows for both sides with non-null consistent `win` flags, and exactly
one winning side per match. It counts distinct `match_id` values once and
requires a best-of threshold. Report status and captain/fixture scores are
not result evidence. A forfeit may settle only when the non-forfeiting side
already has enough verified played wins; otherwise it stays pending.

The same Tuesday run calls the existing `resolvable_pickems` and
`resolve_pickem` RPCs after market settlement. That preserves the existing
cancelled-leg refund and jackpot-rollover rules, and an unresolved leg keeps a
pick'em pending. The lifecycle cron may race this call safely because both
market and pick'em resolution are idempotent and lock their rows.

Use `--dry-run`, `--season`, or `--fixture-id` for recovery planning. A normal
retry reuses the database idempotency guard and changes no balances. If current
stats no longer match frozen evidence, the RPC records a
`market_stats_conflict` audit row for review and never reverses a completed
payout. Operational errors and validation conflicts are logged as structured
JSON and produce a non-zero workflow result.

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

Autographs render from the frozen PNG carried by a signed copy. Browser cards
use a neutral contrast treatment and share images use a static neutral backing;
the renderer never normalizes, recolors, or rewrites the player's ink.

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

**Both leagues' live seasons — Premier S5 and Academy A1 — draw their foils
as Battlecast.** `src/lib/cards/skinLines.ts` states that era once, as
`CURRENT_LINE` plus the season code each league is on in
`CURRENT_LINE_SEASONS`, and derives both `SEASON_LINES` keys from it.
`SEASON_LINES` maps a season to a line: a copy minted in a
listed season draws and names its parallel as that line's tier (prisma →
Standard, aurora → Chroma, refractor → Prestige, ice → Ultimate) via
`lineTreatmentFor` (PlayerCard3D, drawn exactly as a mockup `preview`
is) and `parallelLabelFor` (the shelf caption, the flat PNG's badge and
accent in `render/treatment.ts`, the Discord rip and flex lines). The
STORAGE never changed: `foil_type` still holds the
ladder, the roller still walks it, dust still reads its multipliers, and
Eclipse is not a tier of anything. To rotate, put both leagues' new season
codes in `CURRENT_LINE_SEASONS` and set `CURRENT_LINE` to the new line, then
move the outgoing codes into `SEASON_LINES` with the line they had; the
seasons before keep their look, because the mapping is by the copy's own
season.

`/skin-lines` is the design table the idea came from, open to staff and to
active patrons (`fetchPatronActive`, a `betting_profiles.patron_until` read;
the Premium Discord role does not open it, and everyone else is sent to
`/support-devs`). It is listed as a patron perk in `src/lib/patron/perks.ts`
and linked from the admin hub. The proposal: draw each
season's foils in one League skin line, a new line every season, with four
tiers inside it (Standard, Chroma, Prestige, Ultimate) sitting on the rungs —
and therefore the weights and dust multipliers — of Prisma, Aurora, Refractor
and Cracked Ice. Eclipse is not a tier of anything, keeps its name and look,
and does not rotate. `src/lib/cards/skinLines.ts` holds the seven candidate
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
a camper and every survivor of it comes home Voidtouched (a second at 12.5%);
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
from the copy and the week), dust pricing multiplies the whole value in
`dustValueOf`, auto-dust never touches a mutated copy, and the market's
Cursed refusal is `card_inventory_curse_guard` (seven days from the
stamp's date, so an Exorcism lifts it at once).
The copy on the page and on `/admin/mutations` derives its numbers from
the same table.

**The road is drawn per run** (`ROADS` / `forksFor` in
`src/lib/expeditions/routes.ts`, rulebook 3 — `ROAD_RULES`; migration
`20261009000001_expedition_roads.sql` moves the `rules` default to 3). Each
checkpoint is a pool of two to four places in the same risk envelope;
`forksFor(tier, road)` picks one per slot from the run id (or the CONVOY
id, so both squads of a convoy stand at one fork), deterministically, and
the page, the ping, the convoy announcement and the claim all call it —
nothing about the road is stored. `FORKS` is the first place in every slot,
which is exactly what every tier had before, and what a run stamped below
`ROAD_RULES` still walks. A place can carry a `pushFind` (a fragment or a
free pack on a push, after the harm and the reward), a `toll` (camping
costs `TOLL_LOOT` off the multiplier, with that chance) and a `campReward`
(a mutation for a night held). The five **role calls** — `hold` (Top: a
camp with none of a camp's risks, `+HOLD_LOOT`), `scout` (Jungle: push at
¾ risk, harm on the Jungle), `roam` (Mid: ×1.5 bonus, harm rolled on two
cards), `kite` (Bot: ×0.5 bonus at ¼ risk) and `ward` (Support: lost and
dead rolls halved) — are five more words `decide_expedition_fork` accepts;
whether THIS squad may make one (the role present, unspent this run, not
the scouting run's coin flip) is `choiceAllowed`'s check before the write,
as favour/light/rally always were, and `resolveRoute` reads an ineligible
one as camp. `convoySheet` treats `hold` as a camp. Every road-side gain
lands inside the loot multiplier (`LOOT_MULT_CAP`) or the 0–3 fragment
count the claim already caps, so `resolve_expedition`'s payout ceiling is
untouched.

**Trail miles** (`src/lib/expeditions/trail.ts`, migration
`20261010000001_expedition_trail_miles.sql`): every card that comes home
alive — home or wounded — is stamped `card.trail = { miles, runs, deepest }`
by the `expedition_runs_trail_stamp` trigger, which fires when a run's
`claimed_at` is set and reads the outcome's fates; `expedition_trail_miles(tier)`
is the SQL twin of `MILES_BY_TIER` (scout 1, rescue 1, gilded 2, raid 2,
legend 3, legendary 4, exorcism 0) and `trail.test.ts` holds the two equal.
A trigger rather than a field the app sends, because the miles unlock
things: `TRAIL_TITLES` at 8 (Trailworn: a badge), 16 (Veteran: the card's
own role call takes `VETERAN_SHAPE` in `resolveRoute` — scout at ½ risk,
roam ×1.75, kite at ⅛, ward's lost/dead at ¼, hold `VETERAN_HOLD_LOOT`)
and 30 (Wayfarer: `card-trail-wayfarer` frame on `PlayerCard3D`, and
`WAYFARER_SHINE` in `shineOf`). The caller of a role call is the squad's
member in that role with the most miles. The run also remembers itself
inside `resolveRoute`: a toll paid at fork *n* waives fork *n+1*'s, and a
`scout` at fork *n* scales fork *n+1*'s camp risks by `SCOUTED_CAMP_RISK`
(and `journalFor`, handed the run's `choices`, writes the Jungle's line
naming the next place at the start of the leg).

The Mythic route (`mythic` in `EXPEDITION_TIERS`; 20261015000001): above
the Legendary route — 96 hours, five forks, every place in `ROADS.mythic`
warned and dark with a haunting camp, three fragments, and two gates of
its own: a Voidtouched card in the squad (`squadMeets`) and a Legend
mark on the shelf (`hasLegendMark`, passed to `squadMeets` as `shelf`);
`launch_expedition` checks both again under lock. Momentum is the
route's rule in `resolveRoute`: `streak` counts consecutive pushes, a
camp or a hold resets it, and each push adds `MOMENTUM_BONUS × streak`
to the bonus and `MOMENTUM_DEATH × streak` to the death roll. At the end
`ascend` turns every Voidtouched survivor Voidborn — the one mutation
that replaces another (`MUTATION_EFFECTS.voidborn`, `card-mut-voidborn`)
— and the rest come home Voidtouched. The migration adds `voidborn` to
the `card_inventory.mutation` check, `mythic` to `expedition_trail_miles`
(5), redeclares `launch_expedition`'s 12-argument body (the 13-argument
convoy wrapper delegates to it) with the tier in every list and the two
gates, and redeclares `resolve_expedition` with the tier in the fate and
mutation checks, Voidborn allowed only on the Mythic route and only over
Voidtouched (the stamp's `where` lets it replace), and the ceiling at
`maxExpeditionPayout()` again.

Campaigns (`src/lib/expeditions/campaigns.ts`, pure; the table and four
RPCs in 20261014000001): `expedition_campaigns` holds one row per
campaign with a partial unique index keeping one OPEN per (collector,
season). `start_expedition_campaign` opens one, `bind_expedition_campaign`
ties a fresh unclaimed run to the campaign's current stage (the tier
must be `expedition_campaign_tier(key, stage)`, the stage must have no
run out) and copies the campaign's `road` onto `expedition_runs.road`,
`advance_expedition_campaign` (called by the claim once the stage's run
is claimed) bumps the stage, stores the next road and the stage's log,
and at stage 3 finishes the campaign and mints the relic — a copy of
`p_relic_from` (a card of the finale's squad) with `card.campaign`
stamped and the original's stamps stripped — and
`abandon_expedition_campaign` closes one unfinished. All four are
service-role only; the app checks the caller and computes the road, the
RPCs check ownership, stage, tier and claim under lock. The road is
`RoadRef.places`: `forksFor` walks the named place at each checkpoint
and falls back to the draw for a slot it does not know (consuming the
draw either way, so the other slots match). `nextRoad` maps a stage's
grade, pushes and survivors to the next tier's places, `relicBearer`
picks the survivor with the most miles, and `canBind` is the app-side
check the launch makes before the RPC. A campaign relic counts
`RELIC_SHINE` and is `isProtected`; it dusts as its tier.

Season standings (`src/lib/expeditions/standings.ts`, pure; the
`expedition_standings` view and `expedition_accolades` table,
20261013000001): the view scores every claimed run per (season,
collector) — miles (`expedition_trail_miles` per run, walked whether or
not everyone came home), loot (the outcome's dollars), Legendary
homecomings (a `legendary` claim with no `lost`/`dead` fate) and rivals
beaten (`outcome.rivals` with `won`) — and is granted to everyone like
`betting_leaderboard`, because a view reads with its owner's rights and
a leaderboard is public by nature. `rankStandings` orders it for the
board and the ledger (miles, loot, homecomings, rivals, name); `leaderOf`
previews each mark exactly as `close_expedition_season` awards it (top
of the standing above zero, ties to the lower discord id).
`close_expedition_season(p_season)` is service-role only, idempotent
(`unique (season, kind)`, `on conflict do nothing`) and awards
Pathfinder / Plunderer / Survivor into `expedition_accolades`, which is
readable by everyone; `closeExpeditionSeasonAction` (admin-actions.ts)
checks `fetchStaffTier` before calling it, posts the marks to the cards
channel, and `/admin/expeditions` is the button. Marks only — no ledger
row is written at season close.

The weather (`src/lib/expeditions/weather.ts`, pure; from `WEATHER_RULES`
= 5, 20261012000001): one league-wide condition a week, `weatherForWeek`
drawn from the Eastern Monday's date (Clear a third of the time, Fog,
Drought, Harvest) and forced to the Watch in a playoff week
(`watchWeeksOf` over the `fixtures` rows' `stage`, which
`fetchFixturesSince` now selects). A run keeps the weather it launched
under — `weatherOfRun` derives it from `startedAt`, nothing is stored —
and the page attaches it to each run (`ExpeditionRun.weather`) for the
journal and the fork buttons, the claim and the fork decision derive it
themselves, and the sweep reads the fixtures once. What it does:
`underWeather` in routes.ts turns every fork dark under Fog, scales a
gamble fork's bonus by `DROUGHT_GAMBLE` under a Drought and waives the
toll under a Harvest; `tollCost` doubles the toll under the Watch
(`WATCH_TOLL`); `encountersFor` weights the draw (`DROUGHT_CACHES`,
`WATCH_RIVALS`, `WATCH_GHOSTS`) and the journal opens with the week's
sky; the claim pays the merchant `HARVEST_MERCHANT` × under a Harvest,
which is why `maxExpeditionPayout` and `resolve_expedition`'s ceiling
(16350, redeclared in 20261012000001) both carry it — config.test.ts
reads the ceiling off the NEWEST migration that declares the function.

Company on the road (`src/lib/expeditions/company.ts`, pure; the reads
in `companyReads.ts`, service-client only; from `COMPANY_RULES` = 4,
20261011000001): the trail's **rival squad** is another collector's real
run on the same route — `rivalFor` picks the one launched closest before
the encounter's hour within `RIVAL_WINDOW_MS`, never the same collector
and never the convoy partner — and `rivalVerdict` gives the spot to the
squad with more shine, the seeded coin breaking a tie. `companyFor` also
finds every other run whose rival encounter picked this one
(`crossings`), so both journals name the other side. No run on the road
means `alone`: the resolver pays `CACHE_LOOT` where the rival would have
been. A **ghost** is a `route` grave of the season walking the Legend and
Legendary legs (`ghostFor`, seeded by run and leg over graves dug before
the hour): the resolver rolls the next fork's camp haunting at
`GHOST_HAUNT` × the fork's own and never under `GHOST_HAUNT_FLOOR`, a push
is harmless, and a squad carrying the dead card's team (`stood`) gets
`CACHE_LOOT` instead. Everything is stable once the hour has passed —
the candidates are runs that launched and graves dug before it — so the
page (`fetchCompanies` for the runs in the field, handed to `journalFor`
as `company`), the sweep's ping and the claim (`fetchCompany`, then
`encountersFor(run, company)`) agree without a table. The claim writes
the rivals raced into the outcome as `rivals [{who, name, runId, won}]`;
`fetchRivalries` reads them back from both sides (`outcome @> {rivals:
[{who}]}`) and `tallyRivalries` scores the season for the board's
Rivalries strip. A run stamped below `COMPANY_RULES` keeps its coin and
meets no ghost, because its journal is half written.

The trail — the journal under each run, the encounters on it, the squad's
line at a fork and the route map — is derived, never stored
(`src/lib/expeditions/journal.ts`). On a road (`ROAD_RULES`) the pools are
wider and drawn without repeats inside a run, each leg carries one line
from the route and one in the voice of a squad member's actual role
(`ROLE_TRAIL`), and `encountersFor` also places a **cache** (`+CACHE_LOOT`),
a **rival squad** (a coin tossed at derivation — `won` — worth
`+RIVAL_WIN_LOOT` or `-RIVAL_LOSS_LOOT`), a **shrine** (the next fork's push
risk × `SHRINE_RISK`) and a **relic hunter** (`found` at
`HUNTER_FRAGMENT_CHANCE`: a fragment), at `ROAD_ENCOUNTER_CHANCE` a leg; the
claim hands them to `resolveRoute` as `encounters`. A run stamped below
`ROAD_RULES` keeps the legacy pools (`LEGACY_*`) word for word, because its
journal is half-written and half-quoted in Discord. Everything is seeded from the run id
and the leg (`mulberry32`, `src/lib/expeditions/prng.ts`), so the server, the
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

Every ordinary roll in a pack — class, card within class, foil, parallel,
autograph, moment, team plate, Eclipse — draws from node's CSPRNG
(`randomBytes(6)` over
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
Before that ordinary roller runs, each paid, daily, and standard-comp opening
gets one server-side `randomInt(1500)` draw. Exactly draw zero is a God Pack;
the client never chooses the branch and specialty packs are excluded. A God
Pack skips moments, team plates, Eclipse, and ordinary autograph logic, then
prints three 80/20 Epic/Legendary special foils, a Legendary Cracked Ice slot,
and a final Refractor/Ice slot that is signed when that edition has eligible
ink. Cards prefer distinct eligible players; an edition with fewer than five
distinct players repeats its real pool rather than inventing ratings. Its
`card_pack_openings` row and five inventory/provenance rows preserve the
server-selected variant and reveal order, and the client protects all five
from auto-dust.

`npm run simulate:packs` also reports the simulated God Pack frequency, the
expected one-in-1,500 volume, signature coverage, and base/Patron dust value of
the God pulls (manual dust value only; the automatic rule leaves them intact).
`scripts/sql/rare-pulls-audit.sql` asks the ledger directly: who has ink on
file (the only players a signed copy can be of), signed copies per player
against all their copies, every signed copy and every Eclipse in pull order
with the gap to the previous one, the Eclipse rate against crowned pulls per
edition, and a duplicate check that must return no rows.

### Eclipse, the one-of-one

An Eclipse can only fall on a **Card of the Week** — the top-rated card in
each role, five per edition week. `ECLIPSE_CHANCE` (0.2%) is the roll on such
a pull; multiplied by the ~1.2-2.4% of slots that are one — the class weights
came down on 2026-09-08 too, so the gate and the thing it gates both got
rarer — that is roughly one Eclipse per 4,000-8,000 packs.

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
the ordinary 0.5% autograph roll the two gates compound to ~1 in a million
packs — no signed Eclipse in the league's lifetime — while an *ordinary* copy
of the same player can roll signed. Chance would make the rarest card in
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

### The Send-off

Playoff weeks do not print a weekly edition. A weekly edition rates each
player against the players who played that week (`fetchWeekCards` →
`buildSeasonCards`, percentile bars against the same-role cohort), and the
bracket thins that cohort to 40, then 20, then 10 — so a semifinal print
ranks people among a handful and the losing finalists print as bad cards for
reaching the final.

**The rule.** Each player's playoff card prints **once**, in the week their
team's split ended, rated on the whole split (the season-to-date build
`fetchSeasonCards` already produces, against the whole league) and stamped
with how far they got: `gauntlet`, `quarterfinalist`, `semifinalist`,
`finalist`, `champion`. The gauntlet week prints the teams the gauntlet
knocked out, the quarterfinals week its four losers, the semis their two, and
the finals week prints the runner-up and the Champion — every player in the
league exactly once, in the order they fell.

**Byes and TBD slots need nothing.** `eliminationsInWeek` names the loser of a
*decided* fixture and skips any fixture with a missing side, so the Academy's
six-team bracket — two teams with a quarterfinal bye — needs no special case:
a team with no quarterfinal fixture is simply not eliminated that week and
prints when its own round ends, and a semifinal or final seeded with a TBD
opponent is passed over until the names and the score are in. That is what
makes it safe to seed a whole bracket up front (the seed-bracket workflow
above). The week itself still counts as a playoff week the moment a playoff
fixture is scheduled in it, so an unscored round prints nothing and is filled
in later by the card-edition archive.

**The rules module.** `src/lib/cards/sendoff.ts` is pure and owns all of it:
`eliminationsInWeek` (the loser of each decided playoff fixture in an
Eastern week, plus the winner of the finals as `champion`; one entry per
team, later exit wins), `isPlayoffWeek`, `planSendoff` (the week's roster,
stamped with `withSendoff` and crowned off the week build with
`crownSendoff`), `sendoffVaultClosesAt` / `isSendoffVaulted`, and
`sendoffLedger` for the admin page. Fixtures come from `public.fixtures`
through `fetchSeasonFixtures` (`queries.ts`), which returns `[]` on error;
team names are matched with `normalizeTeamName` because fixtures carry
`league_teams.name` while a card's `teamName` is `raw_stats.team_name`, and
nothing enforces that the two spell a team identically. Teams a plan could
not match land in `plan.unmatched` and are logged with `[WARN]` by both
scripts.

**The stamp.** `PlayerCardData.sendoff` (`{ stage, exit, team, series, week }`)
rides on the card json, frozen on the `card_editions` row and on every pulled
copy, exactly like `live`, `chase` and `champWin`. **No migration:**
`card_editions.card` and `card_inventory.card` are jsonb and already carry
every other stamp. The renderer draws the whole print off the json (below),
`copyEditionLabel` names a copy "Send-off · Champion"
rather than by its Monday, and everything else that consumes editions
(packs, print runs, Eclipse, sets, team cards, Higher or Lower, moments)
keeps reading `PlayerCardData` from the archive unchanged.

**The print: Newsprint.** A send-off card is a page of the match-day
programme, and `PlayerCard3D` draws it as real layout off `card.sendoff`
(`globals.css`, "The Send-off (shipped)", beside `card-frame-champion`): a
cream page gutter, a **masthead** band across the top — THE SEND-OFF over
"PLAYOFF EDITION · {round} · {series}" under a black rule and a red press
rule — a **photo block** screened into halftone dots with the art filtered
to black ink, the **stage stamped** in rubber at the foot of it in the
stage's own accent (`SENDOFF_META`, the only source of those colours), and a
perforated **ticket stub** in the foot of the card carrying "ADMIT ONE" and
the card's own record (`W–L · WR%`, `PENTA ×n`, `LVL n`) in ink instead of
the dark footer row an ordinary card prints. The Champion's masthead is
struck in gold foil and its photograph keeps its colour; every other stage
prints in black. Because it is layout and not an overlay, the tier pill, the
rating ring and the print number flow BELOW the masthead onto the photograph
— the overlay mockup could only draw on top of them, which is how the
masthead landed on the OVR ring and `#001/99` landed on the masthead's
rules. A crowned send-off puts the Card of the Week pill on the coin strip's
row, so the extra line cannot push the last stat bar under the stub. Nothing
outside a send-off card changes: with no `card.sendoff`, the face renders
exactly as before.

**The builder.** `src/lib/cards/editionBuilder.ts` `buildEditionForWeek`
decides per week whether the edition is a weekly print or a send-off, so the
Tuesday drop (`scripts/weekly-card-drop.ts`) and the manual archiver
(`scripts/archive-card-edition.ts`) always agree. The season build is passed
in as a thunk: the drop already holds it, and an ordinary week must not pay
for a whole-season read it will not use.

**The teams through.** A playoff week's edition also carries every team that
advanced that week (`advancingInWeek`; never the finals winner, whose stop
is the Champion send-off, and never a gauntlet team the same night knocked
out) — but out of the WEEK build, not the season one. They are still
playing, so their card is the players-of-the-week card any other week would
have given them: rated on that week's games against that week's cohort,
unstamped, crowned with the send-offs as one roster. That crown is judged on
the WEEK build (`crownSendoff(printed, weekCards)`), which rates everyone
who played — fallen teams included — rather than on the printed roster's own
ratings: a send-off is season-rated, so ranking the two kinds of card
against each other would crown a player for their season on the night they
went out, handing mid of the week to a mid who lost in the gauntlet. The
crown lands on that player's printed card either way, send-off or week card,
and a role with nobody printed from the week build falls back to the best
card that prints. Only the send-off is season-rated, because only a finished
split needs the whole league as its cohort. `buildEditionForWeek` therefore
reads both builds on a playoff week and hands them to
`planSendoff(seasonCards, fixtures, week, weekCards)`; a team through that
no WEEK card matched lands in `SendoffPlan.unmatched` exactly as a fallen
team no season card matched does. `SendoffPlan.advancing` names them for the
drop's post and the admin dry run.

**The record line.** A stamped send-off prints the player's PLAYOFF RUN as
its `wins`/`losses`/`winratePct` — the games they played from the bracket's
first week onward — not the season's. `fetchSeasonCards` attaches it as
`PlayerCardData.playoffs`, counting each player's `raw_stats` rows from
`firstPlayoffWeek(fixtures)` (the schedule, not a row's `season_phase`: the
phase is a label the ingest was handed, the bracket is what the fixtures
say it is), and `sendoff.ts` swaps the line wherever a card is stamped —
the edition (`withSendoff`/`planSendoff`) and the live surfaces
(`stampSendoffs`, `weekRoster`). The RATING stays season-based: the whole
league is the only cohort that rates a finalist honestly, while the
season's W–L beside a bracket stamp reads as a series score nobody played
(a sub who went 2-0 in the regular season and 1-2 in the gauntlet printed
3–2). The season build's own cards and the week cards are untouched — they
keep the season's and the week's numbers — and so is `level`, which is
games played this season.

**On the live surfaces.** During the bracket, Browse, the hub, compare and
the teams page show the WEEK's roster (`weekRoster`) the way the week's
edition prints it: every team named in the week's playoff fixtures whose
split has already ended (`eliminationsSoFar`, bracket-wide) shows its season
cards wearing their send-off, and everyone still in the bracket shows the
week's own cards, the way a regular-season week shows the people who played
it — crowned per role across both off the WEEK build (`crownSendoff`), so
Card of the Week goes to whoever played the best week in that role rather
than to a send-off's bigger season number. So a player knocked out on Monday
IS their send-off everywhere by Tuesday, not only in the pack the shop mints
from. A card's own page (`fetchCardBySlug`) falls back to the stamped season
build (`stampSendoffs`) for a player off the week's roster (a bye, or a
split that ended in an earlier round) rather than "Card not found".

**The vault.** Send-off editions close `SENDOFF_VAULT_DAYS` (14) after the
finals fixture's `scheduled_at`. `openPackFor` reads the fixtures alongside
the edition weeks — before anything is charged — and refuses an explicitly
requested vaulted week; an unqualified open falls back to the newest week
still on sale rather than shutting the shop. `fetchEditionWeekInfo` leaves
vaulted send-offs out of the shop's picker entirely and labels the rest
("Week 3 · Sep 8" counting weekly prints only, or "Send-off · Finals" with
the closing date). With no dated finals the vault reads as open — refusing to
sell on a date nobody has set would close the shop over a scheduling gap.

**The admin page.** `/admin/sendoff` (staff-gated, mints and writes nothing)
previews the five stamps on real cards, dry-runs what Tuesday's drop would
print for the picked week, shows the bracket ledger and prints the shop
picker's rows as plain text. The picked week is this one by default;
`?week=YYYY-MM-DD` (a Monday, checked the way the drop checks
`FANTASY_WEEK`, junk ignored rather than thrown on) picks another, and the
pills list this week plus every week the season's playoff fixtures are
scheduled in — so a bracket week can be checked for name mismatches before
it is played and again once the scores land. Its look wall keeps the six prototypes
(`src/lib/cards/sendoffLooks.ts`): Newsprint is tagged **Shipped** and its
row renders with no overlay at all — the card draws itself — while the other
five (Plaque, Rafters, Curtain Call, Bracket, Yearbook) stay mockups on
PlayerCard3D's admin-only `overlay` prop, drawn OVER the shipped print, so
the alternatives can still be judged against what shipped.

**Pitfall: a playoff week with unscored fixtures prints nothing.** An
undecided fixture eliminates nobody, so the week's edition is empty and
`archiveEdition` leaves the week alone. That is deliberate — the alternative
is stamping somebody's one playoff card with a result that has not happened,
and editions freeze at mint. Once the scores are entered, re-run
`npx tsx scripts/archive-card-edition.ts YYYY-MM-DD` for that week (or wait
for the next drop if the week is still the current one) and the edition
appears.

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

### Season's End release and commerce

Season's End is intentionally not a `card_inventory` extension. The release
contract is a visible, league-scoped revision keyed by `(release_id, league,
season)`. `replace_season_end_draft_catalog` replaces a draft catalog in one
transaction, while database triggers reject design and frozen-input mutations
after `admin_test`. Approval requires the exact revision digest, a separately
recorded simulator report with passing signature/salvage gates, and fulfilled
admin openings from that exact revision before the state can become public. A
newer draft or public revision does not rewrite older copies or hide their
exact collection URLs. Releases missing the frozen contract are readable for
historical recovery but cannot start new openings.

The trusted server actions derive the Discord identity from the signed-in
session and call service-only RPCs. `begin_season_end_opening` binds the
request UUID, release revision, mode, price, signing book, rules, and economy
before charging; recovery checks the existing owner/request first, so pause,
membership loss, active-season rollover, or a newer revision cannot strand a
paid opening. Preparation locks the opening and stores the canonical design
payload; fulfillment mints five ordered rows plus provenance atomically.

Public copies use `season_end_inventory` only. The market adapters page
listings, wants, trades, and owned copies; settlement rechecks ownership,
expiry, and the public mode, locks copies and wallets in deterministic order,
and records the ownership transition. Listings and trades pin an ownership
version, so a promise becomes stale even if a copy later returns to the same
owner. Manual dust locks the copy, calculates the pinned economy quote, credits
one ledger entry, cancels conflicting commerce, marks the copy `dusted`, and
appends provenance without deleting the frozen payload. Season's End has its
own league-scoped auto-dust setting and service-only batch RPC. It keeps the
oldest active copy of each exact design, foil finish, and signature in each
release, dusts extra copies through the manual RPC after public openings, and
can clear existing duplicates from My Collection in batches of 200. The weekly
auto-dust rule never sees this inventory. No Season's End copy is accepted by
standard-card sets, lineups, expeditions, or player-card detail routes.

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

A coverage audit on 2026-09-14 found three tables the function had never been
taught about, added after it shipped. `20261016000001` closes them:
`card_print_runs` (the serial ledger — left behind, the next copy minted
restarts at 1 and re-stamps a number a collector already holds, while every
existing copy loses its denominator), `card_wants` (an open want on the old
slug can never be filled), and `opgg_url` on both `player_pool` and `players`.
The LEFTOVERS self-check now counts the first two, so a future miss reports a
non-zero total instead of looking clean. Counters are **summed** on a merge,
which is the only value no future stamp can collide with; copies minted before
the merge can still share a serial, and the report says so rather than
renumbering a card somebody is holding.

When you add a table with a name, tag or slug in it, add it to `rename_player`
in the same pull request. That is the whole contract — the function is only as
good as the list inside it.

`public.card_slug()` mirrors `cardSlug()` in `src/lib/cards/build.ts`. The two
are pinned to one shared case table — the pgTAP suite owns it and
`src/lib/cards/slugBridge.test.ts` reads those cases out of the `.sql` file
and asserts the TypeScript agrees, so the implementations cannot drift apart
silently. Add a case in the pgTAP file and both sides pick it up.

### The schedule and the gauntlet

`public.fixtures` is the calendar: one row per series, with `stage` (the
rulebook's five weeks, two gauntlet rounds and three playoff rounds),
`division` (null for every cross-division pairing), team names as plain text
so a slot can be TBD, `best_of`, `sort_order`, `scheduled_at` and the paired
scores. `src/lib/schedule/format.ts` holds the presentation contract for each
stage, `STAGE_META`, which is also where `best_of` defaults come from when an
admin changes a fixture's stage in the editor.

**Series lengths.** Regular-season weeks are Bo3, **gauntlet round 1 is a Bo1
and round 2 is a Bo3**, and the playoffs are Bo5. `best_of` is not decoration:
`settle_betting_market_from_stats` and `scripts/settle-betting-from-stats.py`
read it as the series threshold, so a round-2 row left at Bo1 settles a 2-1
series wrongly. The Send-off (`src/lib/cards/sendoff.ts`) reads the same rows
to print the gauntlet's losers, and skips a fixture with a missing team, so a
round-2 placeholder with a TBD opponent is safe to leave in place.

**The generators.** `/schedule`'s owner strip draws both phases rather than
having an admin type fixtures in by hand. The regular season is
`src/lib/schedule/generate.ts` behind `AdminGenerateSchedule`, which writes
from the browser client. The gauntlet is `src/lib/schedule/gauntlet.ts` — pure
seeding and pairing rules — behind the server actions in
`gauntlet-actions.ts` and the `AdminGenerateGauntlet` panel. Those are server
actions because the seeds come from `fetchHomepageStandings`, which composes
the featured draft, the season's fixtures and the series durations that settle
the standings' tiebreakers; `fetchStaffTier` gates the action and the writes
still go through the caller's cookie-bound client, so `fixtures_admin_write`
RLS remains the real gate. Drawing replaces only `gauntlet_r1`/`gauntlet_r2`
for that season, seeds round 1 across the divisions (Solari #5 v Lunari #6,
Lunari #5 v Solari #6) and leaves round 2 as Bo3 placeholders behind each 4th
seed; `seedRoundTwoAction` fills those opponents in from round 1's results.

**Where round 1's result comes from.** Both rounds are played the same
evening and the stats ingest only runs the next morning, so on the night the
round-1 fixtures are still unscored and the only record is what the captains
filed. `resolveRoundOneResult` therefore takes the fixture's own
`score_a`/`score_b` when it has them, and otherwise the newest `match_reports`
row for that fixture with a usable status (`pending`, `needs_sides`,
`ingested`, `forfeit`; `failed` is not evidence of anything). A report's
`team_a` is whichever side the captain entered first, so its score is aligned
to the FIXTURE's side order exactly the way `sync_fixture_score` does in
`scripts/riot_stats_ingest.py` — swapped when the sides are reversed, and
taken as NO result when the two cannot be matched by normalized name, because
a silently reversed result sends the wrong team into round 2. A tie is not a
result either. The preview reports each series' source and the panel says so
on screen, so an admin can see when a pairing rests on an un-ingested report.
Both `match_reports` and `league_teams` are world-readable
(`using (true)` plus a select grant to `anon`/`authenticated`), so this read
uses the caller's own cookie-bound client and no service-role key.

Premier only — `ACADEMY_EXCLUDED_STAGES` in
`src/lib/academy/filtering.ts` keeps the gauntlet off the Academy calendar.

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

## Verification and rollout

Use [Testing](testing.md#choose-checks-by-change) for check selection and
[Migration and release contracts](releases.md) for database rollout. For a
business-rule change, trace the caller through its authorization boundary to
the authoritative RPC; the domain sections above explain the relevant contracts.

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
