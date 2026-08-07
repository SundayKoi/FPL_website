# Auction Draft Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A realtime auction draft board (Vercel + Supabase free tiers) where captains bid points on role-locked players, admins run the draft, and spectators watch live.

**Architecture:** Next.js (App Router, TypeScript) is a thin UI over Supabase. All draft rules live in Postgres `SECURITY DEFINER` RPCs (`nominate`, `place_bid`, `close_lot`, admin ops) so concurrent bids serialize on row locks. The countdown is a `closes_at` timestamp; clients render it against fetched server time and any client may call the idempotent `close_lot` at zero. Supabase Realtime (postgres_changes) pushes every mutation to all open boards.

**Tech Stack:** Next.js 15 (App Router, TS strict), Tailwind CSS, @supabase/supabase-js + @supabase/ssr, Supabase CLI (local stack, migrations, pgTAP tests via `supabase test db`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-07-draft-board-design.md` — read it before starting any task.

## Global Constraints

- Free tiers only: Vercel Hobby + Supabase Free. No paid add-ons, no extra hosts, no long-running servers.
- All draft rules enforced in Postgres RPCs. The browser never decides anything; client-side eligibility checks are cosmetic mirrors only.
- Roles enum exactly: `top, jungle, mid, adc, support`. Roster = 5 role-locked slots; captains enter with exactly 2 pre-filled (captain + free-agency), draft exactly 3.
- Round minimums `{10,5,1}`; bids raise by ≥ 1; max-bid cap: a team must keep ≥ 1 point per *other* unfilled role.
- Nomination = opening bid at round minimum. Round = one full nomination pass. Round-1 order admin-set, snaking each round. Only captains needing the role may nominate/bid.
- Per-team budgets are admin-set and may differ.
- Spectators need no login; draft data is publicly readable via RLS `select` policies. No table is writable except through RPCs or admin policies.
- Discord OAuth for captains/admins in production. Local/e2e testing uses email+password auth (the profile trigger is provider-agnostic).
- Countdown default 15s, admin-configurable (5–300).
- Never trust client clocks: countdowns derive from `closes_at` + server-time offset from `get_server_time()`.
- Migrations are append-only under `supabase/migrations/`; never edit an applied migration — add a new one.
- Commit after every green test cycle. Conventional-commit style messages, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
supabase/
  config.toml                                (Task 2 — CLI-generated; enable email auth for local)
  migrations/
    20260807000001_schema.sql                (Task 3 — enums, tables, RLS, realtime, helpers, profile trigger)
    20260807000002_nominate.sql              (Task 5)
    20260807000003_place_bid.sql             (Task 6)
    20260807000004_close_lot.sql             (Task 7 — includes turn/round advancement)
    20260807000005_start_draft_pause.sql     (Task 8 — start_draft, pause/resume, update settings)
    20260807000006_admin_overrides.sql       (Task 9 — cancel, force close, undo)
  tests/
     0001_schema_test.sql                    (Task 3)
     0002_fixture_test.sql                   (Task 4 — proves the fixture builder)
     0003_nominate_test.sql                  (Task 5)
     0004_place_bid_test.sql                 (Task 6)
     0005_close_lot_test.sql                 (Task 7)
     0006_lifecycle_test.sql                 (Task 8)
     0007_admin_overrides_test.sql           (Task 9)
    helpers/_fixtures.sql                    (Task 4 — shared helpers, loaded by `\ir` from each test; in a subdirectory so the test runner doesn't execute it as a test)
src/
  lib/supabase/client.ts                     (Task 10 — browser client)
  lib/supabase/server.ts                     (Task 10 — server/route-handler client via @supabase/ssr)
  lib/draft/types.ts                         (Task 10 — row types + enums)
  lib/draft/derive.ts                        (Task 12 — pure helpers: open roles, max bid, eligibility reasons)
  lib/time.ts                                (Task 11 — server-time offset)
  hooks/useCountdown.ts                      (Task 11)
  hooks/useDraftState.ts                     (Task 12 — realtime subscription + auto-close)
  app/layout.tsx, app/page.tsx               (Task 1 scaffold; Task 10 adds auth header)
  app/auth/callback/route.ts                 (Task 10)
  app/login/page.tsx                         (Task 10)
  app/draft/[id]/page.tsx                    (Task 13)
  components/draft/CenterStage.tsx           (Task 13)
  components/draft/TeamColumn.tsx            (Task 13)
  components/draft/PlayerPool.tsx            (Task 13)
  components/draft/BidFeed.tsx               (Task 13)
  components/draft/BidControls.tsx           (Task 14)
  components/draft/NominationPicker.tsx      (Task 14)
  components/draft/AdminStrip.tsx            (Task 15)
  app/admin/page.tsx                         (Task 15 — draft list/create)
  app/admin/[draftId]/page.tsx               (Task 15 — teams, budgets, pool CSV, captain links, start)
e2e/draft.spec.ts                            (Task 16)
```

**Error-code convention (used by every RPC and mirrored in the UI):** RPCs fail with `raise exception 'CODE: human message'` where `CODE` is one of `NOT_LIVE, NOT_YOUR_TURN, PLAYER_TAKEN, ROLE_FILLED, BID_TOO_LOW, OVER_CAP, LOT_CLOSED, LOT_EXPIRED, ALREADY_LEADING, NOT_ADMIN, NOT_CAPTAIN, LOT_OPEN_EXISTS, SETUP_INVALID`. The client splits on the first `:` to map codes to friendly toasts.

---

### Task 1: Scaffold the Next.js app (and remove the Python venv)

**Files:**
- Delete: `venv/`
- Create: Next.js scaffold at repo root (`package.json`, `src/app/*`, `tsconfig.json`, `next.config.ts`, Tailwind config)
- Modify: `.gitignore` (append Node/Next entries)

**Interfaces:**
- Produces: a building Next.js 15 TypeScript app with Tailwind, `src/` dir, App Router, import alias `@/*` → `src/*`. All later TS tasks assume this.

- [ ] **Step 1: Remove the venv**

```powershell
Remove-Item -Recurse -Force venv
```

- [ ] **Step 2: Scaffold Next.js into the existing repo**

`create-next-app` needs an empty dir; scaffold into a temp dir and move contents up:

```powershell
npx create-next-app@latest tmp-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-git
Get-ChildItem tmp-scaffold -Force | Where-Object { $_.Name -ne '.git' } | Move-Item -Destination .
Remove-Item -Recurse -Force tmp-scaffold
```

If `.gitignore` conflicts, merge: keep existing Python/env lines, append the scaffold's Node lines (`node_modules/`, `.next/`, `*.tsbuildinfo`, `.vercel`, `.env*.local`).

- [ ] **Step 3: Verify it builds and runs**

```powershell
npm run build
```
Expected: build succeeds. Then `npm run dev` briefly and load http://localhost:3000 — default page renders.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "chore: scaffold Next.js app, remove Python venv"
```

---

### Task 2: Local Supabase stack + environment wiring

**Files:**
- Create: `supabase/config.toml` (CLI-generated, then edited), `.env.local`, `.env.example`
- Modify: `.gitignore` (ensure `.env.local` ignored; `supabase/.temp/` too)

**Interfaces:**
- Consumes: Task 1 scaffold.
- Produces: running local stack; `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars that Tasks 10+ read. Email auth enabled locally.

- [ ] **Step 1: Install CLI and init**

```powershell
npm install supabase --save-dev
npx supabase init
```
(Requires Docker Desktop running. If `supabase init` asks about VS Code settings, decline.)

- [ ] **Step 2: Enable email auth for local/test use**

In `supabase/config.toml` confirm (default is enabled):

```toml
[auth.email]
enable_signup = true
enable_confirmations = false
```

- [ ] **Step 3: Start the stack and capture keys**

```powershell
npx supabase start
npx supabase status
```
Expected: status prints API URL `http://127.0.0.1:54321`, anon key, service_role key.

- [ ] **Step 4: Write env files**

`.env.local` (real local values from `supabase status`):
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from status>
```
`.env.example` (committed, placeholder values, same two keys).

- [ ] **Step 5: Verify env ignore rules**

`git status` must NOT list `.env.local`. `.env.example` must be listed.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "chore: add local Supabase stack and env wiring"
```

---

### Task 3: Schema migration — enums, tables, RLS, realtime, helpers

**Files:**
- Create: `supabase/migrations/20260807000001_schema.sql`
- Test: `supabase/tests/0001_schema_test.sql`

**Interfaces:**
- Produces (everything later SQL/TS relies on):
  - Enums `lol_role ('top','jungle','mid','adc','support')`, `draft_status ('setup','live','paused','complete')`, `acquisition_type ('captain','free_agency','auction')`, `lot_status ('open','sold','cancelled')`.
  - Tables `profiles, drafts, teams, players, lots, bids` (columns below — treat as canonical).
  - Helpers: `public.is_admin() returns boolean`, `public.open_roles(p_team_id uuid) returns lol_role[]`, `public.caller_team(p_draft_id uuid) returns public.teams` (raises `NOT_CAPTAIN` if none), `public.get_server_time() returns timestamptz`.
  - Trigger `on_auth_user_created` → inserts a `profiles` row from any auth provider's metadata.
  - RLS: public `select` on all six tables; admin-only writes on `drafts/teams/players` (setup CRUD); **no** other direct writes.
  - All six tables added to the `supabase_realtime` publication.

- [ ] **Step 1: Write the failing schema test**

`supabase/tests/0001_schema_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public','profiles','profiles exists');
select has_table('public','drafts','drafts exists');
select has_table('public','teams','teams exists');
select has_table('public','players','players exists');
select has_table('public','lots','lots exists');
select has_table('public','bids','bids exists');
select has_type('public','lol_role','lol_role enum exists');
select has_function('public','is_admin','is_admin() exists');
select has_function('public','open_roles', array['uuid'], 'open_roles(uuid) exists');
select has_function('public','get_server_time','get_server_time() exists');

-- RLS is on everywhere
select ok((select relrowsecurity from pg_class where oid='public.drafts'::regclass), 'drafts RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.lots'::regclass), 'lots RLS enabled');

-- anon can read drafts (public spectating)
select policies_are('public','drafts', array['drafts_public_read','drafts_admin_write'], 'draft policies as designed');

-- realtime publication covers lots
select ok(exists(select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='lots'),
  'lots in realtime publication');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it — must fail**

```powershell
npx supabase test db
```
Expected: FAIL (tables don't exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000001_schema.sql`:

```sql
-- === Enums ===
create type public.lol_role as enum ('top','jungle','mid','adc','support');
create type public.draft_status as enum ('setup','live','paused','complete');
create type public.acquisition_type as enum ('captain','free_agency','auction');
create type public.lot_status as enum ('open','sold','cancelled');

-- === Tables ===
-- No FK to auth.users on purpose: keeps pgTAP fixtures simple. In production
-- rows are only created by the auth trigger below.
create table public.profiles (
  id uuid primary key,
  discord_id text unique,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.draft_status not null default 'setup',
  countdown_seconds int not null default 15 check (countdown_seconds between 5 and 300),
  round_minimums int[] not null default '{10,5,1}',
  current_round int not null default 1,
  current_nominator_team_id uuid,           -- FK added after teams exists
  paused_time_remaining interval,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  name text not null,
  captain_profile_id uuid references public.profiles(id),
  nomination_position int not null,
  budget_start int not null default 0 check (budget_start >= 0),
  points_remaining int not null default 0 check (points_remaining >= 0),
  unique (draft_id, nomination_position),
  unique (draft_id, captain_profile_id)
);

alter table public.drafts
  add constraint drafts_current_nominator_fk
  foreign key (current_nominator_team_id) references public.teams(id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  display_name text not null,
  role public.lol_role not null,
  rank text,
  opgg_url text,
  notes text,
  team_id uuid references public.teams(id),
  price int check (price >= 0),
  acquisition public.acquisition_type,
  check ((team_id is null) = (acquisition is null))
);
-- a team can hold at most one player per role (role-locked roster)
create unique index players_one_per_role on public.players(team_id, role)
  where team_id is not null;

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  player_id uuid not null references public.players(id),
  nominated_by_team_id uuid not null references public.teams(id),
  round int not null,
  opening_bid int not null,
  current_bid int not null,
  leading_team_id uuid not null references public.teams(id),
  closes_at timestamptz not null,
  status public.lot_status not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
-- only one live auction per draft
create unique index lots_one_open_per_draft on public.lots(draft_id) where status = 'open';

create table public.bids (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.lots(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- === Helpers ===
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.open_roles(p_team_id uuid) returns public.lol_role[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r), '{}')
  from unnest(enum_range(null::public.lol_role)) as r
  where not exists (
    select 1 from public.players p where p.team_id = p_team_id and p.role = r
  )
$$;

create function public.caller_team(p_draft_id uuid) returns public.teams
language plpgsql stable security definer set search_path = public as $$
declare v_team public.teams;
begin
  select t.* into v_team from public.teams t
  where t.draft_id = p_draft_id and t.captain_profile_id = auth.uid();
  if not found then
    raise exception 'NOT_CAPTAIN: you are not a captain in this draft';
  end if;
  return v_team;
end $$;

create function public.get_server_time() returns timestamptz
language sql stable as $$ select now() $$;

-- === Auth trigger: create a profile for every new user (any provider) ===
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, discord_id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(coalesce(new.email,'player'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- === RLS ===
alter table public.profiles enable row level security;
alter table public.drafts   enable row level security;
alter table public.teams    enable row level security;
alter table public.players  enable row level security;
alter table public.lots     enable row level security;
alter table public.bids     enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy drafts_public_read   on public.drafts   for select using (true);
create policy teams_public_read    on public.teams    for select using (true);
create policy players_public_read  on public.players  for select using (true);
create policy lots_public_read     on public.lots     for select using (true);
create policy bids_public_read     on public.bids     for select using (true);

-- Admin setup CRUD happens as direct table writes (Task 15). Everything else
-- goes through SECURITY DEFINER RPCs, which bypass RLS.
create policy drafts_admin_write  on public.drafts  for all using (public.is_admin()) with check (public.is_admin());
create policy teams_admin_write   on public.teams   for all using (public.is_admin()) with check (public.is_admin());
create policy players_admin_write on public.players for all using (public.is_admin()) with check (public.is_admin());

-- === Realtime ===
alter publication supabase_realtime add table
  public.profiles, public.drafts, public.teams, public.players, public.lots, public.bids;
```

- [ ] **Step 4: Apply and re-run tests**

```powershell
npx supabase db reset
npx supabase test db
```
Expected: `0001_schema_test.sql` all 14 pass.

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: draft schema, RLS, realtime, auth trigger"
```

---

### Task 4: Test fixtures — auth simulation + a ready-to-draft league

**Files:**
- Create: `supabase/tests/helpers/_fixtures.sql` (in a subdirectory: `supabase test db` runs every `*.sql` directly under `tests/` as a pg_prove test, and a helper file with no `plan()` would fail — files in subdirectories are only loaded via `\ir`)
- Test: `supabase/tests/0002_fixture_test.sql`

**Interfaces:**
- Produces (used by every later SQL test):
  - `tests.acting_as(p_profile_id uuid)` — makes `auth.uid()` return that id for the rest of the transaction.
  - `tests.fixture() returns uuid` — builds one draft and returns its id: 4 teams (`Team A..D`, positions 1–4), captains with profile ids `tests.cap(1)..tests.cap(4)`, an admin profile `tests.admin_id()`, budgets 100/90/80/70, every team pre-filled with a `captain` (top) and `free_agency` (jungle) player — so every team needs `mid, adc, support` — and a pool of 12 available players (4 mid, 4 adc, 4 support) named like `Mid1..Mid4`. Draft left in `setup`, countdown 15, minimums `{10,5,1}`.
  - `tests.cap(n int) returns uuid`, `tests.admin_id() returns uuid` — deterministic uuids (`'00000000-0000-0000-0000-00000000000n'::uuid` pattern).
  - `tests.go_live(p_draft_id uuid)` — flips status to `live` and sets nominator to position 1 directly (bypasses `start_draft`, which doesn't exist until Task 8).

- [ ] **Step 1: Write the failing fixture test**

`supabase/tests/0002_fixture_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(6);

select lives_ok($$ select tests.fixture() $$, 'fixture builds');

-- rebuild into a variable for assertions
create temporary table t as select tests.fixture() as draft_id;

select is((select count(*)::int from public.teams where draft_id=(select draft_id from t)), 4, '4 teams');
select is((select count(*)::int from public.players p where p.draft_id=(select draft_id from t) and p.team_id is null), 12, '12 available players');
select is((select public.open_roles(id) from public.teams where draft_id=(select draft_id from t) and nomination_position=1),
          array['mid','adc','support']::public.lol_role[], 'teams need mid/adc/support');

-- acting_as makes auth.uid() work
select tests.acting_as(tests.cap(1));
select is(auth.uid(), tests.cap(1), 'auth.uid() simulated');
select is((select (public.caller_team((select draft_id from t))).nomination_position), 1, 'caller_team resolves captain 1');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — must fail** (`tests` schema missing)

```powershell
npx supabase test db
```

- [ ] **Step 3: Write `supabase/tests/helpers/_fixtures.sql`**

```sql
-- Shared test helpers. Include from tests with:  \ir helpers/_fixtures.sql
-- Everything lives in a "tests" schema created inside the test transaction.
create schema if not exists tests;

create or replace function tests.cap(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

create or replace function tests.admin_id() returns uuid language sql immutable as $$
  select '00000000-0000-0000-0000-000000000099'::uuid
$$;

create or replace function tests.acting_as(p_profile_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_profile_id, 'role', 'authenticated')::text, true);
$$;

create or replace function tests.fixture() returns uuid
language plpgsql as $$
declare
  v_draft uuid;
  v_team uuid;
  n int;
  budgets int[] := array[100, 90, 80, 70];
  r public.lol_role;
begin
  -- profiles (id only; no auth.users rows needed — see Task 3 note)
  insert into public.profiles (id, display_name, is_admin)
    values (tests.admin_id(), 'Admin', true)
    on conflict (id) do nothing;
  for n in 1..4 loop
    insert into public.profiles (id, display_name)
      values (tests.cap(n), 'Captain ' || n)
      on conflict (id) do nothing;
  end loop;

  insert into public.drafts (name) values ('Test Draft') returning id into v_draft;

  for n in 1..4 loop
    insert into public.teams (draft_id, name, captain_profile_id, nomination_position,
                              budget_start, points_remaining)
    values (v_draft, 'Team ' || chr(64 + n), tests.cap(n), n, budgets[n], budgets[n])
    returning id into v_team;

    insert into public.players (draft_id, display_name, role, team_id, price, acquisition)
    values (v_draft, 'Captain ' || n, 'top', v_team, 0, 'captain'),
           (v_draft, 'FA '      || n, 'jungle', v_team, 0, 'free_agency');
  end loop;

  foreach r in array array['mid','adc','support']::public.lol_role[] loop
    for n in 1..4 loop
      insert into public.players (draft_id, display_name, role)
      values (v_draft, initcap(r::text) || n, r);
    end loop;
  end loop;

  return v_draft;
end $$;

create or replace function tests.go_live(p_draft_id uuid) returns void
language sql as $$
  update public.drafts
  set status = 'live',
      current_nominator_team_id = (select id from public.teams
                                   where draft_id = p_draft_id and nomination_position = 1)
  where id = p_draft_id;
$$;
```

- [ ] **Step 4: Run — 0002 passes**

```powershell
npx supabase test db
```
Expected: all green (and `helpers/_fixtures.sql` is not itself run as a test).

- [ ] **Step 5: Commit**

```powershell
git add supabase/tests; git commit -m "test: shared pgTAP fixtures (auth simulation, league builder)"
```

---

### Task 5: `nominate` RPC

**Files:**
- Create: `supabase/migrations/20260807000002_nominate.sql`
- Test: `supabase/tests/0003_nominate_test.sql`

**Interfaces:**
- Consumes: schema + helpers (Task 3), fixtures (Task 4).
- Produces: `public.nominate(p_draft_id uuid, p_player_id uuid) returns uuid` (the new lot id). Errors: `NOT_LIVE, NOT_CAPTAIN, NOT_YOUR_TURN, LOT_OPEN_EXISTS, PLAYER_TAKEN, ROLE_FILLED, OVER_CAP`. Side effects: creates `lots` row (nominator leading at round minimum, `closes_at = now() + countdown_seconds`) and the opening `bids` row.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/0003_nominate_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- not your turn (captain 2 tries while captain 1 is nominator)
select tests.acting_as(tests.cap(2));
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'NOT_YOUR_TURN%', 'wrong captain blocked');

