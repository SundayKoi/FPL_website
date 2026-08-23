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
- player cards, weekly rating snapshots, card art, mottos, and share images.

See [docs/backend.md](docs/backend.md) for the backend architecture and the
source-file map intended for agents picking up work.

## Roles and access

- **Visitors** can browse public league pages, stats, cards, schedules, and
  public draft views.
- **Signed-in users** authenticate through Supabase Auth with Discord in
  production. Local development also exposes the email/password form.
- **Captains** are linked to league teams for a season and can perform the
  captain and match-report workflows for those teams.
- **Admins and owners** manage league data, drafts, fixtures, staff, and
  betting operations according to the database policies and domain gates.
- **Discord members** may receive additional access to betting and public
  lobby creation based on configured guild roles.

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
npx supabase test db     # pgTAP suite; local Supabase must be running
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
   - `DRAFTER_GUILD_ID` and `DRAFTER_ROLE_ID` when the premium lobby gate is
     enabled
   - `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` if the live-channel status
     feature is used
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
