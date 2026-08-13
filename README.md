# FPL Draft League

A live auction draft board for a League of Legends fantasy-style league.
Admins set up a draft (teams, captains, player pool), then captains take
turns nominating players into an auction lot; everyone bids in real time
until a countdown expires and the lot sells to the highest bidder. Anyone
with the link can spectate the board live; only captains can bid, and only
admins can run setup and draft-night overrides.

**Roles**

- **Spectator** — anyone signed in (or not) can watch a draft's board live:
  current lot, countdown, bid feed, and every team's roster, over Supabase
  Realtime.
- **Captain** — signs in with Discord (or the dev email/password form
  locally), is linked to a team by an admin, and can nominate players and
  place bids for their team during their draft.
- **Admin** — creates and configures drafts (teams, captains, player pool
  via CSV paste), and during a live draft can pause/resume, undo the last
  sale, cancel or force-close the open lot, and change the countdown
  duration.

**Stack**: Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Supabase
(Postgres with a PL/pgSQL auction engine exposed as RPCs, Discord OAuth,
Realtime), Vitest, Playwright, pgTAP.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
  (the local Supabase stack runs in Docker)

## Local setup

```powershell
npm install
npx supabase start
```

`supabase start` prints local API URL and keys, e.g.:

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
```

Copy `.env.example` to `.env.local` and fill in the anon key from that
output (the URL is already the default local one):

```powershell
Copy-Item .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
```

(You can re-print these any time with `npx supabase status`.)

Then run the app:

```powershell
npm run dev
```

Open http://localhost:3000. On `/login`, local URLs additionally show a
dev email/password sign-in form below the Discord button (production only
shows Discord) — use this to sign in as any seeded user without a real
Discord account.

**Making yourself an admin locally**: sign up/in once so a `profiles` row
exists, then in the local Supabase Studio SQL editor (or via `psql`) run:

```sql
update profiles set is_admin = true where id = '<your auth user uuid>';
```

## Tests

```powershell
npx supabase test db   # pgTAP suite against the local DB (needs supabase start)
npm test                # Vitest unit test suite
npm run e2e              # Playwright: end-to-end smoke tests (auction + betting)
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

### Step 3 — Vercel

1. At [vercel.com](https://vercel.com), import the `SundayKoi/FPL_website`
   GitHub repo (framework is auto-detected as Next.js).
2. Set environment variables to the **new** cloud project's values (from
   its dashboard → Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
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
