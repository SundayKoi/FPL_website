# Team Divisions Design

## Goal

Allow admins to assign each team to the `Lunari` or `Solari` division from the existing Edit teams interface, and render the public teams directory in separate division sections. Teams without an assignment remain visible in an `Unassigned` section.

The existing team-card suffix text (`— ROSTER`) will use black text so it remains readable with the light team-name treatment.

## Data model

Add a nullable `division` text column to `public.teams` through a new Supabase migration. The column accepts only `Lunari`, `Solari`, or `NULL`, with `NULL` representing an unassigned team. Existing rows are left unchanged and therefore appear under `Unassigned` until an admin assigns them.

Extend the shared `Team` type with `division: Division | null`, where the division type is shared with the existing schedule division values. No division is inferred from team order, nomination position, or team name.

## Admin flow

The existing `AdminTeamEditor` adds a labeled Division select to each team form. The options are `Unassigned`, `Lunari`, and `Solari`. On save, `Unassigned` maps to `null`; the other options persist their exact enum values in `teams.division` along with the existing identity fields. Existing validation, image handling, error states, and refresh behavior remain unchanged.

## Public directory flow

`TeamsDirectory` groups the supplied roster-team views by division and renders up to three sections in this order:

1. Lunari
2. Solari
3. Unassigned

Each section has an accessible heading and retains the existing responsive card grid. Empty sections are omitted. The grouping is presentation-only; team order within a section remains the order supplied by the server. `toRosterTeams` carries the team division into `RosterTeamView` so persisted and preview data use the same rendering path.

Placeholder teams receive deterministic divisions across the three groups so the preview demonstrates the feature. The placeholder assignments are presentation data only and do not affect database-backed drafts.

## Styling

Update the `— ROSTER` text in `TeamRosterCard` to use the black text utility while preserving its typography and layout. Add no new color system or broad card redesign.

## Testing

- Add a grouping test proving teams render under Lunari, Solari, and Unassigned headings in the specified order and that empty groups are omitted.
- Update placeholder tests or directory tests to verify placeholder assignments are exposed to the directory.
- Add an admin editor test proving the Division select is rendered, `Unassigned` is submitted as `null`, and a named division is submitted as the expected value.
- Add a roster transformation assertion proving `toRosterTeams` preserves `division`.
- Add a Supabase pgTAP migration test covering the column, allowed values, and nullable default behavior.
- Run focused Vitest tests, the full test suite, lint, and the production build before completion.

## Scope boundaries

This change does not add division management, division renaming, division-specific standings, division filters, or automatic assignment rules. Schedule behavior remains unchanged and continues to use its existing division data.
