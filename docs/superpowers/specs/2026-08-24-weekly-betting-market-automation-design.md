# Weekly betting market automation

**Date:** 2026-08-24
**Status:** Approved design, pending implementation plan

## Goal

At 1:00 AM America/New_York every Tuesday, populate the betting page for the
following Monday's complete Premier and Academy schedule. The generated
markets must match the current manual setup and must never create duplicates
or a partial weekly slate.

## Existing behavior to preserve

The current manual betting setup uses persistent season events and one market
per scheduled series:

- Premier markets belong to the existing Premier season event, currently
  `Premier S5`.
- Academy markets belong to the existing Academy season event, currently
  `Academy S1`.
- A title is the two betting team abbreviations in schedule order, such as
  `MINT vs FCL`.
- The market starts with zero rake and no draw outcome.
- `game_at` is the fixture's `scheduled_at` timestamp.
- The existing betting market contract sets `lock_at` to five minutes before
  `game_at`.
- Betting teams and events remain curated catalog records; automation does not
  create them.

## Architecture

Implement the generator as a database-native, transactional Postgres function
scheduled with Supabase Cron. The job is entirely a database operation, so it
does not need a service-role secret, an HTTP request, a GitHub Actions runner,
or an Edge Function deployment.

Two cron entries cover Eastern daylight-saving changes:

- Tuesday at 05:00 UTC, which is 1:00 AM during EDT.
- Tuesday at 06:00 UTC, which is 1:00 AM during EST.

The function checks the supplied/current time in `America/New_York` before it
does any work. A scheduled invocation proceeds only when the local weekday is
Tuesday and the local time is 1:00 AM. Therefore exactly one UTC invocation
per Tuesday performs generation. A separate service-role-only/manual entry
point accepts a deterministic timestamp for testing and an authorized repair
run without weakening the scheduled guard.

The database's existing `cron.job_run_details` records execution status and
errors. No second application-specific run log is needed.

## Schema changes

### Event-to-schedule binding

Add nullable scheduling metadata to `betting_events`:

- `league`: `premier` or `academy` when an event receives automated schedule
  markets.
- `schedule_season`: the canonical fixture season key, such as `S5` or `A1`.

A partial unique constraint/index on `(league, schedule_season)` applies where
both columns are non-null. Unbound events continue to support props and manual
betting use cases.

Backfill the current `Premier S5` event to `(premier, S5)` and the current
`Academy S1` event to `(academy, A1)`. The Academy display label deliberately
stays `S1`; `schedule_season` stores the fixture key `A1` independently.

Extend the betting catalog admin form so staff can set or clear this binding
when creating future season events. The server action validates the league and
season pair and preserves existing authorization and auditing behavior.

### Fixture-to-market identity

Add nullable `fixture_id uuid` to `betting_markets`, referencing
`fixtures(id)` with `on delete set null`. Add a partial unique index on
`fixture_id` where it is non-null.

Manual and prop markets keep `fixture_id = null`. Automated schedule markets
store the source fixture ID, making repeat generation idempotent while keeping
historical markets intact if an owner later deletes a fixture.

## Generation data flow

Given a valid Tuesday 1:00 AM Eastern run timestamp:

1. Compute the following Monday's local calendar date in
   `America/New_York`.
2. Read `league_settings.current_season`, `academy_season`,
   `featured_draft_id`, and `academy_draft_id`.
3. Select all fixtures on that Monday local date whose season is either the
   current Premier season or current Academy season.
4. Classify each fixture by its season: current Premier season is Premier and
   current Academy season is Academy.
5. Resolve the one bound `betting_events` row for each league and canonical
   season.
6. Match each fixture team name, normalized with trim and lowercase, to a team
   in that league's active draft.
7. Match each active draft team's abbreviation, normalized with trim and
   uppercase, to exactly one existing non-prop `betting_teams` row.
8. Validate the complete candidate slate before any inserts occur.
9. Insert one market for each fixture that does not already have a linked
   market. Use the bound event, schedule-order teams, `CODE_A vs CODE_B`
   title, fixture kickoff, zero rake, and no draw.
10. Return a compact result containing the target Monday, candidate count,
    created count, and already-present count. Supabase Cron records this result.

The generator inserts through a focused internal helper that preserves the
same market values as `create_market_admin`. Scheduled markets are system
created and do not impersonate a human Discord profile in
`betting_admin_audit`; their provenance is the non-null `fixture_id` plus the
Cron execution record. Manual market creation remains audited exactly as it is
today.

## Validation and failure behavior

Generation is all-or-nothing. Before inserting, fail the transaction when any
of these conditions is true:

- Premier or Academy has no fixture for the target Monday.
- A selected fixture has no kickoff, team A, or team B.
- Either active draft ID is missing.
- A fixture team name does not resolve to exactly one team in the appropriate
  active draft.
- A draft team abbreviation does not resolve to exactly one non-prop betting
  team.
- The required bound betting event is missing or ambiguous.
- The same fixture appears more than once in the candidate set.
- An existing fixture-linked market disagrees with the current event, teams,
  kickoff, title, rake, or draw setting.

An identical linked market is counted as already present and skipped. This
makes retries and authorized manual reruns safe. A changed fixture never
silently edits a market that may already contain bets; staff must review and
repair that mismatch manually.

Because Premier and Academy are validated and inserted in one transaction, a
problem in either league leaves both slates unchanged.

## Security

- The scheduled function is not executable by `anon` or `authenticated`.
- Only `postgres`/Cron and `service_role` can invoke generation.
- The manual/test timestamp entry point is also service-role-only.
- The generator uses a fixed `search_path`, schema-qualified relations where
  appropriate, and no user-supplied SQL.
- Existing public betting reads and all money-moving RPC authorization remain
  unchanged.
- Event binding writes continue through the staff-only server action and the
  service-role client; UI visibility is not treated as authorization.

## Testing

Add pgTAP coverage that proves:

- a valid Tuesday Eastern run creates the complete Premier and Academy slate;
- generated markets use the correct season events, schedule order, titles,
  kickoff, zero rake, no draw, and five-minute lock;
- EDT and EST UTC invocations each generate exactly once at 1:00 AM Eastern;
- the nonmatching UTC invocation is a no-op;
- rerunning the same target week creates no duplicates;
- any missing event, draft, fixture field, draft-team mapping, or betting-team
  mapping aborts the complete transaction;
- ambiguous event or abbreviation mappings abort;
- an identical existing linked market is skipped;
- a mismatched existing linked market aborts instead of being updated;
- `anon` and `authenticated` cannot execute the generator;
- the two Cron jobs exist with the expected schedules and commands.

Add Vitest coverage for the catalog server action and form changes:

- valid league/season bindings are normalized and persisted;
- clearing a binding persists null metadata;
- invalid or half-specified bindings are rejected;
- existing staff authorization and audit behavior remain intact.

Run the narrow pgTAP and Vitest tests first, then the repository's full
database suite, unit suite, lint, and production build before completion.

## Documentation and operations

Update `docs/backend.md` to describe the fixture-linked market generator, the
event binding fields, the two DST-aware Cron entries, the strict failure
behavior, and the manual repair path. Operators can inspect failures in
Supabase Dashboard under Cron job runs or in `cron.job_run_details`.

## Out of scope

- Automatically creating betting teams or betting events.
- Automatically resolving or cancelling markets after matches.
- Creating weekly events; season events are reused.
- Automatically modifying an existing fixture-linked market after schedule
  changes.
- Changing rake, draw rules, opening lines, or the five-minute lock convention.
- Sending a separate Discord failure notification.
