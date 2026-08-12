# Match Reporting + Automatic Stats Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Captains file match reports on the site; a 2am GitHub Actions job ingests them into `raw_stats` with the correct team, season and phase — no local runs, no manual match-id typing — and fills in the schedule's scores as a bonus.

**Architecture:** Six new tables hold league config, rosters and the report queue (public-read, captain/admin-write via RLS). A paste-parser turns a Discord report into a pre-filled form. The existing Python ingester gains a `--from-reports` mode that drains the queue, resolves which LoL side is which FPL team (roster lookup or explicit override), writes stats, and reports status back.

**Tech Stack:** Existing Next.js 16 + Tailwind brand system, Supabase (Postgres RLS), pgTAP, Vitest, Python 3 (`requests` + `python-dotenv`), GitHub Actions.

**Specs:** `docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md` (schema, report format, ingest pipeline — canonical) AND `docs/superpowers/specs/2026-08-11-captains-page-design.md` (**SCOPE CHANGE, 2026-08-11**: the public `/matches` UI is replaced by a private `/captain` page; read it before any UI task).

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
supabase/migrations/20260811100003_captain_page.sql     (T4 — codes, captains, announcements)
supabase/tests/0020_captain_page_test.sql              (T4)
src/lib/captain/{queries,nextMatch}.ts                 (T5)
src/app/captain/page.tsx                               (T5 — private page, role-aware)
src/components/captain/*.tsx                           (T5 sections; T6 admin panels)
src/components/matches/{LeagueTeamsEditor,RosterEditor}.tsx (T6)
src/components/SiteNavigation.tsx                      (T5 — add Captain entry)
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

### Task 4: Captain-page tables (codes, captains, announcements)

**SCOPE CHANGE (2026-08-11):** the public `/matches` page and its nav entry are NOT built. All reporting UI moves onto a private `/captain` page. Read `docs/superpowers/specs/2026-08-11-captains-page-design.md` — its "New tables" section is canonical for this task.

**Files:**
- Create: `supabase/migrations/20260811100003_captain_page.sql`
- Test: `supabase/tests/0020_captain_page_test.sql`

**Interfaces:**
- Consumes: `league_teams`, `profiles`, `public.fixtures`, `league_settings` (`current_season`, `featured_draft_id`), `public.teams`/`players` (draft rosters), `public.is_admin()`.
- Produces:
  - `league_team_captains(id uuid pk default gen_random_uuid(), league_team_id uuid not null references league_teams(id) on delete cascade, season text not null, profile_id uuid not null references profiles(id) on delete cascade, unique (league_team_id, season, profile_id))`. RLS: public `select`; admin-only write.
  - `public.sync_league_team_captains(p_season text) returns int` — `security definer`, `set search_path = public`: for the draft in `league_settings.featured_draft_id`, insert a `league_team_captains` row for every `teams.captain_profile_id is not null` whose `lower(trim(teams.name))` equals `lower(trim(league_teams.name))`, `on conflict do nothing`; returns the number of rows inserted. Re-runnable.
  - `public.is_captain_of(p_league_team_id uuid, p_season text) returns boolean` — `stable security definer`, `set search_path = public`: `exists (select 1 from league_team_captains where league_team_id = p_league_team_id and season = p_season and profile_id = auth.uid())`.
  - `match_codes(id uuid pk default gen_random_uuid(), fixture_id uuid references public.fixtures(id) on delete set null, season text not null, team_a_id uuid not null references league_teams(id), team_b_id uuid not null references league_teams(id), game_number int not null, code text not null, note text, created_by uuid references profiles(id), created_at timestamptz not null default now(), check (team_a_id <> team_b_id))` + `create unique index match_codes_fixture_game_key on match_codes (fixture_id, game_number) where fixture_id is not null`. RLS: **select** `using (public.is_admin() or public.is_captain_of(team_a_id, season) or public.is_captain_of(team_b_id, season))`; **all writes** admin-only. This is the only non-public table in the app.
  - `announcements(id uuid pk default gen_random_uuid(), title text not null, body text not null, pinned boolean not null default false, created_by uuid references profiles(id), created_at timestamptz not null default now())`. RLS: select for `authenticated` where `public.is_admin() or exists (select 1 from league_team_captains where profile_id = auth.uid())`; admin-only write.
  - Grants: `league_team_captains` select → `anon, authenticated`; `match_codes` and `announcements` select → `authenticated` ONLY (no anon grant at all — defence in depth beneath RLS); `insert, update, delete` → `authenticated` on all three; `all` → `service_role`.

- [ ] **Step 1: Failing pgTAP** — `supabase/tests/0020_captain_page_test.sql`, `plan(12)`. Build fixtures inside the transaction: three `league_teams` (Alpha, Bravo, Gamma); `league_team_captains` rows making `tests.cap(1)` captain of Alpha and `tests.cap(2)` captain of Gamma for season `'ZZ'`; a `match_codes` row for an Alpha-vs-Bravo fixture in `'ZZ'`. Assertions: the three tables exist; `has_function` for `sync_league_team_captains` and `is_captain_of`; anon CANNOT select `match_codes`; `tests.acting_as(tests.cap(1))` CAN select that row; `tests.acting_as(tests.cap(2))` (captain of an unrelated team) CANNOT; `tests.acting_as(tests.admin_id())` CAN; a captain CANNOT insert into `match_codes`; an admin CAN; `is_captain_of` returns false for the wrong season; `sync_league_team_captains('ZZ')` runs and is re-runnable (call twice; the second returns 0). **Do NOT use `set local row_security = off` anywhere** — it masks policy evaluation and makes denial assertions vacuous (this bit us in Task 2).
- [ ] **Step 2: Write the migration** per Interfaces.
- [ ] **Step 3:** `npx supabase db reset` → `npx tsx scripts/load-stats.ts` → `npx supabase test db` green.
- [ ] **Step 4: Gates + commit** `feat: captain page tables (codes, captains, announcements)`.

### Task 5: `/captain` page — gate, captain sections, report box

**Files:**
- Create: `src/lib/captain/queries.ts`, `src/lib/captain/nextMatch.ts`, `src/lib/captain/nextMatch.test.ts`, `src/app/captain/page.tsx`, `src/components/captain/CaptainGate.tsx`, `src/components/captain/NextMatchCard.tsx`, `src/components/captain/TourneyCodes.tsx`, `src/components/captain/ReportBox.tsx`, `src/components/captain/MyRoster.tsx`, `src/components/captain/MyResults.tsx`, `src/components/captain/Announcements.tsx`
- Modify: `src/components/SiteNavigation.tsx` (add `Captain` → `/captain` after `Schedule`)

**Interfaces:**
- Consumes: Task 3's `parseReport` + `src/lib/matches/types.ts`, Task 2's report tables, Task 4's new tables, `stats_game_log`/`stats_player_agg`, `createServerSupabase`, `createClient`.
- Produces:
  - `nextMatch.ts`: `export function pickNextFixture(fixtures: Fixture[], teamName: string): Fixture | null` — pure: keep rows whose `score_a` is null and whose `team_a` or `team_b` equals `teamName` case-insensitively after trimming; sort by `scheduled_at` ascending with nulls last, tie-break `sort_order`; return the first or null. Unit-tested.
  - `queries.ts`: `fetchCaptainContext()` → `{ profileId, isAdmin, teams: LeagueTeam[], myTeamId: string | null, season: string }`; plus `fetchCodes(fixtureId)`, `fetchMyReports(teamId, season)`, `fetchMyRoster(teamId, season)`, `fetchMyResults(teamName, season)`, `fetchAnnouncements()`, and `submitReport(input)` where `SubmitReportInput = { season: string; phase: string; teamAId: string; teamBId: string; scoreA: number; scoreB: number; draftUrl: string | null; fixtureId: string | null; games: { gameNumber: number; matchId: string; blueTeamId: string | null }[] }` (insert the report, then its games; delete the report if the games insert fails so no orphan queue entry survives; always set `submitted_by` so the submitter-delete policy is reachable).
  - `src/app/captain/page.tsx`: server component. Resolves signed-in profile, admin flag, `league_settings.current_season`, and the captain's `league_team` via `league_team_captains`; admins get all teams plus a `?team=<id>` switcher. Renders `CaptainGate` (branded "captains only" card + `/login` link) when neither captain nor admin — never a 404.
  - Sections in spec order: `NextMatchCard` (opponent, kickoff, `Bo{n}`, stage, empty state "No upcoming match scheduled."), `TourneyCodes` (codes for that fixture ordered by game number, copy button each, empty state "No codes posted yet — your admin will add them before the match."), `ReportBox` (Task 3 paste parser + editable form pre-filled with season/phase/teams/`fixture_id` from the resolved fixture, plus that captain's own reports with status badges and the needs-sides fixer), `MyRoster` (draft roster rows + Riot IDs on record, read-only, with a "tell an admin if one is wrong" note), `MyResults` (`stats_game_log` rows for their team name + their players' `stats_player_agg` lines), `Announcements` (pinned first then newest, plus links to `/info` and `/schedule`).
- Report-box validation (unchanged from the superseded plan): both teams set and different, ≥1 game, every id matching `^NA1_\d+$`, no duplicates within the form, none already in `match_report_games` or `raw_stats`; each failure shown inline; success clears the paste box and refreshes the captain's report list.

- [ ] Steps: `nextMatch.ts` + unit tests → `queries.ts` → server page + gate → the six section components → nav entry → browser verification with scratch Playwright as (a) signed-out visitor, (b) a captain (seed `league_team_captains` + a fixture + codes via psql), (c) an admin using the switcher — explicitly confirming a captain of another team CANNOT see the first team's codes → full gates incl. one `npm run e2e` → commit `feat: private captain page with codes, reporting and team info`.

### Task 6: Admin panels on `/captain` (codes, teams, rosters, all-reports)

**Files:**
- Create: `src/components/captain/AdminCodeEditor.tsx`, `src/components/captain/AdminReportsQueue.tsx`, `src/components/matches/LeagueTeamsEditor.tsx`, `src/components/matches/RosterEditor.tsx`
- Modify: `src/app/captain/page.tsx` (mount the four for admins, below the captain sections)

**Interfaces:**
- Consumes: Task 4 tables, Task 2 report tables, Task 1's `league_teams`/`riot_accounts`/`roster_memberships`.
- Produces:
  - `AdminCodeEditor` — pick a fixture (open fixtures for the current season, labelled `<stage> — <team_a> vs <team_b>`), a textarea for codes one per line, Save. Saving replaces that fixture's code set (delete then insert, numbering games 1..N in line order), resolving `team_a_id`/`team_b_id` from the fixture's team names against `league_teams` (case-insensitive, trimmed) and refusing with a clear message when a name doesn't resolve.
  - `AdminReportsQueue` — every report newest first with status badges, `error_text`/`warning_text`, per-game rows, plus Retry (report `status='pending'`, clear `error_text`, non-ingested games back to `pending`) and Delete; and the needs-sides fixer for any game lacking a resolved side.
  - `LeagueTeamsEditor` — table of `league_teams` with editable name/abbreviation/active, add row, delete row (surfacing the DB error verbatim when the team is still referenced).
  - `RosterEditor` — season selector (defaults to `current_season`), team selector, that team's memberships shown as `Name#TAG`, an add box accepting `Name#TAG` (split on the last `#`, upsert `riot_accounts` on the lower-cased pair, then the membership), a remove button per row, and a bulk paste textarea (one `Name#TAG` per line).
- **DROPPED from the original plan:** `LeagueSettingsEditor` — a co-developer's `AdminSeasonSettings` on `/schedule` already edits `league_settings.current_season/current_phase`.

- [ ] Steps: code editor → reports queue → teams editor → roster editor → browser check as admin (paste codes for a fixture, confirm rows in psql AND that the two assigned captains can see them while a third captain cannot; add a roster entry; retry a failed report) → gates → commit `feat: admin panels on the captain page`.

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
- Modify: `scripts/riot_stats_ingest.py`, `scripts/test_riot_stats_ingest.py`, `src/components/captain/ReportBox.tsx` (captain's own report list) and `src/components/captain/AdminReportsQueue.tsx`

**Interfaces:**
- Consumes: `match_reports.fixture_id` (T2), `ingest_report` (T7), `public.fixtures` (co-developer's schedule table: `score_a int`, `score_b int`, paired null check).
- Produces: `sync_fixture_score(cfg, report) -> bool` in the ingest script — when a report finishes `ingested` **and** `report["fixture_id"]` is set, PATCH `fixtures?id=eq.<fixture_id>&score_a=is.null&score_b=is.null` with `{"score_a": report["score_a"], "score_b": report["score_b"]}`. The two `is.null` filters are the "only fill an empty fixture" guard and make it race-safe; a fixture an admin already scored by hand is never overwritten. Returns whether a row was updated (PostgREST `Prefer: return=representation` → non-empty body). Never fails the run: log and continue on error.

- [ ] **Step 1: Failing Python tests** — `sync_fixture_score` fills an empty fixture (asserts the PATCH URL carries both `is.null` filters and the body carries both scores); no-ops when `fixture_id` is null (no request made); treats an empty PostgREST response (fixture already scored) as "not updated" without raising. Use the existing monkeypatched-`requests` harness style; no network.
- [ ] **Step 2: Implement** and call it from the report loop right after a report is marked `ingested`.
- [ ] **Step 3: Report list indicators** — in both the captain's own report list and the admin queue: when a report has `fixture_id`, show a small steel "Schedule" chip; add a gold "Synced" chip once the report is `ingested` (the fixture's own score is the source of truth on `/schedule`; no extra fetch needed here).
- [ ] **Step 4: Local rehearsal** — insert a fixture with null scores plus a report linked to it, run the ingest against local, confirm via psql that the fixture's scores now match the report and that re-running does not change an admin-edited score.
- [ ] **Step 5: Gates + commit** `feat: fill schedule fixture scores from ingested reports`.

### Task 9: Verification + production rollout

- [ ] **Step 1: Full gates** — build, lint, `npm test`, `npx supabase test db`, both Python test styles, one `npm run e2e` (retry once on the known flake).
- [ ] **Step 2: Screenshot sweep** — `/captain` as a signed-out visitor (gate card), as a captain (all six sections incl. codes and the report box with Schedule/Synced chips), and as an admin (team switcher + the four admin panels), plus the new nav entry; desktop 1600w plus one 390w mobile shot of `/matches`. Also confirm `/schedule` still renders correctly with its own admin editors and that its `?season=` query param does not collide with any `/matches` filter. Read every screenshot; fix styling-only issues found.
- [ ] **Step 3: Production migrations** — verify `Get-Content supabase\.temp\project-ref` is `tyywoneobreracfnujdk`, then `npx supabase db push`. Confirm via REST that `league_teams` is populated in production (the loader's sync RPC has not run there — call `POST /rest/v1/rpc/sync_league_teams_from_stats` with the service key once and re-check).
- [ ] **Step 4: Report the manual steps the user must do** (they hold the credentials): add the three GitHub repo secrets, and confirm the first scheduled/manual workflow run. Do NOT attempt to set secrets.
- [ ] **Step 5: Commit any fixes; push `main` is the controller's job at merge time.**

---

## Self-Review Notes

- Spec coverage: report format → T3 parser; six tables + RLS → T1/T2; report form incl. duplicate checks and defaults → T4; matches list, status display, needs-sides fixing, nav → T5; admin settings/teams/rosters → T6; `--from-reports`, side resolution, score cross-check, idempotency, workflow + secrets + README → T7; verification + prod → T8.
- Type consistency: `league_team_id`, `blue_team_id`, `resolved_blue_team_id`, status vocabularies, and the `queries.ts` export names are used identically across T2–T7.
- Known wrinkle handled explicitly: the `league_teams` seed depends on `raw_stats` data that a bare `db reset` does not have, so the seed lives in `sync_league_teams_from_stats()` and the loader calls it (T1 Steps 3–4); T8 Step 3 calls it once in production too.
