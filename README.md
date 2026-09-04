# FPL League Platform

The FPL League Platform is a League of Legends fantasy-league site for the
Premier and Academy leagues. It combines league operations, live drafting,
match reporting, stats, betting, and player-card features in one Next.js app.

The original live auction draft is still a core workflow: captains nominate
players, teams bid in real time, and a database transaction settles each lot.
The site now also includes:

- league and season administration, teams, rosters, fixtures, schedules, and
  captain tools;
- Riot match-stat ingestion, aggregate stats views, standings, weekly briefs,
  and match-report workflows;
- a parimutuel betting exchange, pick'ems, a points wallet, staff tooling, and
  Discord commands/interactions;
- fixture-based and public token-based champion drafts, including realtime
  presence and draft state; and
- player cards, weekly rating snapshots, card art, mottos, and share images;
- Premium daily games: FPL'dle, the 45-round Higher or Lower card run with unlimited attempts, and the admin-testing Guess the Card game share one daily betting-dollar reward.

See [docs/backend.md](docs/backend.md) for the backend architecture and the
source-file map intended for agents picking up work.

## Navigation

FPL and FPL Academy are paired experiences with the same information
architecture. The active brand in the header identifies the current league;
selecting the FPL/FPL Academy brand opens the league chooser, which owns league
switching and preserves the current paired destination (including supported
query strings). Premium HQ is the intentional exception: its Premier/Academy
toggle keeps the selected card and fantasy destinations in the same league.

The header provides three direct links for the active league: **Stats**,
**My Team**, and **Cards**. Cards stays highlighted across both leagues'
collection hubs, the single-card share pages, and public binders. The grouped
menus are:

- **League** — Players, Teams, Schedule, and Auction Draft for the active
  league.
- **Premium** — Premium HQ, Betting, The Daily Stu, Match Drafter, FPL'dle,
  Higher or Lower, and Guess the Card, with the league-aware entries pointing
  at the active league.
- **Info** — Info, Sign Up, League Links, Rulebook, and Support the Devs.

Premium HQ remains the gated hub for Betting, The Daily Stu, Player Cards,
Draft League, Match Drafter, and the card economy.

Admin and Broadcaster appear as conditional Staff entries inside Info. Their
visibility is only a presentation hint: `/admin` and `/broadcaster` retain
their existing server-side access checks and redirect or deny unauthorized
users regardless of what the header displays.

## Roles and access

- **Visitors** can browse public league pages, stats, cards, schedules, and
  public draft views.
- **Signed-in users** authenticate through Supabase Auth with Discord in
  production. Local development also exposes the email/password form.
- **Approved player identities** whose stored league team is active use the
  paired `/my-team` and `/academy/my-team` dashboards for that team’s
  schedule, roster, private tournament codes, draft viewing, and opponent
  scouting. A player links their signed-in profile by claiming an exact public
  roster spot, then waits for captain or admin approval.
- **Captains** are linked to league teams for a season independently of player
  identity. They retain My Team access and captain-only result reporting for
  those teams, and can approve or reject claims for their current roster.
- **Admins and owners** manage league data, drafts, fixtures, staff, and
  betting operations according to the database policies and domain gates.
- **Admins** can link a canonical player to an existing signed-in profile,
  manage all identity claims, and select an active team from My Team’s admin
  tools. Owners retain only the owner capabilities granted by the applicable
  existing route and database policy.
- **Broadcasters** can open the private broadcaster workspace and maintain the
  Premier/Academy featured-matchup presentation; owners inherit broadcaster
  workspace access, while admins do not.
- **FPL Premium members** receive Premium HQ and premium feature access from
  the configured Discord guild role. The hub's locked state links to the
  official payment resource from League Links.

## Stack and repository map

Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase
(Auth, Postgres, RLS, PL/pgSQL RPCs, Realtime, and Edge Functions), Vercel,
GitHub Actions, Vitest, Playwright, and pgTAP. Riot, Discord, Twitch, and
Anthropic are external integrations used by specific workflows.

- `src/app/` — App Router pages, server actions, auth callback, API routes,
  share-image routes, and the Discord interactions endpoint.
- `src/components/` — page and interactive UI components.
- `src/lib/` — domain queries, rules, formatting, access checks, Supabase
  clients, and reusable server/client logic.
