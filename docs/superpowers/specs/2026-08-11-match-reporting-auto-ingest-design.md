# Match Reporting + Automatic Stats Ingest

**Date:** 2026-08-11
**Status:** Approved design
**Scope:** Captains report finished series on the website; a scheduled cloud job ingests those matches into `raw_stats` nightly, tagged with the right FPL team, season and phase. Replaces the manual local `riot_stats_ingest.py` run.

## Why

Stats currently require someone to run the ingester on their own machine with match ids typed by hand, and ingested rows have no `team_name` (the final stats review flagged this gap). Reports already exist as Discord posts in a consistent format; capturing them on the site turns them into the queue the ingest needs and supplies the missing team identity.

## The report format (source of truth for the parser)

Discord posts look like:

```
MIC 3-0 BBC
https://drafter.lol/draft/T4cB_WHp?game=1 5568297187
https://drafter.lol/draft/T4cB_WHp?game=2 5568352310
https://drafter.lol/draft/T4cB_WHp?game=3 5568409447
```

- Line 1: `<TEAM_A_ABBREV> <scoreA>-<scoreB> <TEAM_B_ABBREV>`.
- One line per game: a drafter.lol draft URL (`?game=N`) plus the **bare numeric match id**. Riot's real id is that number prefixed with `NA1_`.
- Screenshots in the post are ignored.

## Architecture

Three parts: reporting UI (web) → queue tables (Supabase) → scheduled ingester (GitHub Actions running the existing Python).

### 1. Data model (new migrations)

- **`league_settings`** — single row (`id smallint primary key default 1 check (id = 1)`), `current_season text`, `current_phase text`. Admin-editable; supplies report defaults.
- **`league_teams`** — `id uuid`, `name text unique not null` (must match `raw_stats.team_name` exactly), `abbreviation text unique not null` (1–5 chars, e.g. `MIC`), `active boolean default true`. Seeded from `select distinct team_name from raw_stats` with initials-derived abbreviations, admin-editable afterwards. This is the canonical team list for reporting — deliberately decoupled from the per-draft `teams` table, because stats team identity is `raw_stats.team_name` text.
- **`riot_accounts`** — `id uuid`, `game_name text not null`, `tag_line text not null`, `display_name text`, unique on `(lower(game_name), lower(tag_line))`.
- **`roster_memberships`** — `id uuid`, `riot_account_id uuid references riot_accounts`, `season text not null`, `league_team_id uuid references league_teams`, unique `(riot_account_id, season)`. Intentionally allowed to be incomplete.
- **`match_reports`** — `id uuid`, `season text`, `season_phase text`, `team_a_id`/`team_b_id` → `league_teams`, `score_a int`, `score_b int`, `draft_url text`, `submitted_by uuid references profiles`, `submitted_at timestamptz default now()`, `status text check in ('pending','ingested','needs_sides','failed')` default `'pending'`, `error_text text`, `warning_text text`, `ingested_at timestamptz`.
- **`match_report_games`** — `id uuid`, `report_id uuid references match_reports on delete cascade`, `game_number int`, `match_id text unique not null` (full `NA1_…`), `blue_team_id uuid references league_teams` (null = auto-detect), `resolved_blue_team_id uuid references league_teams` (what the ingest decided), `status text check in ('pending','ingested','needs_side','failed')`, `error_text text`.

**RLS:** public `select` on all six tables (results and rosters are league-public; summoner names already appear in stats). Insert on `match_reports`/`match_report_games` for authenticated users who are admins **or** captains (`exists (select 1 from teams where captain_profile_id = auth.uid())`). Update on `match_report_games` for the same admin-or-captain set, but only while the parent report is not yet `ingested` — this is what lets a captain resolve a `needs_sides` report. Update on `match_reports` and all deletes: admins only, except that a submitter may delete their own report while `status = 'pending'`. `league_settings`, `league_teams`, `riot_accounts`, `roster_memberships`: admin write only. All `raw_stats` writes remain service-role only.

### 2. Reporting UI

