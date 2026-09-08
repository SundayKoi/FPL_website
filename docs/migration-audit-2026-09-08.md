# Database migration audit — 2026-09-08

Target: **FPL Website**, project `tyywoneobreracfnujdk`, verified against the
linked CLI project, project metadata, and the application's environment URLs.

## Findings and repairs

- Production history stopped at `20260911000001`, but the next 25 SQL files
  through `20260930000001` were already represented in the live schema.
  Checked their tables/indexes/triggers/policies, latest function bodies,
  print-number backfill, Academy links, and Showdown seed rows. Superseded
  function definitions were compared against their latest replacements.
- Repaired 24 unique history entries for those 25 files, without replaying
  their DDL. Two immutable files share version `20260915000001`.
- Added `scripts/supabase-migrations.mjs`: stages that known duplicate as one
  file in original filename order, rejects other duplicate versions, and
  runs the linked CLI. Source migrations are unchanged. Use this wrapper
  for production migration list/push; raw CLI push still trips over the
  historical collision. This is not a replacement for a fresh-install
  baseline or a wrapper for `supabase db reset`.
- Applied the genuinely missing `20261001000001_betting_stats_settlement.sql`.
  It adds the service-only stats settlement RPC and evidence columns. The
  migration itself does not settle any markets.
- Added the forward migration `20261009000001_migration_audit_repairs.sql`.
  It captures the existing live provenance fix so mint, transfer and
  retirement keep `opening_id` alongside season/print metadata. It explicitly
  removes public/player grants from auto-dust rules and Showdown private tables
  and mutation RPCs. The version is after `main`'s latest migration and can be
  applied idempotently through the wrapper.
- Corrected stale pgTAP expectations: Showdown assertion count, expedition
  payout ceiling, and invalid provenance fixture SQL / missing Dribb field.
  Added provenance regressions for transfer, retirement and print metadata.

## Verification

- Schema-only production snapshot restored into an isolated local database;
  no production player data was copied. Added local-only baseline settings,
  bracket seeds, and publication membership needed by fixtures.
- 25 focused pgTAP files, **367 assertions passed**, including all 28 stats
  settlement assertions and the updated provenance tests.
- Application Vitest suite: **382 files / 3,196 tests passed**. Migration
  tooling tests subsequently passed separately: **11 tests**, including
  three new wrapper tests.
- ESLint passed with one existing image warning. TypeScript passed after
  removing an unnecessary suppression from the new test file.
- Full database suite was also attempted: **123 files / 1,570 assertions
  executed**, but it is not green. Legacy tests reference removed daily
  reward signatures and older expedition behavior; the schema-only fixture
  also lacks older seed/publication setup. The focused migration checks
  above are the verified coverage, not a claim that every database test passes.
- Production build was attempted twice: Google Fonts fetching failed in the
  restricted run; the network-enabled retry hit a Turbopack worker port-binding
  restriction. No successful build is claimed.
- Post-deployment SQL confirmed the settlement signature/service access,
  denied player access to Showdown mutations and private tables, and preserved
  provenance metadata. Run the wrapper dry run after merging this forward
  migration to confirm the linked database's pending set before applying it.

The post-change Supabase advisor no longer lists the three Showdown mutation
RPCs as publicly executable. Other existing advisor notices remain, including
seven security-definer views and ten functions with mutable search paths;
this migration audit is not a complete security audit. See the
[Supabase database linter](https://supabase.com/docs/guides/database/database-linter)
for those categories.

## Operational follow-up

Always use a forward migration for live fixes, then apply through the wrapper.
Do not run the old blanket history-repair helper or `--include-all` to silence
mismatch warnings: verify actual SQL first. A raw duplicate-version warning
is expected until the repository adopts a separately reviewed fresh-install
baseline. Existing migration files were intentionally not renamed or deleted.