- `src/app/my-team/` and `src/app/academy/my-team/` — the paired, role-aware
  My Team routes. The older Captain routes remain redirect-only compatibility
  URLs.
- `supabase/migrations/` — the complete append-only database history: tables,
  views, RLS policies, grants, triggers, and RPCs.
- `supabase/tests/` — pgTAP database contract and authorization tests.
- `supabase/functions/` — Deno Edge Functions, currently the scheduled
  Discord betting announcer/watchdog.
- `scripts/` — local seeders, stats ingestion, scheduled-job entry points,
  Discord registration, and data utilities.
- `.github/workflows/` — nightly stats ingestion and weekly homepage/card jobs.
- `e2e/` — Playwright specs and their self-seeding fixtures.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.9+ (Node 22 is recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
  (the local Supabase stack runs in Docker)

## Local setup

The quickest path is the repository helper. It checks Node and Docker,
starts local Supabase, updates `.env.local` with the local API URL and anon
key, and starts Next.js:

```sh
npm run run-locally
```

For a manual setup:

```sh
npm install
npx supabase start
cp .env.example .env.local
npx supabase status
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local` from `supabase status`. The local defaults are
`http://127.0.0.1:54321` and the local anon key. `.env.example` also lists
server-only integration variables; never expose or commit
`SUPABASE_SERVICE_ROLE_KEY`, Riot keys, bot tokens, or other secrets.

Open http://localhost:3000. On `/login`, local URLs show a dev
email/password sign-in form below the Discord button. Use it with the seeded
users or another local Supabase Auth user without a real Discord account.

To build a full local demonstration draft and betting fixture:

```sh
npm run seed:demo
```

The script is idempotent and creates the demo users described in
`scripts/seed-demo.ts`.

**Making yourself an admin locally**: sign up/in once so a `profiles` row
exists, then in the local Supabase Studio SQL editor (or via `psql`) run:

```sql
update profiles set is_admin = true where id = '<your auth user uuid>';
```

## Tests and checks

```sh
npm run lint             # ESLint
npm test                 # Vitest unit/component suite
npm run build            # production Next.js build
npm run test:db          # pgTAP suite; local Supabase must be running
npm run e2e              # Playwright auction + betting smoke tests
```

Notes on `npm run e2e`:
- Requires the local Supabase stack running (`npx supabase start`) and the
  dev server reachable at `http://localhost:3000` (Playwright's
  `webServer` config will start `npm run dev` for you if it isn't already
  running).
- Both specs seed themselves — no manual `npm run seed:demo` needed first:
  `draft.spec.ts` shells out to `npx tsx e2e/seed.ts`, which builds a fresh
  "E2E Draft" with two captains and a small player pool, and
  `betting.spec.ts` shells out to `npx tsx e2e/seed-betting.ts`, which
  builds a member + admin dev-login user and a two-team betting market
  (`scripts/betting-fixture.ts`). Both resolve the local Supabase
  **service_role** key themselves by calling `npx supabase status -o json`
  (no need to set anything by hand, unless you've already exported
  `SUPABASE_SERVICE_ROLE_KEY` in your shell).
- Playwright is configured single-worker / not fully parallel
  (`playwright.config.ts`), since the test drives two real browser
  contexts against one shared draft — do not raise the worker count.

For database or authorization changes, run the pgTAP suite as well as the
relevant Vitest tests. For realtime or multi-user changes, run the auction or
match-draft Playwright coverage when the local stack is available.

### Branches and releases

- **`develop`** is where work lands. Every pull request targets it. Vercel
  never builds it (see below), so merging there costs nothing.
- **`main`** is what Vercel deploys. Nobody merges to it by hand.
- **Releasing** is `.github/workflows/release.yml`: every Monday at 13:00
  UTC, and on demand from the Actions tab (**Release to production → Run
  workflow**), it merges `develop` into `main` with a merge commit and
  Vercel builds once. It refuses when CI on `develop` is not green, and
  does nothing when `develop` has nothing `main` lacks.
- **A hotfix** that cannot wait for Monday is the same thing run by hand:
  merge to `develop`, then run the release workflow.

### CI and what Vercel builds

`.github/workflows/ci.yml` runs the type-check, ESLint and the Vitest suite
on every pull request and every push to `main`. Make it a required check on
`main`; once it is, `typescript.ignoreBuildErrors: true` in `next.config.ts`
takes the type-check out of the Vercel build minute, since CI has already
run it.

Vercel builds are billed per CPU-minute rounded up, and most builds here
were building nothing anyone looked at, so `vercel.json` points the Ignored
Build Step at `scripts/vercel-ignore.sh`:

- **Previews are off.** A push to a normal branch, `develop` included, does
  not build. Push a branch named `preview/<anything>` when you want a
  preview URL.
- **Production builds only when shipped files changed.** A release that
  only touches docs, migrations, scripts or workflows keeps the deployment
  it already has. The list of shipped paths is in the script; add to it if
  a new root config file starts feeding `next build`.

## Deploy runbook

This app needs its own Supabase cloud project, a Discord OAuth app, and a
Vercel deployment. Each step below needs a human logged into that
service's dashboard in a browser.

> **Do not touch the existing "ocepp" Supabase project.** This app must
> get a **brand-new, separate** Supabase project — the free tier allows
> up to 2 active projects, so create a second one rather than linking or
> pushing migrations into "ocepp". Before running `supabase db push` (or
> any destructive command), re-check `npx supabase projects list` / the
> project ref you passed to `supabase link` and confirm it is the **new**
> project, not "ocepp".

### Step 1 — Create the Supabase cloud project and push migrations

1. At [supabase.com](https://supabase.com), create a **new** project
   (free tier). Note its project ref (the short id in its dashboard URL
   and in `https://<ref>.supabase.co`).
2. From the repo root:

   ```powershell
   npx supabase login
   npx supabase link --project-ref <new-project-ref>
   ```

   Double-check the ref you just linked is the new project's, not
   "ocepp", before continuing.

   ```powershell
   npx supabase db push
   ```

   This applies every migration in `supabase/migrations/`.
3. Verify in the cloud project's SQL editor:

   ```sql
   select count(*) from pg_proc where proname in ('nominate','place_bid','close_lot');
   ```

   Expect `3`.

### Step 2 — Discord OAuth app

1. At [discord.com/developers](https://discord.com/developers/applications) →
   New Application → OAuth2.
2. Add redirect URL: `https://<new-project-ref>.supabase.co/auth/v1/callback`
3. Copy the Client ID and Client Secret into the Supabase dashboard →
   Authentication → Providers → Discord, and enable the provider.
4. In Supabase → Authentication → URL Configuration: set **Site URL** to
   the Vercel production URL (you'll have this after Step 3 — come back
   and set it), and add `http://localhost:3000` under **Additional
   Redirect URLs** (so local dev keeps working against the cloud
   project if you ever point `.env.local` at it).
5. For Discord slash commands, buttons, and modals, set the Discord
   application's **Interactions Endpoint URL** to
   `https://<site-origin>/api/discord/interactions`. Copy the application's
   public key into `DISCORD_PUBLIC_KEY` and register the commands with
   `npm run register:discord-commands` using the bot/app environment values.
   That script is the only thing that tells Discord which commands exist, so
   re-run it after any change to `src/lib/betting/discord/commandDefs.ts` —
   including the card commands `/rip` (open the free daily pack) and `/flex`
   (post a card out of your collection, pictured as the copy you own — the
   player and copy options autocomplete from what you hold).

### Step 3 — Vercel

1. At [vercel.com](https://vercel.com), import the `SundayKoi/FPL_website`
   GitHub repo (framework is auto-detected as Next.js).
2. Set the environment variables described in `.env.example`. At minimum,
   production needs:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; required by trusted server
     actions such as public-lobby creation and betting)
   - `DISCORD_PUBLIC_KEY` (for `/api/discord/interactions`)
   - `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and the configured betting role
     IDs when Discord-gated betting is enabled
   - `DISCORD_GUILD_ID` and `DISCORD_REQUIRED_ROLE_ID` for the shared FPL
     Premium gate (the older `DRAFTER_GUILD_ID`/`DRAFTER_ROLE_ID` names remain
     supported as a fallback)
   - `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` if the live-channel status
     feature is used
   - `CRON_SECRET` (any random string) so the Vercel cron in `vercel.json`
     can call Showdown's sweep every minute; without it the sweep refuses
     to run and a table nobody has open only moves when someone opens it
3. Deploy.
4. Go back to Step 2's URL Configuration and set **Site URL** to the
   resulting Vercel production URL.

### Step 4 — Production smoke test

1. Visit the deployed site and sign in with a real Discord account.
2. In the Supabase dashboard (Table editor or SQL editor), set that
   account's profile to admin:

   ```sql
   update profiles set is_admin = true where id = '<uuid>';
   ```
3. As that admin, create a small 2-team draft, link two real Discord
   accounts as captains, and run one auction from two different
   devices (e.g. phone + laptop).
4. Verify the countdown stays in sync between devices and the lot
   settles (player moves to the winning roster) on both without a
   refresh.

## Draft night ops

- **Make someone admin**: `update profiles set is_admin = true where id = '<uuid>'`
  in the Supabase SQL editor (find the uuid in the `profiles`/`auth.users`
  table by their Discord email or username).
- **Admin controls during a live draft** (visible on the draft board to
  admins only):
  - **Pause / Resume** — freezes the countdown; resuming restarts the
    clock (pausing does not change the sale time, only resuming does).
  - **Undo last sale** — returns the most recently sold player to the
    pool and refunds the winning team's spend.
  - **Cancel lot** — cancels the currently open lot; the nominator keeps
    their turn.
  - **Force close** — immediately ends the open lot and sells to the
    current highest bidder.
  - **Countdown (s)** — change the lot countdown duration (5–300s) for
    the rest of the draft.
- **Player pool CSV import**: paste one player per line as
  `name,role[,rank[,opgg_url]]` (role is one of the game's five roles;
  rank and the op.gg URL are optional) in the admin draft setup page.
- **Free-tier limits** — plan around these on the Supabase project used
  for the real draft:
  - Realtime supports roughly 200 concurrent connections on the free
    tier — plenty for a league draft, but don't leave the board open in
    dozens of idle tabs.
  - A free-tier project **auto-pauses after about a week of inactivity**.
    Open the Supabase dashboard for the project some time before draft
    night to wake it up, and confirm the site loads, before everyone
    joins.

## Draft data export

Every pick and ban made in the match drafter can be pulled out as a
spreadsheet or JSON with a read-only script. It uses the website's public
keys — no secret needed — so anyone with the repo can run it:

```bash
export NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
npm run export:drafts -- --season=S5 --out=s5-drafts.csv
npm run export:drafts -- --format=json --complete-only --out=drafts.json
npm run export:drafts -- --team="Neon Dynasty" --stage=week_3
npm run export:drafts -- --open            # include the public /drafter lobbies
```

No local setup at all: the **Export drafts** workflow under the repo's
Actions tab runs the same script on GitHub (pick season, stage, team,
format) and attaches the file to the run as an artifact named `drafts`.

CSV is one row per draft step (twenty per game): season, stage, fixture,
game number, side, team, pick or ban, slot, overall pick/ban order, whether
it was the game's first pick, the champion, the player who drafted it, and
the role once captains confirmed positions. JSON is one object per game
with each side's bans and picks in order. The column list is at the top of
`scripts/export-drafts.ts`.

## Stats ingestion

Game-night League of Legends stats are pulled from the Riot API and
written directly to `public.raw_stats` in Supabase by
`scripts/riot_stats_ingest.py`. **The old Google Sheets flow (gspread +
`credentials.json`) is retired** — Supabase is now the source of truth for
stats, and the `/stats` page reads from it.

Run it after a game night, once you know the season/phase to tag the
games with:

```powershell
# Explicit match ids
python scripts/riot_stats_ingest.py NA1_5558429844 NA1_5558431122 --season S5 --phase Regular

# Or discover match ids from the players in PLAYER_RIOT_IDS (scripts/riot_stats_ingest.py)
# across a date window, filtered to the custom-game queue:
python scripts/riot_stats_ingest.py --dates 2026-08-11 --season S5 --phase Regular

# Preview the mapped rows without writing anything to Supabase:
python scripts/riot_stats_ingest.py NA1_5558429844 --dry-run
```

Setup:

1. `pip install requests python-dotenv`
2. Copy `.env.example` to `.env` and fill in `RIOT_API_KEY`, `SUPABASE_URL`,
   and `SUPABASE_SERVICE_ROLE_KEY` (the ingester writes with the service
   role key, bypassing RLS, so guard `.env` like any other secret).
3. `--season`/`--phase` are required for a real write (they fill the
   `season`/`season_phase` columns); omit them only with `--dry-run`.

Writes are idempotent: rows POST to `raw_stats` with
`Prefer: resolution=ignore-duplicates` on the `(match_id, summoner_name)`
unique index, so re-running the ingester for a night you've already
imported is a safe no-op for existing rows.

### Team names (`team_name`)

Riot match data has no concept of an FPL fantasy team — it only knows Riot
IDs and in-game side (Blue/Red) — so the ingester cannot derive
`team_name` on its own. Left unfilled, `team_name` lands `NULL` for those
rows. Three views/tabs treat that gracefully rather than breaking: the
Teams tab's `stats_team_agg` excludes null/blank-`team_name` rows from
standings entirely (a player's individual/champion stats are unaffected),
and the Timeline tab's `stats_game_log` displays `'Unknown'` in place of a
blank team name (see migration `20260810100005_null_team_guard.sql`). But
a player's games still won't show up under their real team on the Teams
tab until `team_name` is filled in, one of two ways:

**Option A — `--team-map` at ingest time (preferred for ongoing use).**
Pass a JSON file mapping each player's `"SummonerName#TAG"` Riot ID to
their FPL team name; the ingester fills `team_name` from it for every
matched participant, leaving unmatched players blank (same as passing
nothing):

```json
{
  "AfkBoulder#c9win": "Blue Squad",
  "DeFaux#ttm": "Red Squad"
}
```

```powershell
python scripts/riot_stats_ingest.py NA1_5558429844 --season S5 --phase Regular --team-map team_map.json
```

If any rows still end up with a null `team_name` after a real (non
`--dry-run`) write — a player missing from the map, or `--team-map` never
passed — the ingester prints a loud `[WARN]` block at the end listing
exactly which players, so it isn't a silent gap.

**Option B — backfill after the fact.** Update the already-written rows
directly in Supabase once you know each player's team for that season,
e.g. via the SQL editor or `psql`:

```sql
update raw_stats
set team_name = 'Blue Squad'
where summoner_name in ('AfkBoulder', 'DeFaux')
  and season = 'S5';
```

Run one `update` per team (adjust the `summoner_name` list and
`team_name` value), then re-check the Teams tab for that season. This is
also the right approach for backfilling seasons ingested before
`--team-map` existed.

### Nightly ingest from match reports (`--from-reports`)

Captains file finished series on `/captain` (or `/matches`), which queues
rows in `match_reports`/`match_report_games`. A GitHub Actions workflow —
[`.github/workflows/ingest-stats.yml`](.github/workflows/ingest-stats.yml)
— runs `python scripts/riot_stats_ingest.py --from-reports` nightly at
02:00 EST / 03:00 EDT (`cron: "0 7 * * *"`, GitHub cron is UTC-only and
doesn't adjust for DST) and is also runnable on demand. This is now the
normal path for game-night stats; the manual `--dates`/explicit-match-id
invocations above stay available for one-off backfills.

**Manual trigger**: GitHub → Actions tab → "Ingest match reports" → **Run
workflow**. Useful for testing after a report is filed, or to retry after
fixing a `failed` report on `/captain`.

**Repo secrets** (Settings → Secrets and variables → Actions), same three
values as the local `.env`:

- `RIOT_API_KEY` — a **personal** Riot key (doesn't expire daily like a
  development key).
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**What it does**, per report with `status` in `pending`/`needs_sides`:
for each game, skip it (and mark it `ingested`) if its match id is
already in `raw_stats`; otherwise fetch the match from Riot, resolve
which side (Blue/Red) is which FPL team, write the stats rows with
`team_name` set from the resolved side and `season`/`season_phase` from
the report itself (not `--season`/`--phase` — each report carries its
own, since a nightly batch can span multiple), and mark the game
`ingested`. Once every game in a report is `ingested`, it tallies game
wins per team and compares them to the reported score, setting
`warning_text` (shown on `/captain`) on a mismatch — this catches a
mistyped match id without blocking the ingest.

**`needs_sides`**: side resolution works two ways — a game's `blue_team_id`
being set explicitly (from the reporting form) wins immediately; otherwise
the ingester looks up each of the ten players' Riot ID in
`roster_memberships` for that season and tallies which of the report's two
teams show up on which side. If that tally comes back ambiguous (no
roster matches, or conflicting ones), the game is marked `needs_side` and
the report `needs_sides`. Fix it on `/captain`: a `needs_sides` report
shows an inline "which team was blue?" picker per unresolved game for
captains and admins to set; picking a side flips the report back to
`pending` for the next nightly run (or a manual trigger) to pick up.

A report that ends `failed` (a Riot fetch error, an unknown match id, or
a Supabase write failure) needs an admin to fix the underlying issue and
retry it from `/captain` — `failed` reports are **not** re-attempted
automatically (only `pending`/`needs_sides` are re-fetched), and the
workflow run exits non-zero (so GitHub emails the repo owner) whenever
any report ends `failed`.

> **Riot API key regeneration warning.** The predecessor script
> (`updated_stats.py`, since deleted) had a live Riot API key hardcoded in
> its source. That file was never committed to git, but it existed as a
> local working file whose contents (including the key) were shared
> outside of git. Treat that key as compromised regardless — regenerate a
> new key at the [Riot Developer Portal](https://developer.riotgames.com/)
> and put it only in `.env` (gitignored), never in a script.

## Weekly card draw

Every card copy in circulation is one raffle ticket. A GitHub Actions
workflow — [`.github/workflows/weekly-draw.yml`](.github/workflows/weekly-draw.yml)
— runs `npx tsx scripts/weekly-draw.ts` Tuesdays at 15:30 UTC
(`cron: "30 15 * * 2"`, GitHub cron is UTC-only), half an hour after the
weekly card drop, so the week it draws is finished. For each card season
it calls the `run_weekly_draw` RPC, which picks one copy uniformly at
random, stamps it with a winner's laurel, pays the pot into the owner's
betting balance, and comps them a standard pack — then posts the winner to
the cards Discord. The week's winner shows on `/cards` (`/academy/cards`),
and every past week on `/cards/draw` (`/academy/cards/draw`).

**Manual trigger**: GitHub → Actions tab → "Weekly card draw" → **Run
workflow**. Leave **week** blank to draw the last completed week; set it to a
Monday (`YYYY-MM-DD`) to draw a week the cron missed. A non-Monday is
rejected rather than opening an off-grid week.

**Environment secrets** (Settings → Environments → `Production`, the same
place the card drop reads them):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DISCORD_CARDS_WEBHOOK_URL` — only the announcement needs it; without it
  the draw still records, pays, and comps, it just says nothing.

**Admin fallback**: `/schedule` has a **Run the draw** button for the Tuesday
the cron doesn't fire. It draws the last completed week (the date isn't
typeable there) and posts nothing to Discord. The RPC is idempotent, so a
workflow run and a button press — in either order, or overlapping — still
leave exactly one winner per week; the later one just reports who already
won.

## Card expeditions

Send three owned cards out for a stretch of hours and collect what they
bring back. `/cards/expeditions` (`/academy/cards/expeditions`) offers three
runs — Scouting Run (8h, ungated), Deep Raid (24h, 12 shine and a foil),
and Legend Hunt (48h, 20 shine, two foils and an autograph) — where shine
is what a squad's card tiers, parallels, and autographs add up to. Each day
also carries a brief that pays 20% more when the squad fields the named
role. A finished run pays betting dollars, sometimes comps a pack, and
sometimes brings one of the three cards home wearing an expedition mark
(Trail, Sigil, or the gilded Legend). Everyone gets one launch a day;
patrons get two.

Nothing is scheduled: a run resolves on its own clock and the owner claims
it from that page. Deployed copies are locked — the dust and trade screens
hide them, and `card_inventory_expedition_guard` refuses the write anyway —
so a squad comes home before it can be melted or traded. Every tunable
(entry gates, durations, odds, payouts) is in
[`src/lib/expeditions/config.ts`](src/lib/expeditions/config.ts), so a
balance pass is a one-file change; `expectedDailyDollars` fails a test if a
tier's day starts earning more than a pack costs. A Legend Hunt jackpot
posts to the cards Discord webhook (`DISCORD_CARDS_WEBHOOK_URL`); without
it the claim still pays.