-- spectator/no team
select tests.acting_as(tests.admin_id());
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'NOT_CAPTAIN%', 'non-captain blocked');

-- happy path: captain 1 nominates Mid1
select tests.acting_as(tests.cap(1));
select lives_ok($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'nomination succeeds');

select is((select opening_bid from public.lots where draft_id=(select d from t) and status='open'), 10, 'opens at round-1 minimum');
select is((select current_bid from public.lots where draft_id=(select d from t) and status='open'), 10, 'current = opening');
select is((select count(*)::int from public.bids b join public.lots l on l.id=b.lot_id
           where l.draft_id=(select d from t)), 1, 'opening bid recorded');

-- second nomination while a lot is open
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Adc1'))
$$, 'LOT_OPEN_EXISTS%', 'no concurrent lots');

-- close the lot artificially, then: nominating a role you already hold
update public.lots set status='cancelled' where status='open';
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and acquisition='captain' limit 1))
$$, 'PLAYER_TAKEN%', 'rostered player blocked');

-- draft not live
update public.drafts set status='paused' where id=(select d from t);
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid2'))
$$, 'NOT_LIVE%', 'paused draft blocked');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — must fail** (`nominate` undefined)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000002_nominate.sql`:

```sql
create function public.nominate(p_draft_id uuid, p_player_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_draft  public.drafts;
  v_team   public.teams;
  v_player public.players;
  v_open   public.lol_role[];
  v_min    int;
  v_cap    int;
  v_lot_id uuid;
begin
  -- Lock the draft row: serializes nominate/close/pause for this draft.
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then raise exception 'NOT_LIVE: draft not found'; end if;
  if v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is %', v_draft.status;
  end if;

  v_team := public.caller_team(p_draft_id);
  if v_team.id <> v_draft.current_nominator_team_id then
    raise exception 'NOT_YOUR_TURN: it is not your nomination';
  end if;

  if exists (select 1 from public.lots where draft_id = p_draft_id and status = 'open') then
    raise exception 'LOT_OPEN_EXISTS: an auction is already running';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id;
  if not found or v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player unavailable';
  end if;

  v_open := public.open_roles(v_team.id);
  if not (v_player.role = any (v_open)) then
    raise exception 'ROLE_FILLED: you already have a %', v_player.role;
  end if;

  v_min := v_draft.round_minimums[least(v_draft.current_round,
                                        array_length(v_draft.round_minimums, 1))];
  -- must keep 1 point per OTHER unfilled role
  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if v_min > v_cap then
    raise exception 'OVER_CAP: opening bid % exceeds your max of %', v_min, v_cap;
  end if;

  insert into public.lots (draft_id, player_id, nominated_by_team_id, round,
                           opening_bid, current_bid, leading_team_id, closes_at)
  values (p_draft_id, p_player_id, v_team.id, v_draft.current_round,
          v_min, v_min, v_team.id, now() + make_interval(secs => v_draft.countdown_seconds))
  returning id into v_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (v_lot_id, v_team.id, v_min);
  return v_lot_id;
end $$;
```

- [ ] **Step 4: Apply + run tests — all pass**

```powershell
npx supabase db reset
npx supabase test db
```

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: nominate RPC with turn/role/cap enforcement"
```

---

### Task 6: `place_bid` RPC

**Files:**
- Create: `supabase/migrations/20260807000003_place_bid.sql`
- Test: `supabase/tests/0004_place_bid_test.sql`

**Interfaces:**
- Consumes: `nominate` (Task 5), fixtures.
- Produces: `public.place_bid(p_lot_id uuid, p_amount int) returns void`. Errors: `LOT_CLOSED, LOT_EXPIRED, NOT_LIVE, NOT_CAPTAIN, ALREADY_LEADING, ROLE_FILLED, BID_TOO_LOW, OVER_CAP`. Side effects: updates `lots.current_bid/leading_team_id`, **resets `closes_at`**, inserts a `bids` row.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/0004_place_bid_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;

-- leader can't raise themselves
select throws_like($$ select public.place_bid((select id from lot), 11) $$,
  'ALREADY_LEADING%', 'leader cannot self-raise');

-- raise must be >= current + 1
select tests.acting_as(tests.cap(2));
select throws_like($$ select public.place_bid((select id from lot), 10) $$,
  'BID_TOO_LOW%', 'equal bid rejected');

-- happy path resets the clock
select lives_ok($$ select public.place_bid((select id from lot), 11) $$, 'valid raise');
select is((select current_bid from public.lots where id=(select id from lot)), 11, 'bid recorded');
select is((select leading_team_id from public.lots where id=(select id from lot)),
          (select id from public.teams where draft_id=(select d from t) and nomination_position=2),
          'leader updated');
select ok((select closes_at > now() + interval '10 seconds' from public.lots where id=(select id from lot)),
          'countdown reset');

-- role you already hold: give captain 3 a mid, then they bid on a mid
update public.players set team_id=(select id from public.teams where draft_id=(select d from t) and nomination_position=3),
  price=1, acquisition='auction'
  where draft_id=(select d from t) and display_name='Mid4';
select tests.acting_as(tests.cap(3));
select throws_like($$ select public.place_bid((select id from lot), 12) $$,
  'ROLE_FILLED%', 'role-filled bidder blocked');

-- cap: captain 4 has 70 pts, 3 open roles -> max bid 68
select tests.acting_as(tests.cap(4));
select throws_like($$ select public.place_bid((select id from lot), 69) $$,
  'OVER_CAP%', 'cap enforced');

-- expired lot rejects bids
update public.lots set closes_at = now() - interval '1 second' where id=(select id from lot);
select throws_like($$ select public.place_bid((select id from lot), 20) $$,
  'LOT_EXPIRED%', 'expired lot rejects bids');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — must fail** (`place_bid` undefined)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000003_place_bid.sql`:

```sql
create function public.place_bid(p_lot_id uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lot   public.lots;
  v_draft public.drafts;
  v_team  public.teams;
  v_open  public.lol_role[];
  v_role  public.lol_role;
  v_cap   int;
begin
  -- Lock order everywhere is draft -> lot, so bids, closes and pauses serialize.
  select d.* into v_draft from public.drafts d
    join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  if not found then raise exception 'LOT_CLOSED: lot not found'; end if;
  if v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is %', v_draft.status;
  end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if v_lot.status <> 'open' then raise exception 'LOT_CLOSED: auction over'; end if;
  if now() >= v_lot.closes_at then raise exception 'LOT_EXPIRED: countdown finished'; end if;

  v_team := public.caller_team(v_lot.draft_id);
  if v_team.id = v_lot.leading_team_id then
    raise exception 'ALREADY_LEADING: you hold the high bid';
  end if;

  select role into v_role from public.players where id = v_lot.player_id;
  v_open := public.open_roles(v_team.id);
  if not (v_role = any (v_open)) then
    raise exception 'ROLE_FILLED: you already have a %', v_role;
  end if;

  if p_amount < v_lot.current_bid + 1 then
    raise exception 'BID_TOO_LOW: minimum is %', v_lot.current_bid + 1;
  end if;

  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if p_amount > v_cap then
    raise exception 'OVER_CAP: your max bid is %', v_cap;
  end if;

  update public.lots
    set current_bid = p_amount,
        leading_team_id = v_team.id,
        closes_at = now() + make_interval(secs => v_draft.countdown_seconds)
    where id = p_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (p_lot_id, v_team.id, p_amount);
end $$;
```

- [ ] **Step 4: Apply + run — all pass**

```powershell
npx supabase db reset
npx supabase test db
```

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: place_bid RPC with raise/cap/role checks and clock reset"
```

---

### Task 7: `close_lot` + turn/round advancement

**Files:**
- Create: `supabase/migrations/20260807000004_close_lot.sql`
- Test: `supabase/tests/0005_close_lot_test.sql`

**Interfaces:**
- Consumes: Tasks 5–6.
- Produces:
  - `public.close_lot(p_lot_id uuid) returns boolean` — callable by ANYONE (even anon). Returns `true` if it closed the lot, `false` no-op (already closed / not yet expired / draft paused). Never raises for benign races.
  - Internal `public._close_lot(p_lot_id uuid, p_force boolean)` used by Task 9's force-close.
  - Internal `public._advance_turn(p_draft public.drafts)` — snake logic, sets next nominator / round / `complete`.
  - Sale side effects: lot `sold` + `closed_at`, player gets `team_id/price/acquisition='auction'`, team points deducted.
- **Snake rule (canonical):** round 1 ascends positions 1→N, round 2 descends N→1, etc. After a sale, the next nominator is the next position after the *current nominator* in the current round's direction that still has open roles; if none remain in that direction, increment the round (direction flips) and pick the first eligible from that end. If no team anywhere has open roles, the draft is `complete`.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/0005_close_lot_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- team ids by position, for readability
create temporary table tm as
  select nomination_position as pos, id from public.teams where draft_id=(select d from t);

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;

-- not expired yet -> no-op
select is(public.close_lot((select id from lot)), false, 'unexpired lot is a no-op');

-- captain 2 outbids, then we expire the clock manually
select tests.acting_as(tests.cap(2));
select public.place_bid((select id from lot), 15);
update public.lots set closes_at = now() - interval '1 second' where id=(select id from lot);

select is(public.close_lot((select id from lot)), true, 'expired lot closes');
select is(public.close_lot((select id from lot)), false, 'second close is a no-op (idempotent)');

select is((select team_id from public.players where display_name='Mid1' and draft_id=(select d from t)),
          (select id from tm where pos=2), 'player joined winning team');
select is((select price from public.players where display_name='Mid1' and draft_id=(select d from t)),
          15, 'price recorded');
select is((select points_remaining from public.teams where id=(select id from tm where pos=2)),
          75, '90 - 15 deducted');

-- turn advanced to position 2 (round 1 ascends)
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=2), 'nomination moved to position 2');

