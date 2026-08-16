# Academy Captain Page

**Date:** 2026-08-16
**Status:** Approved design

## Goal

Make Academy a full parallel captain league. The existing Premier captain workflow remains unchanged at `/captain`; Academy uses the same page and components at `/captain?league=academy`, with its own teams, captains, fixtures, codes, reports, rosters, Riot IDs, results, and stats.

## Architecture

Use a shared data model with an explicit `league` discriminator (`premier` or `academy`) on league-facing records rather than duplicating the captain feature into separate tables. Existing rows are backfilled to `premier`.

League-scoped records include canonical teams, captain assignments, fixtures, match reports, report games, match codes, roster memberships, and stats identity/queries where the current schema can otherwise mix leagues. Team uniqueness and lookups use league plus the existing name/abbreviation identity. The Academy data source is `league_settings.academy_draft_id`; Premier continues using `featured_draft_id`.

The existing shared components remain the presentation layer. Query and mutation functions accept a normalized league value, and database policies require both the appropriate season and league for captain authorization and private-code access.

## Page behavior

- `/captain` means Premier.
- `/captain?league=academy` means Academy.
- Any other or repeated/invalid league value safely resolves to Premier.
- A regular captain may view only the team they captain in the selected league. The query parameter cannot be used to cross leagues.
- An admin may switch leagues and then switch among active teams in that league.
- The page header, switcher, empty states, and admin section identify the active league.
- If Academy is not configured, the page shows an explicit Academy-not-configured state and never falls back to Premier data.

Each page section is scoped to the active league and team:

1. next unplayed fixture;
2. private tourney codes;
3. result reporting, report history, and side fixing;
4. draft roster and Riot IDs;
5. ingested results and player stats;
6. announcements and links;
7. admin code editor, report queue, league-team editor, and roster editor.

## Data flow and administration

Academy team/captain sync reads the Academy draft selected by `academy_draft_id`; Premier sync retains the existing featured-draft behavior. Sync operations are repeatable and match draft teams to canonical league teams by normalized name, creating missing canonical records with stable abbreviations.

Fixtures, reports, codes, and stats are filtered by the active league at read and write time. Report submission carries league context to the database function/RLS path. Admin mutations include league context so editing one league cannot overwrite another league's data.

Announcements are treated as league-scoped for the captain page. Existing announcements are Premier rows; admins can create or edit announcements for the selected league.

## Migration and compatibility

The migration must:

- add constrained league fields with a Premier default/backfill;
- add indexes for season/league/team lookups;
- preserve current Premier behavior and existing data;
- add Academy draft-aware sync support;
- update relevant RPC signatures or add league-aware variants without breaking existing callers during rollout;
- update generated/local TypeScript row shapes to reflect the new fields.

No destructive data rewrite is required. Existing Premier rows remain readable and writable through the current UI path.

## Error handling

- Missing Academy configuration renders a clear empty state.
- Missing Academy team/captain mappings produce an actionable admin error rather than silently granting access.
- Invalid league query values resolve to Premier.
- RLS failures retain the existing friendly captain setup message, with league context where useful.
- No query may use an Academy team id, code, report, roster, or stats row without verifying its league scope.

## Testing and verification

Add focused coverage for:

- league parsing and page selection;
- Academy draft/team/captain sync and rerun behavior;
- league-scoped team/captain resolution;
- Premier/Academy RLS isolation for codes, reports, and mutations;
- Academy fixture, report, roster, Riot-account, and stats queries;
- page rendering, admin league/team switching, and the unconfigured Academy state.

Run the focused tests, full Vitest suite, lint, `git diff --check`, and Supabase migration/pgTAP verification where the local database harness is available.

## Out of scope

- A second route or duplicated component tree for Academy.
- Automatic Tournament API code generation.
- Changes to public team-directory behavior beyond using the existing Academy draft mapping.
