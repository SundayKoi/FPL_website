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
npm run e2e              # Playwright: end-to-end auction smoke test
```

Notes on `npm run e2e`:
- Requires the local Supabase stack running (`npx supabase start`) and the
  dev server reachable at `http://localhost:3000` (Playwright's
  `webServer` config will start `npm run dev` for you if it isn't already
  running).
- It seeds itself: the spec shells out to `npx tsx e2e/seed.ts`, which
  builds a fresh "E2E Draft" with two captains and a small player pool
  using the local Supabase **service_role** key. It resolves that key
  itself by calling `npx supabase status -o json` (no need to set anything
  by hand, unless you've already exported
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
