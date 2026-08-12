# Match Reporting + Automatic Stats Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captains file match reports on the site; a 2am GitHub Actions job ingests them into `raw_stats` with the correct team, season and phase — no local runs, no manual match-id typing — and fills in the schedule's scores as a bonus.

**Architecture:** Six new tables hold league config, rosters and the report queue (public-read, captain/admin-write via RLS). A paste-parser turns a Discord report into a pre-filled form. The existing Python ingester gains a `--from-reports` mode that drains the queue, resolves which LoL side is which FPL team (roster lookup or explicit override), writes stats, and reports status back.

**Tech Stack:** Existing Next.js 16 + Tailwind brand system, Supabase (Postgres RLS), pgTAP, Vitest, Python 3 (`requests` + `python-dotenv`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md` — read it first; its schema and report-format sections are canonical.

## Global Constraints

- MERGE AMENDMENT (2026-08-11): a co-developer shipped overlapping work today; each affected task carries a **MERGE AMENDMENT** note and `.superpowers/sdd/2026-08-11-match-reporting-auto-ingest/overlap-analysis.md` holds the full rationale. Headlines: `league_settings.current_season/current_phase` already exists (do not rebuild it or its editor), `match_reports` gains an optional `fixture_id` linking to the shipped schedule table, and `--from-reports` must bypass the script's new global season/phase guard.
- Table/column names exactly as the spec's data model. Six tables: `league_settings`, `league_teams`, `riot_accounts`, `roster_memberships`, `match_reports`, `match_report_games`.
- `league_teams.name` must match `raw_stats.team_name` values exactly (seed from `select distinct team_name from raw_stats`); `abbreviation` 1–5 chars, unique.
- RLS: public `select` on all six; insert on `match_reports`/`match_report_games` for admins **or** captains (`exists (select 1 from teams where captain_profile_id = auth.uid())`); update on `match_report_games` for that same set while the parent report is not `ingested`; `match_reports` update + all deletes admin-only, except a submitter may delete their own `pending` report; `league_settings`/`league_teams`/`riot_accounts`/`roster_memberships` admin-write only; `raw_stats` stays service-role-write only.
- Status vocabularies exactly: report `pending|ingested|needs_sides|failed`; game `pending|ingested|needs_side|failed` (singular on games — deliberate).
- Match ids stored full (`NA1_5568297187`); `match_report_games.match_id` is globally unique.
- Ingest is idempotent (existing `on_conflict=match_id,summoner_name` + `resolution=ignore-duplicates`); a match id already in `raw_stats` marks its game `ingested` and skips.
- No secrets in the repo. GitHub Actions secrets: `RIOT_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Lint rule `react-hooks/set-state-in-effect` is an ERROR (fetch in async callbacks; render-phase adjust pattern per `useCountdown`). Brand utilities: `card-brand`, `label-dash`, `type-display`, `btn-pill`, tokens `bg-navy`/`bg-panel`/`border-line`/`text-steel`/gold, chips with `aria-pressed`.
- Gates every task: `npm run build`, `npm run lint` exit 0, `npm test`, `npx supabase test db` (if pgTAP flakes on `0010`, do `npx supabase db reset` + `npx tsx scripts/load-stats.ts` then retest), plus `python scripts/test_riot_stats_ingest.py` for Python-touching tasks. One `npm run e2e` in Tasks 4 and 9 (retry once on the known draft warm-up flake).
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Production rollout (Task 9) targets project ref `tyywoneobreracfnujdk` ONLY. `jmhgextkwsaodtnjtvvp` ("Draft League") must never be touched.

## File Structure

```
supabase/migrations/20260811100001_league_config.sql   (T1 — league_settings, league_teams, riot_accounts, roster_memberships + RLS + seed)
supabase/migrations/20260811100002_match_reports.sql   (T2 — match_reports, match_report_games + RLS)
supabase/tests/0018_league_config_test.sql             (T1)
supabase/tests/0019_match_reports_test.sql             (T2)
src/lib/matches/parseReport.ts                         (T3 — pure paste parser)
src/lib/matches/parseReport.test.ts                    (T3)
src/lib/matches/types.ts                               (T3 — row types for the six tables)
src/lib/matches/queries.ts                             (T4 — fetch/insert helpers)
src/app/matches/page.tsx                               (T5 — public report list)
src/app/matches/report/page.tsx                        (T4 — report form)
src/components/matches/ReportForm.tsx                  (T4)
src/components/matches/ReportList.tsx                  (T5)
src/components/matches/NeedsSidesFixer.tsx             (T5)
src/components/SiteNavigation.tsx                      (T5 — add Matches entry)
src/components/matches/LeagueTeamsEditor.tsx           (T6 — LeagueSettingsEditor DROPPED, see T6)
src/components/matches/RosterEditor.tsx                (T6; both mount on /matches, not /admin)
scripts/riot_stats_ingest.py                           (T7 — --from-reports mode)
scripts/test_riot_stats_ingest.py                      (T7 — side-resolution + status tests)
.github/workflows/ingest-stats.yml                     (T7)
README.md                                              (T7 — workflow + secrets docs)
```

---

### Task 1: League config tables (settings, teams, riot accounts, rosters)

**Files:**
- Create: `supabase/migrations/20260811100001_league_config.sql`
- Test: `supabase/tests/0018_league_config_test.sql`

**Interfaces:**
- Produces (later tasks depend on these names):
  - `league_settings(id smallint pk default 1 check (id = 1), current_season text not null default 'S5', current_phase text not null default 'Regular')` — one seeded row.
  - `league_teams(id uuid pk default gen_random_uuid(), name text unique not null, abbreviation text unique not null check (char_length(trim(abbreviation)) between 1 and 5), active boolean not null default true)` — seeded from `select distinct team_name from public.raw_stats where team_name is not null and team_name <> ''`, abbreviation = uppercased initials of the words (dedupe collisions by appending a digit; the seed must not violate the unique index).
  - `riot_accounts(id uuid pk, game_name text not null, tag_line text not null, display_name text)` + `create unique index riot_accounts_key on riot_accounts (lower(game_name), lower(tag_line))`.
  - `roster_memberships(id uuid pk, riot_account_id uuid not null references riot_accounts(id) on delete cascade, season text not null, league_team_id uuid not null references league_teams(id) on delete cascade, unique (riot_account_id, season))`.
  - RLS per Global Constraints; `grant select` to `anon, authenticated` on all four; `grant insert, update, delete` on all four to `authenticated` (RLS admin policies do the real gating); `grant all` to `service_role`; sequence/table grants consistent with migration `20260810100001`'s pattern.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/0018_league_config_test.sql`, `plan(10)`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(10);

select has_table('public','league_settings','league_settings exists');
select has_table('public','league_teams','league_teams exists');
select has_table('public','riot_accounts','riot_accounts exists');
select has_table('public','roster_memberships','roster_memberships exists');

-- single settings row seeded
select is((select count(*)::int from public.league_settings), 1, 'exactly one settings row');
select throws_ok($$ insert into public.league_settings (id, current_season, current_phase) values (2,'S6','Regular') $$,
  null, 'settings table refuses a second row');

-- teams seeded from raw_stats names (raw_stats is empty inside this test transaction,
-- so assert the seed ran at migration time by checking the table is non-empty OR
-- that inserting a duplicate abbreviation fails)
select ok(exists (select 1 from public.league_teams), 'league_teams seeded');
select throws_ok($$
  insert into public.league_teams (name, abbreviation)
  select 'Dupe Team ' || id, abbreviation from public.league_teams limit 1
$$, null, 'abbreviation is unique');

-- access
select ok(has_table_privilege('anon','public.league_teams','select'), 'anon reads league_teams');
select ok(not has_table_privilege('anon','public.league_teams','insert'), 'anon cannot insert league_teams');

select * from finish();
rollback;
```

Run `npx supabase test db` → the new file fails (tables missing); existing 216 stay green.

- [ ] **Step 2: Write the migration.** Create the four tables per Interfaces. Seed settings with `insert into public.league_settings (id) values (1) on conflict do nothing;`. Seed teams with a CTE that computes initials and de-duplicates:

```sql
with names as (
  select distinct team_name as name from public.raw_stats
  where team_name is not null and team_name <> ''
), abbrev as (
  select name,
         upper(left(regexp_replace(
           (select string_agg(left(w, 1), '' order by ord)
              from unnest(regexp_split_to_array(trim(name), '\s+')) with ordinality as t(w, ord)
             where w <> ''), '[^A-Za-z0-9]', '', 'g'), 5)) as base
    from names
), numbered as (
  select name, base,
         row_number() over (partition by base order by name) as rn
    from abbrev
)
insert into public.league_teams (name, abbreviation)
select name,
       case when rn = 1 then base else left(base, 4) || rn::text end
  from numbered
on conflict (name) do nothing;
```

Add RLS: enable on all four; `create policy <t>_public_read on public.<t> for select using (true);` and `create policy <t>_admin_write on public.<t> for all using (public.is_admin()) with check (public.is_admin());` for each. Then grants per Interfaces.

- [ ] **Step 3: Apply + test.** `npx supabase db reset` → `npx tsx scripts/load-stats.ts` → `npx supabase test db`. All green (note: the seed runs during reset when `raw_stats` is empty, so `league_teams` will be EMPTY after a bare reset — that breaks the "seeded" assertion. Fix by making the migration's seed idempotent AND re-runnable: put the seed CTE into a function `public.sync_league_teams_from_stats()` that the migration calls, and have `scripts/load-stats.ts` call it via `rpc` after loading. Then the pgTAP assertion becomes `ok(true)`-safe because the loader ran before tests. Implement it that way.)
- [ ] **Step 4: Adjust the loader.** `scripts/load-stats.ts`: after all batches succeed, `POST /rest/v1/rpc/sync_league_teams_from_stats` (service key) and log how many teams exist afterwards.
- [ ] **Step 5: Gates + commit** `feat: league config tables (settings, teams, riot accounts, rosters)`.

### Task 2: Match report queue tables

**Files:**
- Create: `supabase/migrations/20260811100002_match_reports.sql`
- Test: `supabase/tests/0019_match_reports_test.sql`

**Interfaces:**
- Consumes: `league_teams` (T1), `profiles`/`teams` (existing), `public.is_admin()`.
- Produces:
  - `match_reports(id uuid pk default gen_random_uuid(), season text not null, season_phase text not null, team_a_id uuid not null references league_teams(id), team_b_id uuid not null references league_teams(id), score_a int not null default 0 check (score_a >= 0), score_b int not null default 0 check (score_b >= 0), draft_url text, submitted_by uuid references profiles(id), submitted_at timestamptz not null default now(), status text not null default 'pending' check (status in ('pending','ingested','needs_sides','failed')), error_text text, warning_text text, ingested_at timestamptz, check (team_a_id <> team_b_id))`.
  - `match_report_games(id uuid pk default gen_random_uuid(), report_id uuid not null references match_reports(id) on delete cascade, game_number int not null, match_id text not null unique, blue_team_id uuid references league_teams(id), resolved_blue_team_id uuid references league_teams(id), status text not null default 'pending' check (status in ('pending','ingested','needs_side','failed')), error_text text, unique (report_id, game_number))`.
  - **MERGE AMENDMENT (2026-08-11):** `match_reports` also gets `fixture_id uuid references public.fixtures(id) on delete set null` (nullable, deliberately NOT unique — a disputed series may be re-reported) plus `create index match_reports_fixture_id_idx on public.match_reports (fixture_id) where fixture_id is not null;`. This optionally links a report to a row of the schedule table a co-developer shipped today, enabling the score auto-fill in Task 8. Reports must NOT be children of `fixtures`: a series is one fixture but N Riot games with their own per-game status, `fixtures` is admin-write-only (captains must never gain write access to the public schedule), scrims/makeup games have no fixture at all, and `fixtures.team_a/team_b` is uncontrolled free text rather than a `league_teams` FK. Rationale in full: `.superpowers/sdd/2026-08-11-match-reporting-auto-ingest/overlap-analysis.md`.
  - Helper `public.is_captain() returns boolean` — `security definer`, `select exists (select 1 from public.teams where captain_profile_id = auth.uid())`.
  - RLS exactly per Global Constraints.

- [ ] **Step 1: Failing pgTAP** — `supabase/tests/0019_match_reports_test.sql`, `plan(14)` (12 below plus two for the amendment: `has_column('public','match_reports','fixture_id',…)`, and that deleting a linked `fixtures` row leaves the report with `fixture_id` null rather than deleting it): both tables exist; `has_function('public','is_captain')`; anon select allowed on both; anon insert denied on `match_reports`; a simulated captain (`tests.acting_as(tests.cap(1))` — the fixture's captain 1 has a `teams` row) can insert a report and a game; a simulated non-captain non-admin (`tests.acting_as(tests.cap(9))` after inserting a bare profile with no team) cannot; the unique `match_id` index rejects a duplicate; a bad `status` value is rejected by the check constraint; `team_a_id = team_b_id` is rejected. Use `lives_ok`/`throws_ok` and wrap inserts so the fixture's `league_teams` rows exist (insert two into `league_teams` inside the test since `raw_stats` is empty in-transaction).
- [ ] **Step 2: Migration.** Tables + `is_captain()` + policies:

```sql
create policy match_reports_public_read on public.match_reports for select using (true);
create policy match_reports_insert on public.match_reports for insert to authenticated
  with check (public.is_admin() or public.is_captain());
create policy match_reports_admin_update on public.match_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy match_reports_delete on public.match_reports for delete to authenticated
  using (public.is_admin() or (submitted_by = auth.uid() and status = 'pending'));

create policy match_report_games_public_read on public.match_report_games for select using (true);
create policy match_report_games_insert on public.match_report_games for insert to authenticated
  with check (public.is_admin() or public.is_captain());
create policy match_report_games_update on public.match_report_games for update to authenticated
  using ((public.is_admin() or public.is_captain())
         and exists (select 1 from public.match_reports r
                      where r.id = report_id and r.status <> 'ingested'))
  with check (public.is_admin() or public.is_captain());
create policy match_report_games_delete on public.match_report_games for delete to authenticated
  using (public.is_admin());
```

Grants: `select` to anon+authenticated; `insert, update, delete` to authenticated; `all` to service_role.

- [ ] **Step 3: Reset + reload + test green.**
- [ ] **Step 4: Gates + commit** `feat: match report queue tables`.

### Task 3: Paste parser + row types

**Files:**
- Create: `src/lib/matches/parseReport.ts`, `src/lib/matches/types.ts`
- Test: `src/lib/matches/parseReport.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `LeagueSettings`, `LeagueTeam`, `RiotAccount`, `RosterMembership`, `MatchReport`, `MatchReportGame` (mirror T1/T2 columns exactly — `MatchReport` therefore includes `fixture_id: string | null` per the Task 2 merge amendment), plus `ReportStatus`/`GameStatus` unions.
  - `parseReport.ts`: `export function parseReport(text: string, teams: LeagueTeam[]): ParsedReport` where `ParsedReport = { teamAId: string | null; teamBId: string | null; teamAToken: string | null; teamBToken: string | null; scoreA: number | null; scoreB: number | null; draftUrl: string | null; games: { gameNumber: number; matchId: string }[]; warnings: string[] }`. Rules: score line `^\s*([A-Za-z0-9]{1,5})\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z0-9]{1,5})\s*$` (first match wins), abbreviations matched case-insensitively against `teams[].abbreviation` then `teams[].name`; match ids from `\b\d{8,}\b` and `\bNA1_\d{8,}\b` (dedupe, preserve order, prefix bare numbers with `NA1_`); `gameNumber` from a `?game=(\d+)` on the same line when present else 1-based order; `draftUrl` = first `https://drafter.lol/...` with the query string stripped; unknown abbreviations produce a warning string naming the token and leave the id null.

- [ ] **Step 1: Failing tests** covering: the exact Discord example (3 games, MIC/BBC resolved by abbreviation, score 3-0, ids `NA1_5568297187/5568352310/5568409447`, draftUrl `https://drafter.lol/draft/T4cB_WHp`); already-prefixed `NA1_` ids; a single-game report with no score line (`scoreA/B` null, one game); an unknown abbreviation (`XYZ 1-0 MIC` → `teamAId` null + warning containing `XYZ`); extra prose lines ignored; duplicate id appearing twice counted once. Run `npm test` → fail.
- [ ] **Step 2: Implement** `types.ts` + `parseReport.ts` per Interfaces. `npm test` green.
- [ ] **Step 3: Gates + commit** `feat: match report paste parser`.

### Task 4: Report form page

**Files:**
- Create: `src/lib/matches/queries.ts`, `src/app/matches/report/page.tsx`, `src/components/matches/ReportForm.tsx`
- Modify: none

**Interfaces:**
- Consumes: `parseReport`, types (T3), `createClient` from `@/lib/supabase/client`, `createServerSupabase` from `@/lib/supabase/server`.
- Produces: `queries.ts` exports `fetchLeagueTeams(): Promise<LeagueTeam[]>`, `fetchLeagueSettings(): Promise<LeagueSettings | null>`, `fetchReports(limit?: number): Promise<(MatchReport & { games: MatchReportGame[] })[]>`, `fetchExistingMatchIds(ids: string[]): Promise<string[]>` (checks `match_report_games` AND `raw_stats`), `fetchOpenFixtures(season: string): Promise<Fixture[]>` (rows from `public.fixtures` for that season whose `score_a` is null, ordered by `sort_order`; `Fixture` mirrors that table's columns), `submitReport(input: SubmitReportInput): Promise<{ reportId: string }>` where `SubmitReportInput = { season: string; phase: string; teamAId: string; teamBId: string; scoreA: number; scoreB: number; draftUrl: string | null; fixtureId: string | null; games: { gameNumber: number; matchId: string; blueTeamId: string | null }[] }` (inserts the report then its games; on failure of the games insert, deletes the report row so no orphan queue entry survives).
- Form behaviour: page is a server component that gates on sign-in (`createServerSupabase().auth.getUser()`; signed-out shows a branded "Sign in to report" card with a `/login` link) and renders `ReportForm` with teams + settings fetched server-side. `ReportForm` (client): paste textarea → "Parse" button → fills team selects, score inputs, season/phase (defaults from settings), draft url, and a game row list (game number, match id, blue-side select with options Auto-detect / Team A / Team B). Rows are addable/removable manually. **MERGE AMENDMENT:** the form also carries an optional "Attach to schedule fixture" select, populated by `fetchOpenFixtures(season)` and labelled `<stage> — <team_a> vs <team_b>` (default "Not on the schedule"), whose value becomes `fixtureId` in the submit payload; Task 8 uses it to fill that fixture's score automatically. Submit validates: both teams set and different, ≥1 game, every match id matching `^NA1_\d+$`, no duplicate ids within the form, and none already known (`fetchExistingMatchIds`) — each failure shown inline. Success → redirect to `/matches`.

- [ ] Steps: write `queries.ts` → server page + gate → `ReportForm` → manual browser check with the exact Discord paste (scratch playwright, signed in as an admin/captain; verify the row lands in `match_reports` + 3 games via psql) → gates incl. one `npm run e2e` → commit `feat: match report form`.

### Task 5: Matches list + needs-sides fixer + nav

**Files:**
- Create: `src/app/matches/page.tsx`, `src/components/matches/ReportList.tsx`, `src/components/matches/NeedsSidesFixer.tsx`
- Modify: `src/components/SiteNavigation.tsx` (add `Matches` → `/matches` into the existing `NAV_LINKS` array, positioned immediately after `Schedule` since they are the same concept; the desktop bar and mobile hamburger both already tolerate another item)

**Interfaces:**
- Consumes: `queries.ts` (T4), types (T3).
- Produces: `ReportList` — public, newest first: each report a `card-brand` showing `TEAM_A_ABBREV score-score TEAM_B_ABBREV`, season/phase, submitter display name, submitted date, a status pill (pending steel / ingested emerald / needs_sides gold / failed red), per-game rows (game number, match id, per-game status, resolved blue team when known), and `error_text`/`warning_text` when present. Admins additionally get "Retry" (sets report `status='pending'`, clears `error_text`, and sets each non-ingested game back to `pending`) and "Delete". When `status = 'needs_sides'`, `NeedsSidesFixer` renders inline for admins **and** captains: a select per unresolved game (Team A / Team B) that writes `blue_team_id` and sets the game `status='pending'`, then flips the report to `pending` once no game remains unresolved.
- `queries.ts` gains `setGameBlueTeam(gameId: string, blueTeamId: string): Promise<void>`, `retryReport(reportId: string): Promise<void>`, `deleteReport(reportId: string): Promise<void>`.

- [ ] Steps: list page + component → fixer → nav entry → browser check (seed a report via psql in each status; verify badges + admin actions; verify a captain can set sides and an anonymous visitor sees no controls) → gates → commit `feat: matches list with needs-sides fixing`.

### Task 6: Admin editors (league teams, rosters)

**MERGE AMENDMENT (2026-08-11):** `LeagueSettingsEditor` is **DROPPED** — `src/components/schedule/AdminSeasonSettings.tsx`, already mounted on `/schedule`, already edits `league_settings.current_season/current_phase` with the same upsert-on-`id=1` pattern this task specified. Building a second one duplicates shipped work. The two remaining editors mount on **`/matches`** (behind the page's own `isAdmin` check), not `/admin`, following the co-developer's established precedent of embedding admin controls on the page they configure (`AdminFixturesEditor` and `AdminSeasonSettings` both live on `/schedule`).

**Files:**
- Create: `src/components/matches/LeagueTeamsEditor.tsx`, `src/components/matches/RosterEditor.tsx`
- Modify: `src/app/matches/page.tsx` (mount both for admins, each in a `card-brand` section with a `label-dash` heading, below the report list)

**Interfaces:**
- Consumes: types (T3), browser Supabase client; the `/matches` page's `isAdmin` flag (same server-side pattern `src/app/schedule/page.tsx` uses).
- Produces: `LeagueTeamsEditor` — table of `league_teams` with editable name/abbreviation/active, add row, delete row (guarded: refuse delete when the team is referenced by a report, surfacing the DB error message). `RosterEditor` — season selector (defaults to `league_settings.current_season`), team selector, list of that team's memberships showing `Name#TAG`, an add box accepting `Name#TAG` (splits on the last `#`; creates the `riot_accounts` row when absent via upsert on the lower-cased pair, then the membership), and a remove button per row; a paste-multiple textarea accepting one `Name#TAG` per line for bulk add.

- [ ] Steps: teams editor → roster editor → browser check as admin (add a roster entry, confirm rows in psql; confirm a signed-out visitor sees neither editor) → gates → commit `feat: admin editors for league teams and rosters`.

### Task 7: `--from-reports` ingest mode + GitHub Actions workflow

**Files:**
- Modify: `scripts/riot_stats_ingest.py`, `scripts/test_riot_stats_ingest.py`, `README.md`
- Create: `.github/workflows/ingest-stats.yml`

**Interfaces:**
- Consumes: T1/T2 tables via PostgREST with the service key; the script's existing `extract_stats`, `fetch_and_extract`, `RAW_STATS_COLUMNS`, `write_to_supabase`.
- Produces (functions must be importable by the test file):
  - `fetch_pending_reports(cfg) -> list[dict]` — GET `match_reports?status=in.(pending,needs_sides)&select=*,match_report_games(*)&order=submitted_at.asc`.
  - `load_roster_map(cfg, season) -> dict[tuple[str, str], str]` — GET `roster_memberships?season=eq.<season>&select=league_team_id,riot_accounts(game_name,tag_line)`; keys are `(game_name.lower(), tag_line.lower())`, values `league_team_id`.
  - `resolve_sides(match_data, report, game, roster_map) -> tuple[str | None, str | None, str | None]` — returns `(blue_team_id, red_team_id, reason_if_unresolved)`. Explicit `game["blue_team_id"]` wins immediately. Otherwise tally participants by `teamId` (100=blue, 200=red) mapping via `roster_map`, ignoring ids that aren't one of the report's two teams; resolve when exactly one side has hits and they are unanimous, or both sides have hits and they disagree with each other consistently (blue→X, red→Y with X≠Y); anything else is unresolved with a human-readable reason.
  - `ingest_report(cfg, report, team_names) -> dict` — per-game loop implementing spec steps 2–8, returning `{"status": ..., "games": [...], "warning": str | None, "error": str | None}` without performing network writes when `dry_run` is set.
  - `update_report_status(cfg, report_id, status, error_text, warning_text, ingested_at)` and `update_game_status(cfg, game_id, status, error_text, resolved_blue_team_id)` — PATCH helpers.
  - `match_ids_already_ingested(cfg, ids) -> set[str]` — GET `raw_stats?match_id=in.(...)&select=match_id`.
  - CLI: `--from-reports` (mutually exclusive with positional ids and `--dates`); requires the three env vars; `--dry-run` prints the plan without writing; exits 1 if any report ends `failed`.
  - **MERGE AMENDMENT (2026-08-11) — a real bug to fix, not just a design note.** A co-developer added a global season/phase fallback to this same file (`fetch_current_season_phase()`, `resolve_season_phase()`, wired near `scripts/riot_stats_ingest.py:920-949` and `:1064-1077`) that reads `league_settings` whenever `--season`/`--phase` are omitted. Keep it for the positional-ids and `--dates` modes. **`--from-reports` must bypass it entirely** — every queued report carries its own `season`/`season_phase`, and one global value is wrong for a mixed batch. Specifically the guard `if not args.dry_run and not (season and phase):` must gain `and not args.from_reports`, or a `--from-reports` run hard-fails (`return 1`) whenever `league_settings` is unreadable, for a value it never uses. Add a Python test asserting `--from-reports` succeeds with `league_settings` unavailable.
- Score cross-check: after a report's games are ingested, count wins per team (from each game's resolved sides and the winning `teamId`); if `(wins_a, wins_b) != (score_a, score_b)`, set `warning_text` to e.g. `Reported 3-0 but games show 2-1`.

- [ ] **Step 1: Failing Python tests** in `scripts/test_riot_stats_ingest.py` (keep existing ones): `resolve_sides` with an explicit override; with a single roster hit on blue; with hits on both sides agreeing; with contradictory hits (unresolved + reason); with no hits (unresolved). Plus a `status`-rollup test feeding a fake per-game result list through the status logic (all ingested → `ingested`; one `needs_side` → `needs_sides`; one `failed` → `failed`), and a score-cross-check test (`(2,1)` vs reported `3-0` → warning text mentions both). Use synthetic dicts; no network. Run both invocation styles → fail.
- [ ] **Step 2: Implement** the mode + helpers. Run tests → green.
- [ ] **Step 3: Workflow file**:

```yaml
name: Ingest match reports
on:
  schedule:
    - cron: "0 7 * * *"   # 02:00 EST / 03:00 EDT — GitHub cron is UTC only
  workflow_dispatch:
concurrency:
  group: ingest-stats
  cancel-in-progress: false
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install requests python-dotenv
      - run: python scripts/riot_stats_ingest.py --from-reports
        env:
          RIOT_API_KEY: ${{ secrets.RIOT_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

- [ ] **Step 4: Local end-to-end rehearsal** — insert a report + one real historical match id (pick one already in `raw_stats`, e.g. via psql) with `blue_team_id` set explicitly; run `python scripts/riot_stats_ingest.py --from-reports --dry-run` against the LOCAL stack (env vars pointed at local URL + local service key) and confirm the plan output; then run for real and confirm the game is marked `ingested` via the already-present shortcut (no Riot call needed for an already-ingested id). Document the rehearsal in the report.
- [ ] **Step 5: README** — new subsection under Stats ingestion: how the nightly workflow works, the three repo secrets, how to trigger a manual run, what `needs_sides` means and how to fix it on the site.
- [ ] **Step 6: Gates + commit** `feat: from-reports ingest mode and nightly workflow`.

### Task 8: Auto-fill schedule scores from ingested reports (NEW — merge amendment)

**Files:**
- Modify: `scripts/riot_stats_ingest.py`, `scripts/test_riot_stats_ingest.py`, `src/components/matches/ReportList.tsx`

**Interfaces:**
- Consumes: `match_reports.fixture_id` (T2), `ingest_report` (T7), `public.fixtures` (co-developer's schedule table: `score_a int`, `score_b int`, paired null check).
- Produces: `sync_fixture_score(cfg, report) -> bool` in the ingest script — when a report finishes `ingested` **and** `report["fixture_id"]` is set, PATCH `fixtures?id=eq.<fixture_id>&score_a=is.null&score_b=is.null` with `{"score_a": report["score_a"], "score_b": report["score_b"]}`. The two `is.null` filters are the "only fill an empty fixture" guard and make it race-safe; a fixture an admin already scored by hand is never overwritten. Returns whether a row was updated (PostgREST `Prefer: return=representation` → non-empty body). Never fails the run: log and continue on error.

- [ ] **Step 1: Failing Python tests** — `sync_fixture_score` fills an empty fixture (asserts the PATCH URL carries both `is.null` filters and the body carries both scores); no-ops when `fixture_id` is null (no request made); treats an empty PostgREST response (fixture already scored) as "not updated" without raising. Use the existing monkeypatched-`requests` harness style; no network.
- [ ] **Step 2: Implement** and call it from the report loop right after a report is marked `ingested`.
- [ ] **Step 3: ReportList indicator** — when a report has `fixture_id`, show a small steel "Schedule" chip; add a gold "Synced" chip once the report is `ingested` (the fixture's own score is the source of truth on `/schedule`; no extra fetch needed here).
- [ ] **Step 4: Local rehearsal** — insert a fixture with null scores plus a report linked to it, run the ingest against local, confirm via psql that the fixture's scores now match the report and that re-running does not change an admin-edited score.
- [ ] **Step 5: Gates + commit** `feat: fill schedule fixture scores from ingested reports`.

### Task 9: Verification + production rollout

- [ ] **Step 1: Full gates** — build, lint, `npm test`, `npx supabase test db`, both Python test styles, one `npm run e2e` (retry once on the known flake).
- [ ] **Step 2: Screenshot sweep** — `/matches` (empty state + populated with each status, incl. the Schedule/Synced chips), `/matches/report` (paste → parsed form, incl. the fixture-attach select), the admin editors on `/matches`, and the new nav entry; desktop 1600w plus one 390w mobile shot of `/matches`. Also confirm `/schedule` still renders correctly with its own admin editors and that its `?season=` query param does not collide with any `/matches` filter. Read every screenshot; fix styling-only issues found.
- [ ] **Step 3: Production migrations** — verify `Get-Content supabase\.temp\project-ref` is `tyywoneobreracfnujdk`, then `npx supabase db push`. Confirm via REST that `league_teams` is populated in production (the loader's sync RPC has not run there — call `POST /rest/v1/rpc/sync_league_teams_from_stats` with the service key once and re-check).
- [ ] **Step 4: Report the manual steps the user must do** (they hold the credentials): add the three GitHub repo secrets, and confirm the first scheduled/manual workflow run. Do NOT attempt to set secrets.
- [ ] **Step 5: Commit any fixes; push `main` is the controller's job at merge time.**

---

## Self-Review Notes

- Spec coverage: report format → T3 parser; six tables + RLS → T1/T2; report form incl. duplicate checks and defaults → T4; matches list, status display, needs-sides fixing, nav → T5; admin settings/teams/rosters → T6; `--from-reports`, side resolution, score cross-check, idempotency, workflow + secrets + README → T7; verification + prod → T8.
- Type consistency: `league_team_id`, `blue_team_id`, `resolved_blue_team_id`, status vocabularies, and the `queries.ts` export names are used identically across T2–T7.
- Known wrinkle handled explicitly: the `league_teams` seed depends on `raw_stats` data that a bare `db reset` does not have, so the seed lives in `sync_league_teams_from_stats()` and the loader calls it (T1 Steps 3–4); T8 Step 3 calls it once in production too.