-- Fast-forward: sell mids to teams 2,3,4 via nominations, ending round 1.
-- Helper inline: nominate as current nominator, expire, close.
create or replace function tests.sell_next(p_d uuid, p_name text) returns void
language plpgsql as $f$
declare v_team public.teams; v_lot uuid;
begin
  select t.* into v_team from public.teams t
    join public.drafts d on d.current_nominator_team_id = t.id where d.id = p_d;
  perform tests.acting_as(v_team.captain_profile_id);
  v_lot := public.nominate(p_d, (select id from public.players where draft_id=p_d and display_name=p_name));
  update public.lots set closes_at = now() - interval '1 second' where id = v_lot;
  perform public.close_lot(v_lot);
end $f$;

-- pos 2 already owns a mid (they won Mid1), so their nomination must be another role
select tests.sell_next((select d from t), 'Adc1');   -- pos 2 nominates & buys an adc
select tests.sell_next((select d from t), 'Mid2');   -- pos 3
select tests.sell_next((select d from t), 'Mid3');   -- pos 4 -> pass complete

-- Positions 1-4 have each nominated once (pos 1's nomination was WON by pos 2 —
-- it still counts as pos 1's nomination), so the pass is complete: round 2,
-- order snakes, position 4 nominates first. Pos 1 still needs a mid; they'll
-- get one on a later nomination.
select is((select current_round from public.drafts where id=(select d from t)), 2, 'round advanced after full pass');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=4), 'snake: position 4 opens round 2');

