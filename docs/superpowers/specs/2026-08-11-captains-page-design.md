# Private Captains Page

**Date:** 2026-08-11
**Status:** Approved design
**Supersedes:** the public `/matches` page and nav entry from `2026-08-11-match-reporting-auto-ingest-design.md`. That spec's tables, RLS, parser and nightly-ingest pipeline all stand — only the UI surface moves.

## Purpose

One private, role-aware page (`/captain`) where a captain finds everything they need for game night: their next match, the tourney codes for it, the result-reporting box, their roster, their team's results and stats, and league announcements. Admins use the same page with a team switcher plus an admin-only section.

## Access model

- Server-side gate: signed in **and** (a captain this season **or** an admin). Anyone else gets a branded "captains only" card with a link home — never a 404.
- A captain sees only **their own team's** data. Tourney codes are visible only to the two captains of that fixture (and admins).
- Admins see the same page for any team via a switcher, plus the all-reports/needs-fixing queue.

## New tables

- **`league_team_captains`** — `id uuid pk`, `league_team_id uuid not null references league_teams(id) on delete cascade`, `season text not null`, `profile_id uuid not null references profiles(id) on delete cascade`, `unique (league_team_id, season, profile_id)`. Seeded by a re-runnable `public.sync_league_team_captains(p_season text)` that reads the featured draft (`league_settings.featured_draft_id`) and inserts a row per `teams.captain_profile_id` whose `teams.name` matches a `league_teams.name` (case-insensitive, trimmed), skipping unmatched names and returning how many it matched — so admins don't retype what the draft already knows. RLS: public `select` (who captains a team is not secret); admin-only write.
- **`match_codes`** — `id uuid pk`, `fixture_id uuid references public.fixtures(id) on delete set null`, `season text not null`, `team_a_id`/`team_b_id uuid not null references league_teams(id)`, `game_number int not null`, `code text not null`, `note text`, `created_by uuid references profiles(id)`, `created_at timestamptz not null default now()`, `unique (fixture_id, game_number)` (partial, where `fixture_id is not null`). Storing both team ids explicitly — rather than resolving `fixtures.team_a/team_b` free text at read time — is what makes the RLS rule below exact.
  RLS: **select** for admins, or for a profile that captains `team_a_id` or `team_b_id` in that `season` (via `league_team_captains`); **all writes** admin-only. This is the one genuinely private table in the app.
- **`announcements`** — `id uuid pk`, `title text not null`, `body text not null`, `pinned boolean not null default false`, `created_by uuid references profiles(id)`, `created_at timestamptz not null default now()`. RLS: select for authenticated captains and admins; admin-only write.

## Page composition (`/captain`)

Server component resolves: signed-in profile → captain's `league_team` for `league_settings.current_season` (admins: selected team, defaulting to the first) → passes ids to client sections. Sections, in order:

1. **Next match** — the earliest `fixtures` row for the current season whose `score_a` is null and whose `team_a`/`team_b` names match the captain's team (name-normalised comparison; fixtures are free text by design). Shows opponent, kickoff, `Bo{best_of}`, stage. Empty state: "No upcoming match scheduled."
2. **Tourney codes** — `match_codes` for that fixture, ordered by `game_number`, each with a copy button. Empty state: "No codes posted yet — your admin will add them before the match."
3. **Report result** — the paste box from the match-reporting spec, pre-filled from the resolved fixture (season, phase, both teams, `fixture_id`) so a captain pastes their Discord post and confirms. Below it, that captain's own reports with status badges and the needs-sides fixer.
4. **My roster** — the captain's `teams`/`players` rows from the featured draft (role, player, price/acquisition) alongside the Riot IDs on record for that team this season (`roster_memberships` → `riot_accounts`), shown read-only with a note to tell an admin if one is wrong. (Self-serve editing was explicitly not requested; the admin roster editor remains the only writer.)
5. **My results & stats** — the team's ingested games (`stats_game_log` filtered to their team name) and their players' `stats_player_agg` lines for the current season.
6. **Announcements & links** — pinned first, then newest; plus links to `/info` (rulebook) and `/schedule`.

**Admin-only sections** (same page, below): team switcher; a code editor (pick a fixture → paste codes one per line → save, replacing that fixture's set); the all-reports queue with retry/delete and needs-sides fixing; and the league-teams / roster editors from the match-reporting plan.

## What this replaces

- `/matches` and `/matches/report` are **not built**; the `Matches` nav entry is not added. `/captain` gets the nav entry instead (after `Schedule`), shown to every visitor — non-captains reaching it see the "captains only" card, which doubles as discoverability for new captains.
- Everything already built stays: `league_teams`, `riot_accounts`, `roster_memberships`, `match_reports`, `match_report_games` (+ `fixture_id`), their RLS, and the paste parser.

## Testing

- **pgTAP:** the three new tables exist with correct RLS — anon cannot select `match_codes`; a captain of team A can select codes for their own fixture but **not** for a fixture between two other teams; an admin can; writes are admin-only; `sync_league_team_captains` matches by name and is re-runnable.
- **Vitest:** the "next match" fixture-resolution helper (name normalisation, ignores completed fixtures, picks earliest) and the section-visibility helper (captain vs admin vs neither).
- **Manual/browser:** captain view, admin view with switcher, and a signed-out visitor hitting the gate.
- Existing gates (build, lint, vitest, pgTAP, e2e) stay green.

## Out of scope

Generating Riot tournament codes via the Tournament API (codes are created elsewhere and pasted); captain self-service editing of Riot IDs or rosters; per-captain notifications/emails; a public results page (the schedule and stats pages already serve that).