- **`/matches`** — public list of reports, newest first: teams + abbreviations, score, season/phase, per-game status badges, and the error/warning text when present. Signed-in captains/admins see "Report a match"; admins get retry (`status → 'pending'`) and delete. A report in `needs_sides` shows an inline per-game "which team was blue?" picker (captains and admins may set it), which flips the report back to `pending`.
- **`/matches/report`** — the form. Primary input is a **paste box** taking the Discord post verbatim; a pure parser (`src/lib/matches/parseReport.ts`, unit-tested against the example above) extracts: team abbreviations → `league_teams` (case-insensitive), the series score, `draft_url` (first drafter.lol link, `?game=` stripped), and match ids (`\b\d{8,}\b` → `NA1_` prefixed; full `NA1_…` ids accepted as-is; game numbers from `?game=N` when present, else order of appearance). Parse results populate an editable form — team pickers, score, season/phase (defaulting from `league_settings`), and one row per game with its match id plus a blue-side selector defaulting to **Auto-detect**. Nothing is submitted without the user confirming. Duplicate match ids are checked before submit and reported clearly (already in `match_report_games`, or already present in `raw_stats`); the `match_report_games.match_id` unique index is the real guard, and its violation surfaces as the same friendly message.
- Nav gains a **Matches** entry (`SiteNavigation`).

### 3. Scheduled ingest

- **`.github/workflows/ingest-stats.yml`** — `schedule: cron "0 7 * * *"` (2am EST / 3am EDT; GitHub cron is UTC-only, no DST adjustment) plus `workflow_dispatch` for manual runs, and a `concurrency` group so runs never overlap. Steps: checkout → setup Python 3.12 → `pip install requests python-dotenv` → `python scripts/riot_stats_ingest.py --from-reports`. Secrets: `RIOT_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (repo secrets; the user holds a Riot **personal** key, which does not expire daily like a development key). GitHub emails the repo owner when a scheduled run fails.
- **`--from-reports` mode** (new mode in the existing script; all current modes stay):
  1. Fetch reports with `status in ('pending','needs_sides')` plus their games.
  2. Per game: if `match_id` already exists in `raw_stats`, mark the game `ingested` and skip (idempotent).
  3. Fetch match + timeline from Riot (existing code paths).
  4. **Side resolution.** If `blue_team_id` is set, use it. Otherwise look up each participant's `(riotIdGameName, riotIdTagline)` in `riot_accounts` → `roster_memberships` for the report's season → team; tally per side. Resolve when the tally is unambiguous (at least one match, and no side mapping to both report teams); the opposite side takes the other report team. Otherwise mark the game `needs_side`.
  5. Write rows via the existing mapper, with `team_name` from the resolved side, and `season`/`season_phase` from the report.
  6. Record `resolved_blue_team_id` and set the game `ingested`.
  7. Report status: `ingested` if all games ingested; `needs_sides` if any game is unresolved; `failed` if any game hard-failed (Riot error, unknown match id) with `error_text`.
  8. **Score cross-check:** tally game wins per team across the report's ingested games and compare to `score_a`/`score_b`. A mismatch does not block ingest; it sets `warning_text` (surfaced on `/matches`), catching typo'd match ids instead of silently polluting stats.
- Every write keeps the existing `on_conflict=match_id,summoner_name` + `resolution=ignore-duplicates` behaviour, and the run exits non-zero if any report ends `failed`.

### 4. Admin screens

Under `/admin`: league settings (current season/phase), league teams (name, abbreviation, active), and a roster editor for Riot accounts + season memberships (add/edit rows; paste-friendly `Name#TAG` entry). Partial rosters are fine and expected.

## Testing

- **Python:** unit tests for side resolution (roster hit on one side; conflicting hits → `needs_side`; explicit override wins), report-status transitions, and the score cross-check, using synthetic match/report fixtures — no live Riot calls.
- **pgTAP:** the six tables exist with correct RLS (anon select yes; anon insert no; captain insert allowed via simulated auth; admin-only writes on settings/teams/rosters).
- **Vitest:** `parseReport` against the exact Discord example plus edge cases (full `NA1_` ids, missing score line, unknown abbreviation, single game, extra prose lines).
- Existing gates (build, lint, vitest, pgTAP, e2e) must stay green.

## Out of scope

Discord bot integration (superseded — reports come from the site); displaying standings/schedule from reports on the Schedule tab; storing pick/ban data from drafter.lol; editing stats rows already ingested; automatic roster import from draft results.