select * from finish();
rollback;
```

**Note for the implementer:** the pass in this fixture completes at position 4 because a "pass" tracks nominations, not purchases — positions 1,2,3,4 each nominated once in round 1 (position 1's nomination was *won by* position 2; that still counts as position 1's nomination).

- [ ] **Step 2: Run — must fail** (`close_lot` undefined)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000004_close_lot.sql`:

```sql
-- Advance nomination after a sale. p_draft must be freshly re-read AFTER the
-- sale's roster mutation, and its row must already be locked by the caller.
create function public._advance_turn(p_draft public.drafts) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cur_pos int;
  v_round int := p_draft.current_round;
  v_asc boolean;
  v_next uuid;
begin
  select nomination_position into v_cur_pos
    from public.teams where id = p_draft.current_nominator_team_id;

  v_asc := (v_round % 2) = 1;   -- round 1,3,5.. ascend; 2,4.. descend

  -- next eligible team after current position in the current direction
  select t.id into v_next from public.teams t
    where t.draft_id = p_draft.id
      and cardinality(public.open_roles(t.id)) > 0
      and ((v_asc and t.nomination_position > v_cur_pos)
        or (not v_asc and t.nomination_position < v_cur_pos))
    order by case when v_asc then t.nomination_position end asc,
             case when not v_asc then t.nomination_position end desc
    limit 1;

  if v_next is null then
    -- pass complete -> next round, direction flips, start from that end
    v_round := v_round + 1;
    v_asc := (v_round % 2) = 1;
    select t.id into v_next from public.teams t
      where t.draft_id = p_draft.id
        and cardinality(public.open_roles(t.id)) > 0
      order by case when v_asc then t.nomination_position end asc,
               case when not v_asc then t.nomination_position end desc
      limit 1;
  end if;

  if v_next is null then
    update public.drafts set status = 'complete', current_nominator_team_id = null
      where id = p_draft.id;
  else
    update public.drafts
      set current_round = v_round, current_nominator_team_id = v_next
      where id = p_draft.id;
  end if;
end $$;

create function public._close_lot(p_lot_id uuid, p_force boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_lot   public.lots;
  v_draft public.drafts;
begin
  select d.* into v_draft from public.drafts d
    join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  if not found then return false; end if;
  if v_draft.status <> 'live' then return false; end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if v_lot.status <> 'open' then return false; end if;
  if not p_force and now() < v_lot.closes_at then return false; end if;

  update public.lots set status = 'sold', closed_at = now() where id = p_lot_id;

  update public.players
    set team_id = v_lot.leading_team_id, price = v_lot.current_bid, acquisition = 'auction'
    where id = v_lot.player_id;

  update public.teams
    set points_remaining = points_remaining - v_lot.current_bid
    where id = v_lot.leading_team_id;

  select * into v_draft from public.drafts where id = v_draft.id;  -- re-read post-sale
  perform public._advance_turn(v_draft);
  return true;
end $$;

-- Public wrapper: anyone may poke an expired lot closed; never forces.
create function public.close_lot(p_lot_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select public._close_lot(p_lot_id, false)
$$;
```

- [ ] **Step 4: Apply + run — all pass**

```powershell
npx supabase db reset
npx supabase test db
```

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: close_lot with sale settlement and snake turn advancement"
```

---

### Task 8: Draft lifecycle — `start_draft`, `pause_draft`, `resume_draft`, `update_draft_settings`

**Files:**
- Create: `supabase/migrations/20260807000005_start_draft_pause.sql`
- Test: `supabase/tests/0006_lifecycle_test.sql`

**Interfaces:**
- Consumes: Tasks 3–7.
- Produces (all admin-only, raising `NOT_ADMIN` otherwise):
  - `public.start_draft(p_draft_id uuid) returns void` — `setup → live`. Raises `SETUP_INVALID: <reason>` unless: every team has a captain linked; every team has exactly 3 open roles (i.e. exactly 2 pre-filled); for each role, available pool count ≥ count of teams needing it; team count ≥ 2. Sets `current_round = 1`, nominator = lowest `nomination_position`.
  - `public.pause_draft(p_draft_id uuid)` — `live → paused`; stores `closes_at - now()` of any open lot into `drafts.paused_time_remaining`.
  - `public.resume_draft(p_draft_id uuid)` — `paused → live`; open lot gets `closes_at = now() + paused_time_remaining`; clears the field.
  - `public.update_draft_settings(p_draft_id uuid, p_countdown_seconds int)` — any status; new value applies from the next clock reset.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/0006_lifecycle_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(10);

create temporary table t as select tests.fixture() as d;

-- non-admin blocked
select tests.acting_as(tests.cap(1));
select throws_like($$ select public.start_draft((select d from t)) $$,
  'NOT_ADMIN%', 'captain cannot start');

-- setup validation: break the pool (delete all supports), expect SETUP_INVALID
select tests.acting_as(tests.admin_id());
create temporary table gone as
  select display_name from public.players
  where draft_id=(select d from t) and role='support' and team_id is null;
delete from public.players
  where draft_id=(select d from t) and role='support' and team_id is null;
select throws_like($$ select public.start_draft((select d from t)) $$,
  'SETUP_INVALID%', 'insufficient supports blocks start');
insert into public.players (draft_id, display_name, role)
  select (select d from t), display_name, 'support'::public.lol_role from gone;

-- valid start
select lives_ok($$ select public.start_draft((select d from t)) $$, 'valid setup starts');
select is((select status from public.drafts where id=(select d from t)), 'live', 'status live');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from public.teams where draft_id=(select d from t) and nomination_position=1),
          'position 1 nominates first');

-- can't start twice
select throws_like($$ select public.start_draft((select d from t)) $$,
  'SETUP_INVALID%', 'already live blocks start');

-- pause freezes an open lot's clock
select tests.acting_as(tests.cap(1));
select public.nominate((select d from t),
  (select id from public.players where draft_id=(select d from t) and display_name='Mid1'));
select tests.acting_as(tests.admin_id());
select public.pause_draft((select d from t));
select ok((select paused_time_remaining is not null from public.drafts where id=(select d from t)),
          'time remaining captured');

-- paused draft rejects bids
select tests.acting_as(tests.cap(2));
select throws_like($$
  select public.place_bid((select id from public.lots where draft_id=(select d from t) and status='open'), 11)
$$, 'NOT_LIVE%', 'bids blocked while paused');

-- resume restores clock and play
select tests.acting_as(tests.admin_id());
select public.resume_draft((select d from t));
select ok((select closes_at > now() from public.lots where draft_id=(select d from t) and status='open'),
          'clock restored in the future');
select tests.acting_as(tests.cap(2));
select lives_ok($$
  select public.place_bid((select id from public.lots where draft_id=(select d from t) and status='open'), 11)
$$, 'bidding works after resume');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — must fail** (`start_draft` undefined)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000005_start_draft_pause.sql`:

```sql
create function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN: admin access required';
  end if;
end $$;

create function public.start_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_bad text;
  r public.lol_role;
  v_need int; v_have int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  if (select count(*) from public.teams where draft_id = p_draft_id) < 2 then
    raise exception 'SETUP_INVALID: need at least 2 teams';
  end if;

  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and t.captain_profile_id is null;
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams missing captains: %', v_bad;
  end if;

  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and cardinality(public.open_roles(t.id)) <> 3;
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams must have exactly 2 pre-filled roles: %', v_bad;
  end if;

  foreach r in array enum_range(null::public.lol_role) loop
    select count(*) into v_need from public.teams t
      where t.draft_id = p_draft_id and r = any(public.open_roles(t.id));
    select count(*) into v_have from public.players p
      where p.draft_id = p_draft_id and p.role = r and p.team_id is null;
    if v_have < v_need then
      raise exception 'SETUP_INVALID: pool has % % players but % teams need one', v_have, r, v_need;
    end if;
  end loop;

  update public.drafts
    set status = 'live',
        current_round = 1,
        current_nominator_team_id = (
          select id from public.teams where draft_id = p_draft_id
          order by nomination_position asc limit 1)
    where id = p_draft_id;
end $$;

create function public.pause_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is not live';
  end if;
  update public.drafts set status = 'paused',
    paused_time_remaining = (
      select greatest(closes_at - now(), interval '3 seconds')
      from public.lots where draft_id = p_draft_id and status = 'open')
    where id = p_draft_id;
end $$;

create function public.resume_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'paused' then
    raise exception 'NOT_LIVE: draft is not paused';
  end if;
  update public.lots
    set closes_at = now() + coalesce(v_draft.paused_time_remaining,
                                     make_interval(secs => v_draft.countdown_seconds))
    where draft_id = p_draft_id and status = 'open';
  update public.drafts set status = 'live', paused_time_remaining = null
    where id = p_draft_id;
end $$;

create function public.update_draft_settings(p_draft_id uuid, p_countdown_seconds int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.drafts set countdown_seconds = p_countdown_seconds where id = p_draft_id;
  if not found then raise exception 'SETUP_INVALID: draft not found'; end if;
end $$;
```

- [ ] **Step 4: Apply + run — all pass**

```powershell
npx supabase db reset
npx supabase test db
```

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: start/pause/resume/settings lifecycle RPCs"
```

---

### Task 9: Admin overrides — `cancel_lot`, `force_close_lot`, `undo_last_sale`

**Files:**
- Create: `supabase/migrations/20260807000006_admin_overrides.sql`
- Test: `supabase/tests/0007_admin_overrides_test.sql`

**Interfaces:**
- Consumes: `_close_lot(p_lot_id, p_force)` from Task 7, `_require_admin()` from Task 8.
- Produces (admin-only):
  - `public.cancel_lot(p_lot_id uuid)` — voids an open lot; the nominator keeps the turn; bid rows are kept for the audit trail.
  - `public.force_close_lot(p_lot_id uuid)` — settles an open lot immediately at the current bid (calls `_close_lot(lot, true)`).
  - `public.undo_last_sale(p_draft_id uuid)` — most recent `sold` lot (by `closed_at`): lot → `cancelled`, player returned to pool (`team_id/price/acquisition` nulled), points refunded, `current_round` set back to the lot's round, nominator restored to the lot's nominating team, and a `complete`/paused draft flips back to `live`. Raises `LOT_CLOSED: nothing to undo` when no sold lots exist.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/0007_admin_overrides_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table tm as
  select nomination_position as pos, id from public.teams where draft_id=(select d from t);

-- cancel: nomination voided, turn kept
select tests.acting_as(tests.cap(1));
create temporary table lot1 as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;
select tests.acting_as(tests.cap(1));
select throws_like($$ select public.cancel_lot((select id from lot1)) $$,
  'NOT_ADMIN%', 'captain cannot cancel');
select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.cancel_lot((select id from lot1)) $$, 'admin cancels');
select is((select status from public.lots where id=(select id from lot1)), 'cancelled', 'lot cancelled');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=1), 'nominator keeps the turn');
select ok((select team_id is null from public.players
           where draft_id=(select d from t) and display_name='Mid1'), 'player still available');

-- force close: settles now at current bid
select tests.acting_as(tests.cap(1));
create temporary table lot2 as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;
select tests.acting_as(tests.admin_id());
select is(public.force_close_lot((select id from lot2)), true, 'force close settles');
select is((select team_id from public.players where draft_id=(select d from t) and display_name='Mid1'),
          (select id from tm where pos=1), 'nominator bought at opening bid');

-- undo: everything reverts
select lives_ok($$ select public.undo_last_sale((select d from t)) $$, 'undo runs');
select ok((select team_id is null and price is null from public.players
           where draft_id=(select d from t) and display_name='Mid1')
      and (select points_remaining = 100 from public.teams where id=(select id from tm where pos=1))
      and (select current_nominator_team_id = (select id from tm where pos=1)
           from public.drafts where id=(select d from t)),
      'player back in pool, points refunded, turn restored');

select * from finish();
rollback;
```

- [ ] **Step 2: Run — must fail** (`cancel_lot` undefined)

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260807000006_admin_overrides.sql`:

```sql
create function public.cancel_lot(p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lot public.lots;
begin
  perform public._require_admin();
  perform 1 from public.drafts d join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found or v_lot.status <> 'open' then
    raise exception 'LOT_CLOSED: lot is not open';
  end if;
  update public.lots set status = 'cancelled', closed_at = now() where id = p_lot_id;
  -- nominator keeps the turn: current_nominator_team_id untouched
end $$;

create function public.force_close_lot(p_lot_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._close_lot(p_lot_id, true);
end $$;

create function public.undo_last_sale(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lot public.lots;
begin
  perform public._require_admin();
  perform 1 from public.drafts where id = p_draft_id for update;

  select * into v_lot from public.lots
    where draft_id = p_draft_id and status = 'sold'
    order by closed_at desc limit 1
    for update;
  if not found then raise exception 'LOT_CLOSED: nothing to undo'; end if;

  update public.lots set status = 'cancelled' where id = v_lot.id;
  update public.players set team_id = null, price = null, acquisition = null
    where id = v_lot.player_id;
  update public.teams set points_remaining = points_remaining + v_lot.current_bid
    where id = v_lot.leading_team_id;
  update public.drafts
    set current_round = v_lot.round,
        current_nominator_team_id = v_lot.nominated_by_team_id,
        status = case when status in ('complete','live') then 'live' else status end
    where id = p_draft_id;
end $$;
```

- [ ] **Step 4: Apply + run — all pass**

```powershell
npx supabase db reset
npx supabase test db
```

- [ ] **Step 5: Commit**

```powershell
git add supabase; git commit -m "feat: admin override RPCs (cancel, force close, undo)"
```

---

### Task 10: Supabase clients, row types, and auth (Discord + local email)

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/draft/types.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/components/AuthButton.tsx`
- Modify: `src/app/layout.tsx` (header with AuthButton), `src/app/page.tsx` (link to /admin and a placeholder draft list)

**Interfaces:**
- Consumes: env vars from Task 2.
- Produces:
  - `createClient()` from `client.ts` — browser client (singleton).
  - `createServerSupabase()` from `server.ts` — cookie-aware server client (async, for RSC/route handlers).
  - Types in `types.ts` used by all UI tasks: `LolRole ('top'|'jungle'|'mid'|'adc'|'support')`, `DraftStatus`, `LotStatus`, `Acquisition`, and row interfaces `Profile, Draft, Team, Player, Lot, Bid` mirroring Task 3 columns exactly (camel-not: keep snake_case field names as returned by PostgREST, e.g. `points_remaining`), plus `ROLE_ORDER: LolRole[] = ['top','jungle','mid','adc','support']` and `errCode(e: unknown): string` which extracts the `CODE` prefix from an RPC error message (returns `'UNKNOWN'` if absent).
  - Working login: `/login` shows "Sign in with Discord" (`supabase.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: `${location.origin}/auth/callback` } })`) and a dev-only email+password form (rendered when `process.env.NODE_ENV !== 'production'` or `NEXT_PUBLIC_SUPABASE_URL` contains `127.0.0.1`). Callback route exchanges the code for a session and redirects home.

- [ ] **Step 1: Install deps**

```powershell
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write the clients and types**

`src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cks) => {
          try {
            cks.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {} // called from RSC — middleware refresh handles it
        },
      },
    }
  );
}
```

`src/lib/draft/types.ts`:
```ts
export type LolRole = "top" | "jungle" | "mid" | "adc" | "support";
export type DraftStatus = "setup" | "live" | "paused" | "complete";
export type LotStatus = "open" | "sold" | "cancelled";
export type Acquisition = "captain" | "free_agency" | "auction";

export const ROLE_ORDER: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

export interface Profile {
  id: string; discord_id: string | null; display_name: string;
  avatar_url: string | null; is_admin: boolean;
}
export interface Draft {
  id: string; name: string; status: DraftStatus; countdown_seconds: number;
  round_minimums: number[]; current_round: number;
  current_nominator_team_id: string | null; paused_time_remaining: string | null;
  created_at: string;
}
export interface Team {
  id: string; draft_id: string; name: string; captain_profile_id: string | null;
  nomination_position: number; budget_start: number; points_remaining: number;
}
export interface Player {
  id: string; draft_id: string; display_name: string; role: LolRole;
  rank: string | null; opgg_url: string | null; notes: string | null;
  team_id: string | null; price: number | null; acquisition: Acquisition | null;
}
export interface Lot {
  id: string; draft_id: string; player_id: string; nominated_by_team_id: string;
  round: number; opening_bid: number; current_bid: number; leading_team_id: string;
  closes_at: string; status: LotStatus; created_at: string; closed_at: string | null;
}
export interface Bid {
  id: number; lot_id: string; team_id: string; amount: number; created_at: string;
}

/** RPC errors look like "OVER_CAP: your max bid is 12" — extract the code. */
export function errCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : (e as { message?: string })?.message ?? "";
  const m = /^([A-Z_]+):/.exec(msg);
  return m ? m[1] : "UNKNOWN";
}
```

- [ ] **Step 3: Login page, callback route, header button**

`src/app/auth/callback/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
```

`src/app/login/page.tsx` (client component):
```tsx
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const isLocal =
  process.env.NODE_ENV !== "production" ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("127.0.0.1");

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="mx-auto mt-24 flex max-w-sm flex-col gap-4">
      <button
        className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white"
        onClick={() =>
          supabase.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo: `${location.origin}/auth/callback` },
          })
        }
      >
        Sign in with Discord
      </button>
      {isLocal && (
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setErr(error.message);
            else location.href = "/";
          }}
        >
          <p className="text-sm opacity-60">Dev sign-in (local only)</p>
          <input className="rounded border p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input className="rounded border p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button className="rounded bg-zinc-700 px-4 py-2 text-white">Sign in</button>
          {err && <p className="text-sm text-red-500">{err}</p>}
        </form>
      )}
    </main>
  );
}
```

`src/components/AuthButton.tsx` (server component):
```tsx
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AuthButton() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Link href="/login" className="underline">Sign in</Link>;
  const { data: profile } = await supabase
    .from("profiles").select("display_name").eq("id", user.id).single();
  return <span className="text-sm">{profile?.display_name ?? user.email}</span>;
}
```

In `src/app/layout.tsx`, wrap children with a simple header: site title linking `/`, and `<AuthButton />` right-aligned.

- [ ] **Step 4: Verify by hand**

```powershell
npm run dev
```
- Create a dev user: `npx supabase status` → open Studio URL → Auth → Add user (`cap1@test.local` / `password123`).
- Visit `/login`, sign in with the email form → header shows the display name (profile row was created by the trigger — check in Studio).
- `npm run build` passes.

(Discord OAuth itself is verified in Task 17 when the Discord app exists; the code path is identical.)

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: supabase clients, row types, login (discord + dev email)"
```

---

### Task 11: Server-time offset + countdown hook (Vitest introduced here)

**Files:**
- Create: `src/lib/time.ts`, `src/hooks/useCountdown.ts`, `vitest.config.ts`, `src/lib/time.test.ts`, `src/hooks/useCountdown.test.ts`
- Modify: `package.json` (add `"test": "vitest run"` script)

**Interfaces:**
- Consumes: `createClient` (Task 10).
- Produces:
  - `fetchServerOffset(supabase): Promise<number>` — calls `get_server_time` RPC; returns `serverMs - Date.now()` (positive = server ahead).
  - `remainingMs(closesAt: string, offsetMs: number, nowMs?: number): number` — pure; clamped ≥ 0.
  - `useCountdown(closesAt: string | null, offsetMs: number): { secondsLeft: number; expired: boolean }` — ticks every 250ms; `secondsLeft` is `ceil(remaining/1000)`; `expired` true once remaining hits 0; `closesAt: null` → `{ secondsLeft: 0, expired: false }`.

- [ ] **Step 1: Install and configure Vitest**

```powershell
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Write the failing tests**

`src/lib/time.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { fetchServerOffset, remainingMs } from "./time";

describe("remainingMs", () => {
  it("computes remaining against server time", () => {
    const closes = new Date(10_000).toISOString();
    expect(remainingMs(closes, 0, 4_000)).toBe(6_000);
  });
  it("applies the offset (client clock behind server)", () => {
    const closes = new Date(10_000).toISOString();
    expect(remainingMs(closes, 2_000, 4_000)).toBe(4_000);
  });
  it("clamps at zero", () => {
    expect(remainingMs(new Date(1_000).toISOString(), 0, 5_000)).toBe(0);
  });
});

describe("fetchServerOffset", () => {
  it("returns server minus client ms", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: new Date(3_000).toISOString(), error: null }),
    };
    expect(await fetchServerOffset(supabase as never)).toBe(2_000);
    vi.restoreAllMocks();
  });
});
```

`src/hooks/useCountdown.test.ts`:
```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown } from "./useCountdown";

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down and flags expiry", () => {
    vi.setSystemTime(0);
    const closes = new Date(5_000).toISOString();
    const { result } = renderHook(() => useCountdown(closes, 0));
    expect(result.current.secondsLeft).toBe(5);
    act(() => vi.advanceTimersByTime(5_100));
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.expired).toBe(true);
  });

  it("null closesAt is inert", () => {
    const { result } = renderHook(() => useCountdown(null, 0));
    expect(result.current).toEqual({ secondsLeft: 0, expired: false });
  });
});
```

- [ ] **Step 3: Run — must fail**

```powershell
npm test
```

- [ ] **Step 4: Implement**

`src/lib/time.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchServerOffset(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("get_server_time");
  if (error || !data) return 0; // degrade gracefully: trust local clock
  return new Date(data as string).getTime() - Date.now();
}

export function remainingMs(closesAt: string, offsetMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, new Date(closesAt).getTime() - (nowMs + offsetMs));
}
```

`src/hooks/useCountdown.ts`:
```ts
"use client";
import { useEffect, useState } from "react";
import { remainingMs } from "@/lib/time";

export function useCountdown(closesAt: string | null, offsetMs: number) {
  const [ms, setMs] = useState(() => (closesAt ? remainingMs(closesAt, offsetMs) : 0));

  useEffect(() => {
    if (!closesAt) { setMs(0); return; }
    setMs(remainingMs(closesAt, offsetMs));
    const id = setInterval(() => setMs(remainingMs(closesAt, offsetMs)), 250);
    return () => clearInterval(id);
  }, [closesAt, offsetMs]);

  return {
    secondsLeft: Math.ceil(ms / 1000),
    expired: closesAt !== null && ms <= 0,
  };
}
```

- [ ] **Step 5: Run — all pass, then commit**

```powershell
npm test
git add -A; git commit -m "feat: server-time offset and countdown hook"
```

---

### Task 12: Eligibility helpers + realtime draft state hook (with auto-close)

**Files:**
- Create: `src/lib/draft/derive.ts`, `src/lib/draft/derive.test.ts`, `src/hooks/useDraftState.ts`

**Interfaces:**
- Consumes: types (Task 10), `fetchServerOffset` (Task 11).
- Produces:
  - Pure helpers in `derive.ts` (unit-tested; mirror the SQL rules exactly — they only drive button states/tooltips, the server re-checks everything):
    - `openRoles(teamId: string, players: Player[]): LolRole[]`
    - `maxBid(team: Team, players: Player[]): number` — `points_remaining - (openRoles.length - 1)`
    - `bidBlockReason(team: Team, lot: Lot, lotPlayer: Player, players: Player[], amount: number): string | null` — returns `null` when biddable, else a human reason ("You already have a mid", "You hold the high bid", "Minimum raise is 12", "Your max bid is 8").
    - `nominateBlockReason(team: Team, player: Player, draft: Draft, players: Player[]): string | null`
  - `useDraftState(draftId: string)` returning `{ draft, teams, players, lots, bids, openLot, profileId, myTeam, offsetMs, connected, refetch }` where `openLot: Lot | null`, `myTeam: Team | null` (team whose `captain_profile_id` = signed-in user). Subscribes to one realtime channel with five `postgres_changes` listeners (`drafts, teams, players, lots, bids`, each filtered `draft_id=eq.{draftId}`; bids filtered via lot join is impossible — subscribe unfiltered to `bids` and drop rows whose `lot_id` isn't in state). On any event: apply the row change to local state. On (re)connect: full refetch of all five tables. **Auto-close:** an effect watches `openLot.closes_at` — when `remainingMs(...) === 0`, call `supabase.rpc("close_lot", { p_lot_id })` once, then every 2s while it stays open (covers a lost realtime message; `close_lot` is a safe no-op server-side).
- Testing note: `useDraftState` is thin glue over the supabase client and is exercised end-to-end in Task 16; only `derive.ts` gets unit tests.

- [ ] **Step 1: Write the failing tests for `derive.ts`**

`src/lib/draft/derive.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { bidBlockReason, maxBid, nominateBlockReason, openRoles } from "./derive";
import type { Draft, Lot, Player, Team } from "./types";

const team = (over: Partial<Team> = {}): Team => ({
  id: "t1", draft_id: "d", name: "A", captain_profile_id: "p1",
  nomination_position: 1, budget_start: 100, points_remaining: 20, ...over,
});
const player = (over: Partial<Player> = {}): Player => ({
  id: "pl", draft_id: "d", display_name: "X", role: "mid", rank: null,
  opgg_url: null, notes: null, team_id: null, price: null, acquisition: null, ...over,
});
const lot = (over: Partial<Lot> = {}): Lot => ({
  id: "l1", draft_id: "d", player_id: "pl", nominated_by_team_id: "t2",
  round: 1, opening_bid: 10, current_bid: 10, leading_team_id: "t2",
  closes_at: new Date().toISOString(), status: "open", created_at: "", closed_at: null, ...over,
});
const draft = (over: Partial<Draft> = {}): Draft => ({
  id: "d", name: "D", status: "live", countdown_seconds: 15,
  round_minimums: [10, 5, 1], current_round: 1,
  current_nominator_team_id: "t1", paused_time_remaining: null, created_at: "", ...over,
});

// roster: my team already holds top+jungle
const roster = [
  player({ id: "r1", role: "top", team_id: "t1", acquisition: "captain", price: 0 }),
  player({ id: "r2", role: "jungle", team_id: "t1", acquisition: "free_agency", price: 0 }),
];

describe("openRoles / maxBid", () => {
  it("lists unfilled roles in order", () => {
    expect(openRoles("t1", roster)).toEqual(["mid", "adc", "support"]);
  });
  it("cap keeps a point per other open role", () => {
    expect(maxBid(team(), roster)).toBe(18); // 20 - (3-1)
  });
});

describe("bidBlockReason", () => {
  const p = player();
  it("allows a legal raise", () => {
    expect(bidBlockReason(team(), lot(), p, roster, 11)).toBeNull();
  });
  it("blocks the current leader", () => {
    expect(bidBlockReason(team(), lot({ leading_team_id: "t1" }), p, roster, 11)).toMatch(/high bid/);
  });
  it("blocks a filled role", () => {
    expect(bidBlockReason(team(), lot(), player({ role: "top" }), roster, 11)).toMatch(/already have/);
  });
  it("blocks a low raise and over-cap", () => {
    expect(bidBlockReason(team(), lot(), p, roster, 10)).toMatch(/at least 11/);
    expect(bidBlockReason(team(), lot(), p, roster, 19)).toMatch(/max bid is 18/);
  });
});

describe("nominateBlockReason", () => {
  it("allows the nominator a needed role they can afford", () => {
    expect(nominateBlockReason(team(), player(), draft(), roster)).toBeNull();
  });
  it("blocks when not your turn / player taken / role filled", () => {
    expect(nominateBlockReason(team(), player(), draft({ current_nominator_team_id: "t2" }), roster)).toMatch(/turn/);
    expect(nominateBlockReason(team(), player({ team_id: "t9" }), draft(), roster)).toMatch(/taken/);
    expect(nominateBlockReason(team(), player({ role: "top" }), draft(), roster)).toMatch(/already have/);
  });
  it("blocks when the round minimum exceeds the cap", () => {
    expect(nominateBlockReason(team({ points_remaining: 11 }), player(), draft(), roster)).toMatch(/afford/);
  });
});
```

- [ ] **Step 2: Run — must fail** (`derive.ts` missing)

```powershell
npm test
```

- [ ] **Step 3: Implement `derive.ts`**

```ts
import { ROLE_ORDER, type Draft, type Lot, type LolRole, type Player, type Team } from "./types";

export function openRoles(teamId: string, players: Player[]): LolRole[] {
  const filled = new Set(players.filter((p) => p.team_id === teamId).map((p) => p.role));
  return ROLE_ORDER.filter((r) => !filled.has(r));
}

export function maxBid(team: Team, players: Player[]): number {
  return team.points_remaining - (openRoles(team.id, players).length - 1);
}

export function bidBlockReason(
  team: Team, lot: Lot, lotPlayer: Player, players: Player[], amount: number
): string | null {
  if (lot.status !== "open") return "Auction is over";
  if (lot.leading_team_id === team.id) return "You hold the high bid";
  if (!openRoles(team.id, players).includes(lotPlayer.role)) return `You already have a ${lotPlayer.role}`;
  if (amount < lot.current_bid + 1) return `Bid at least ${lot.current_bid + 1}`;
  if (amount > maxBid(team, players)) return `Your max bid is ${maxBid(team, players)}`;
  return null;
}

export function nominateBlockReason(
  team: Team, player: Player, draft: Draft, players: Player[]
): string | null {
  if (draft.status !== "live") return "Draft is not live";
  if (draft.current_nominator_team_id !== team.id) return "Not your turn";
  if (player.team_id !== null) return "Player already taken";
  if (!openRoles(team.id, players).includes(player.role)) return `You already have a ${player.role}`;
  const min = draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1];
  if (min > maxBid(team, players)) return `You can't afford the ${min}-point opening bid`;
  return null;
}
```

- [ ] **Step 4: Run — pass** (`npm test`)

- [ ] **Step 5: Implement `useDraftState`**

`src/hooks/useDraftState.ts` — the shape below is canonical; implement exactly:

```ts
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchServerOffset, remainingMs } from "@/lib/time";
import type { Bid, Draft, Lot, Player, Team } from "@/lib/draft/types";

export function useDraftState(draftId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [connected, setConnected] = useState(false);

  const refetch = useCallback(async () => {
    const [d, t, p, l] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", draftId).single(),
      supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
      supabase.from("lots").select("*").eq("draft_id", draftId).order("created_at"),
    ]);
    setDraft((d.data as Draft) ?? null);
    setTeams((t.data as Team[]) ?? []);
    setPlayers((p.data as Player[]) ?? []);
    const lotRows = (l.data as Lot[]) ?? [];
    setLots(lotRows);
    if (lotRows.length) {
      const { data: b } = await supabase.from("bids").select("*")
        .in("lot_id", lotRows.map((x) => x.id)).order("id");
      setBids((b as Bid[]) ?? []);
    } else setBids([]);
  }, [supabase, draftId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setProfileId(data.user?.id ?? null));
    fetchServerOffset(supabase).then(setOffsetMs);

    const upsert = <T extends { id: unknown }>(rows: T[], row: T) => {
      const i = rows.findIndex((r) => r.id === row.id);
      return i === -1 ? [...rows, row] : rows.map((r, j) => (j === i ? row : r));
    };
    const channel = supabase
      .channel(`draft:${draftId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "drafts", filter: `id=eq.${draftId}` },
        (m) => setDraft(m.new as Draft))
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `draft_id=eq.${draftId}` },
        (m) => setTeams((cur) => upsert(cur, m.new as Team)))
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `draft_id=eq.${draftId}` },
        (m) => setPlayers((cur) => upsert(cur, m.new as Player)))
      .on("postgres_changes", { event: "*", schema: "public", table: "lots", filter: `draft_id=eq.${draftId}` },
        (m) => setLots((cur) => upsert(cur, m.new as Lot)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bids" },
        (m) => setBids((cur) => upsert(cur, m.new as Bid)))
      .subscribe((status) => {
        const ok = status === "SUBSCRIBED";
        setConnected(ok);
        if (ok) void refetch(); // initial load AND catch-up after reconnect
      });
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, draftId, refetch]);

  const openLot = useMemo(() => lots.find((l) => l.status === "open") ?? null, [lots]);
  const myTeam = useMemo(
    () => teams.find((t) => t.captain_profile_id === profileId) ?? null,
    [teams, profileId]
  );

  // Auto-close: first client to notice expiry finalizes the sale; retry every
  // 2s while the lot stays open in case a realtime message was dropped.
  const closing = useRef<string | null>(null);
  useEffect(() => {
    if (!openLot || draft?.status !== "live") return;
    const tryClose = () => {
      if (remainingMs(openLot.closes_at, offsetMs) === 0 && closing.current !== openLot.id) {
        void supabase.rpc("close_lot", { p_lot_id: openLot.id });
      }
    };
    const id = setInterval(tryClose, 2000);
    const t = setTimeout(tryClose, remainingMs(openLot.closes_at, offsetMs) + 100);
    return () => { clearInterval(id); clearTimeout(t); };
  }, [openLot, draft?.status, offsetMs, supabase]);

  return { draft, teams, players, lots, bids, profileId, myTeam, openLot, offsetMs, connected, refetch };
}
```

(`closing.current` is set to `openLot.id` right before the rpc call inside `tryClose` — one attempt per interval tick is fine; the RPC is a no-op server-side when already closed.)

- [ ] **Step 6: Type-check, build, commit**

```powershell
npm run build
git add -A; git commit -m "feat: eligibility helpers and realtime draft state hook with auto-close"
```

---

### Task 13: Board UI — spectator (read-only) view of `/draft/[id]`

**Files:**
- Create: `src/app/draft/[id]/page.tsx`, `src/components/draft/DraftBoard.tsx`, `src/components/draft/CenterStage.tsx`, `src/components/draft/TeamColumn.tsx`, `src/components/draft/PlayerPool.tsx`, `src/components/draft/BidFeed.tsx`
- Modify: `src/app/page.tsx` — list drafts (`select * from drafts order by created_at desc`) linking to `/draft/[id]`

**Interfaces:**
- Consumes: `useDraftState`, `useCountdown`, `derive.ts`, types.
- Produces: component props (Task 14/15 slot into these):
  - `DraftBoard` (client) — owns `useDraftState`, renders everything, and renders two slots: `captainControls` and `adminControls` (both `React.ReactNode`, rendered when non-null; Tasks 14–15 fill them from within `DraftBoard` itself — see below).
  - `CenterStage({ lot, player, leadingTeam, secondsLeft, paused })`
  - `TeamColumn({ team, players, isNominator, isMyTeam })` — 5 role slots in `ROLE_ORDER`, filled slots show name + price (badge `C` for captain, `FA` for free-agency), footer shows `points_remaining`/`budget_start`.
  - `PlayerPool({ players, teams })` — search input + role filter chips; available players sorted by name; sold players struck through with buyer + price.
  - `BidFeed({ bids, teams, players, lots })` — newest first, "Team B bid 15 on Mid1".

Layout (desktop-first, Tailwind grid): header strip (draft name, round + minimum, status badge, realtime-disconnected banner when `!connected`) · main row = team columns left … center stage middle … bid feed right · player pool full-width below. Status screens replace the board: `setup` → "Draft hasn't started" lobby; `paused` → board with a yellow "Paused by admin" banner (countdown frozen — `useCountdown` naturally shows the stored remaining because `closes_at` stops moving only after resume; simply hide seconds and show "PAUSED" in `CenterStage` when `draft.status === 'paused'`); `complete` → final rosters + prices summary (reuse `TeamColumn`s, add total spent per team).

- [ ] **Step 1: Route + board skeleton**

`src/app/draft/[id]/page.tsx`:
```tsx
import DraftBoard from "@/components/draft/DraftBoard";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DraftBoard draftId={id} />;
}
```

`DraftBoard.tsx` core shape (fill in with the components below):
```tsx
"use client";
import { useDraftState } from "@/hooks/useDraftState";
import { useCountdown } from "@/hooks/useCountdown";
// ... CenterStage, TeamColumn, PlayerPool, BidFeed imports

export default function DraftBoard({ draftId }: { draftId: string }) {
  const s = useDraftState(draftId);
  const { secondsLeft } = useCountdown(
    s.draft?.status === "live" ? (s.openLot?.closes_at ?? null) : null,
    s.offsetMs
  );
  if (!s.draft) return <main className="p-8">Loading draft…</main>;
  const lotPlayer = s.openLot ? s.players.find((p) => p.id === s.openLot!.player_id) ?? null : null;
  // header, status branches, grid of TeamColumn/CenterStage/BidFeed/PlayerPool
  // captainControls / adminControls slots stay null in this task
}
```

- [ ] **Step 2: Implement the four presentational components**

Keep each under ~80 lines, props exactly as in Interfaces. `CenterStage` shows: player name/role/rank/op.gg link, `current_bid` huge, leading team name, `secondsLeft` in a large monospace block that turns red at ≤ 5, or "PAUSED", or — when no lot is open — "Waiting for {nominator team} to nominate…".

- [ ] **Step 3: Seed data and verify by hand**

Seed a demo draft through Studio SQL editor (paste the body of `tests.fixture()` from Task 4 adapted: run its inserts directly, then `update drafts set status='live', current_nominator_team_id=(...)`). Open `/draft/<id>` in two browser windows; in Studio run
`select nominate(...)` as impossible — instead simulate with SQL:
```sql
update public.lots ... -- not needed; simplest: insert a lot row directly
insert into public.lots (draft_id, player_id, nominated_by_team_id, round, opening_bid, current_bid, leading_team_id, closes_at)
select d.id, p.id, t.id, 1, 10, 10, t.id, now() + interval '60 seconds'
from public.drafts d, public.players p, public.teams t
where d.name='Test Draft' and p.display_name='Mid1' and t.nomination_position=1 and t.draft_id=d.id;
```
Expected: both windows show the lot appear live without refresh; countdown ticks in sync; when it expires the auto-close fires and the player lands on team 1's roster in both windows.

- [ ] **Step 4: Build + commit**

```powershell
npm run build
git add -A; git commit -m "feat: realtime draft board (spectator view)"
```

---

### Task 14: Captain controls — bidding + nomination

**Files:**
- Create: `src/components/draft/BidControls.tsx`, `src/components/draft/NominationPicker.tsx`, `src/components/draft/Toast.tsx`
- Modify: `src/components/draft/DraftBoard.tsx` (render the controls when `myTeam` is set)

**Interfaces:**
- Consumes: `useDraftState` values, `bidBlockReason` / `nominateBlockReason` / `maxBid`, `errCode`.
- Produces:
  - `BidControls({ team, lot, lotPlayer, players, onError })` — quick-bid button "Bid {current+1}" plus a number input + "Bid" button. Before calling, run `bidBlockReason`; if non-null render the reason under disabled buttons. Calls `supabase.rpc("place_bid", { p_lot_id, p_amount })`; on error, `onError(friendly(errCode(e)))`.
  - `NominationPicker({ team, draft, players, onError })` — rendered only when `draft.current_nominator_team_id === team.id && !openLot`; lists available players grouped by the team's open roles; each row has a "Nominate (opens at {min})" button, disabled with reason from `nominateBlockReason`. Calls `supabase.rpc("nominate", { p_draft_id, p_player_id })`.
  - `Toast` — minimal fixed-corner error toast, auto-dismisses in 4s. `DraftBoard` holds `const [toast, setToast] = useState<string|null>(null)` and passes `setToast` as `onError`.
  - `friendly(code: string): string` map (exported from `Toast.tsx`): `BID_TOO_LOW → "Too slow — someone raised first."`, `LOT_EXPIRED → "Too late — the hammer already fell."`, `OVER_CAP → "That bid would strand a roster slot."`, `NOT_YOUR_TURN → "It's not your nomination."`, fallback: the raw message after the code.

- [ ] **Step 1: Wire `BidControls`**

```tsx
"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bidBlockReason, maxBid } from "@/lib/draft/derive";
import { errCode, type Lot, type Player, type Team } from "@/lib/draft/types";
import { friendly } from "./Toast";

export default function BidControls({ team, lot, lotPlayer, players, onError }: {
  team: Team; lot: Lot; lotPlayer: Player; players: Player[];
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const quick = lot.current_bid + 1;
  const [amount, setAmount] = useState<number>(quick);
  const place = async (a: number) => {
    const blocked = bidBlockReason(team, lot, lotPlayer, players, a);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("place_bid", { p_lot_id: lot.id, p_amount: a });
    if (error) onError(friendly(errCode(error)));
  };
  const quickBlocked = bidBlockReason(team, lot, lotPlayer, players, quick);
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <button className="rounded bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40"
        disabled={!!quickBlocked} onClick={() => place(quick)}>
        Bid {quick}
      </button>
      <input type="number" className="w-24 rounded border p-2" value={amount}
        min={quick} max={maxBid(team, players)}
        onChange={(e) => setAmount(Number(e.target.value))} />
      <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-40"
        disabled={!!bidBlockReason(team, lot, lotPlayer, players, amount)}
        onClick={() => place(amount)}>
        Bid
      </button>
      {quickBlocked && <span className="text-sm opacity-70">{quickBlocked}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Wire `NominationPicker`** — same pattern: group `players.filter(p => !p.team_id)` by `openRoles(team.id, players)`, row buttons call the `nominate` rpc, disabled reasons from `nominateBlockReason`. Include a search input reusing the `PlayerPool` filter approach.

- [ ] **Step 3: `Toast.tsx` + slot into `DraftBoard`** — render `BidControls` when `myTeam && openLot && lotPlayer`, `NominationPicker` when it's my nomination and no open lot. Show a subtle "You are Team {name} — {points} pts, max bid {maxBid}" ribbon for captains.

- [ ] **Step 4: Verify by hand (two captains)**

Two browser profiles (normal + incognito), signed in as `cap1@test.local` and `cap2@test.local` (create in Studio; link to teams: `update teams set captain_profile_id='<uid>' ...`). Captain 1 nominates from the picker; captain 2 quick-bids; watch the countdown reset both sides; let it expire → sale lands, turn advances, captain 2's ribbon updates points. Try illegal actions (bid as leader, bid over cap) → friendly toasts, server never accepts them.

- [ ] **Step 5: Build + commit**

```powershell
npm run build
git add -A; git commit -m "feat: captain bid controls and nomination picker"
```

---

### Task 15: Admin — control strip + setup pages

**Files:**
- Create: `src/components/draft/AdminStrip.tsx`, `src/app/admin/page.tsx`, `src/app/admin/[draftId]/page.tsx`, `src/components/admin/TeamEditor.tsx`, `src/components/admin/PlayerPoolEditor.tsx`
- Modify: `src/components/draft/DraftBoard.tsx` (render `AdminStrip` for admins)

**Interfaces:**
- Consumes: admin RPCs (Tasks 8–9), admin RLS write policies (Task 3), `useDraftState`.
- Produces:
  - `AdminStrip({ draft, openLot, onError })` — buttons: Pause/Resume (toggle by status), Undo last sale, Cancel lot + Force close (only when `openLot`), countdown-seconds number input + Save (`update_draft_settings`). Every button `confirm()`s first. Admin detection: `profiles.is_admin` fetched once in `useDraftState` → expose `isAdmin: boolean` from the hook (add it there: `supabase.from("profiles").select("is_admin").eq("id", uid).single()`).
  - `/admin` — list all drafts + "New draft" (insert via supabase client — allowed by `drafts_admin_write`), delete draft (only `status='setup'`).
  - `/admin/[draftId]` — setup editor, all direct table writes under admin RLS:
    - `TeamEditor` — add/remove teams; per team: name, nomination position, budget (`budget_start` and `points_remaining` set together), captain link (dropdown of all `profiles` by display name), and the two pre-fill players (name + role each, saved as players with `acquisition='captain'|'free_agency'`, `price=0`, `team_id=`team).
    - `PlayerPoolEditor` — table of pool players (name, role, rank, op.gg, delete) + CSV paste textarea: one player per line `name,role[,rank[,opgg_url]]`; parse client-side, validate roles against `ROLE_ORDER`, bulk insert; show per-line errors.
    - "Start draft" button → `supabase.rpc("start_draft", ...)`; on `SETUP_INVALID` show the server's reason verbatim (it names the offending teams/roles); on success navigate to `/draft/[id]`.
- Non-admins hitting `/admin*` get redirected home (server-side check in the page: `createServerSupabase()` → profiles.is_admin).

- [ ] **Step 1: Extend `useDraftState` with `isAdmin`** (one extra query beside `getUser()`).

- [ ] **Step 2: `AdminStrip`** — thin buttons over rpcs, e.g. `supabase.rpc("pause_draft", { p_draft_id: draft.id })`, errors → `onError(friendly(errCode(e)))`.

- [ ] **Step 3: `/admin` list + create** (server component with a small client form).

- [ ] **Step 4: `/admin/[draftId]` setup editor** — client components; every mutation is a plain `.insert/.update/.delete` on `teams`/`players`/`drafts`; refresh local lists after each write (simple `router.refresh()` or refetch — no realtime needed in setup).

- [ ] **Step 5: Verify by hand — full dress rehearsal**

As the admin user (set `is_admin=true` in Studio): create a fresh draft entirely through the UI — 3 teams, budgets 100/90/80, captains linked to three dev users, pre-fills, 9-player pool via CSV paste. Click Start → expect `SETUP_INVALID` complaints until setup is right, then live board. Run a few sales with two captain windows; use Pause (clock freezes for everyone), Resume, Undo (player returns, points refund), Cancel, Force close. Everything updates on all windows without refresh.

- [ ] **Step 6: Build + commit**

```powershell
npm run build
git add -A; git commit -m "feat: admin control strip and draft setup pages"
```

---

### Task 16: Playwright end-to-end smoke — two captains, one sale

**Files:**
- Create: `playwright.config.ts`, `e2e/draft.spec.ts`, `e2e/seed.ts`
- Modify: `package.json` (script `"e2e": "playwright test"`)

**Interfaces:**
- Consumes: the whole running system (local Supabase + `npm run dev`).
- Produces: a repeatable smoke test proving the realtime auction loop.

- [ ] **Step 1: Install**

```powershell
npm install -D @playwright/test
npx playwright install chromium
```

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

- [ ] **Step 2: Seed script**

`e2e/seed.ts` — run with `npx tsx e2e/seed.ts` (add `tsx` as a dev dep). Uses the **service_role key** (from `supabase status`, env var `SUPABASE_SERVICE_ROLE_KEY` set in the shell, never committed) with `createClient(url, serviceKey, { auth: { persistSession: false } })`:
1. `auth.admin.createUser({ email: 'e2e-cap1@test.local', password: 'password123', email_confirm: true })` ×2 (ignore "already registered" errors).
2. Reset any prior e2e draft: `delete from drafts where name = 'E2E Draft'` (cascade cleans children; the trigger-created profiles stay).
3. Insert the fixture league exactly like `tests.fixture()` (Task 4) but named `E2E Draft`, 2 teams, captains = the two created users' ids, countdown **6 seconds** (fast test), pool of 3 mid/3 adc/3 support, then set it live with team 1 nominating (same as `tests.go_live`).
4. Print the draft id to stdout / write to `e2e/.draft-id`.

- [ ] **Step 3: The spec**

`e2e/draft.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("email").fill(email);
  await page.getByPlaceholder("password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("/");
}

test("two captains run one auction to settlement", async ({ browser }) => {
  execSync("npx tsx e2e/seed.ts", { stdio: "inherit" });
  const draftId = readFileSync("e2e/.draft-id", "utf8").trim();

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const cap1 = await ctx1.newPage();
  const cap2 = await ctx2.newPage();
  await signIn(cap1, "e2e-cap1@test.local");
  await signIn(cap2, "e2e-cap2@test.local");
  await cap1.goto(`/draft/${draftId}`);
  await cap2.goto(`/draft/${draftId}`);

  // captain 1 nominates the first available mid
  await cap1.getByRole("button", { name: /^Nominate/ }).first().click();
  await expect(cap2.getByText(/Mid1/)).toBeVisible();

  // captain 2 outbids; both boards show the new price
  await cap2.getByRole("button", { name: "Bid 11" }).click();
  await expect(cap1.getByText("11", { exact: true }).first()).toBeVisible();

  // let the 6s clock run out -> sale settles on both boards
  await expect(cap1.getByText(/sold|Waiting for/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(cap2.getByText(/Mid1/).first()).toBeVisible(); // now on team 2's roster column
});
```

Selector note: adjust `getByText` targets to the exact copy Task 13/14 produced — the *behavioral* assertions (lot appears on the other browser, price propagates, sale settles without refresh) are the contract; keep them.

- [ ] **Step 4: Run — green**

```powershell
npx supabase start
npm run e2e
```

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "test: two-captain realtime auction e2e smoke"
```

---

### Task 17: Deploy — Supabase cloud, Discord OAuth, Vercel

**Files:**
- Create: `README.md` (setup + deploy runbook)
- Modify: none (config lives in dashboards + Vercel env)

**Interfaces:**
- Consumes: everything.
- Produces: the live site.

Several steps here need the **user's** browser logins (Supabase, Discord, Vercel dashboards) — do them together or hand the user this checklist.

- [ ] **Step 1: Supabase cloud project** — create at supabase.com (free tier), then:

```powershell
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```
`db push` applies all six migrations. Verify in the cloud SQL editor: `select count(*) from pg_proc where proname in ('nominate','place_bid','close_lot');` → 3.

- [ ] **Step 2: Discord OAuth app** — discord.com/developers → New Application → OAuth2:
  - Redirect URL: `https://<project-ref>.supabase.co/auth/v1/callback`
  - Copy Client ID + Secret into Supabase Dashboard → Auth → Providers → Discord (enable).
  - In Supabase Auth → URL Configuration: Site URL = the Vercel prod URL (add after Step 3), plus `http://localhost:3000` in Additional Redirect URLs.

- [ ] **Step 3: Vercel** — vercel.com → Import the `SundayKoi/FPL_website` GitHub repo (framework auto-detected). Set env vars `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the cloud project's values. Deploy. Then complete the Site URL in Step 2.

- [ ] **Step 4: Production smoke** — sign in with a real Discord account; in the Supabase dashboard set that profile `is_admin=true`; create a tiny 2-team draft with two Discord accounts and run one auction on phones/laptops. Verify countdown sync and sale settlement.

- [ ] **Step 5: README** — write the runbook: prerequisites (Node, Docker), `npx supabase start` + `.env.local` setup, `npm run dev`, test commands (`npx supabase test db`, `npm test`, `npm run e2e`), deploy steps (this task, condensed), and a "draft night ops" section (make someone admin; pause/undo powers; free-tier limits note: 200 realtime connections, project pauses after 1 week idle — open the dashboard before draft night to wake it).

- [ ] **Step 6: Commit**

```powershell
git add README.md; git commit -m "docs: setup and deploy runbook"; git push
```

---

## Self-Review Notes (issues found and fixed inline)

- **Spec coverage check:** every spec section maps to a task — schema/RLS/realtime (3), auction rules (5–7), lifecycle + validation (8), admin overrides (9), auth roles (10), clock-skew handling (11), board UI three-ways (13–15), CSV pool + captain linking (15), e2e (16), free-tier deploy (17). Round minimums beyond round 3 clamp to the last element (`nominate`), matching "3 picks in 3 rounds" while surviving odd states after undos.
- **Type consistency:** RPC arg names (`p_draft_id`, `p_player_id`, `p_lot_id`, `p_amount`, `p_countdown_seconds`) are what the TS `supabase.rpc(...)` calls pass — PostgREST matches by name; keep them exact. Error codes in Task 3's convention list match every `raise exception` and the `friendly()` map.
- **Known simplification:** `bids` realtime subscription is unfiltered (PostgREST filter can't join through `lot_id`); rows for other drafts are upserted into state but never rendered (BidFeed renders via this draft's lots). Harmless at league scale; revisit if multiple concurrent drafts become common.
- **Pause nuance:** pausing does not rewrite `closes_at` (only resume does), so `CenterStage` must key off `draft.status === 'paused'` to hide the ticking number — noted in Task 13.







