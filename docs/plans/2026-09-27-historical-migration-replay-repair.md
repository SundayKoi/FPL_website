# Scoped historical migration replay repair

The user authorized a narrow repair to `20260922052204_rebuild_season_end_draft_after_hash_fix.sql` as part of the test-cleanup work. This local exception does not authorize remote SQL, migration-history edits, release, or deployment.

The migration sorts before the later migration that creates `season_end_releases`, but its PL/pgSQL `%rowtype` declaration resolved that table at function creation time. Fresh replay therefore failed before it could reach the table guard. The repair uses an untyped `record` and returns only when `to_regclass('public.season_end_releases')` is null. It preserves the existing selection, hashing, locking, and replacement body and still surfaces errors when the table exists.

The history checker permits the `20260922052204` transition only when both Git blobs match the reviewed pair: prior `787088fc1e1a149e165de22cb592c09b26cd7144`, repaired `ced3709037e6667ec5894ada0fdb4be91d35adf7`. It still rejects any other edit to the path.

Fresh replay then exposed a second applied-history defect in `20261018000001_card_art_champion_preferences.sql`: both `LANGUAGE sql` functions began with a bare `CASE`, so PostgreSQL rejected the migration. A read-only query of the deployed project showed both live function definitions already use `SELECT CASE`. With the user's explicit authorization, the tracked migration now adds that `SELECT` to each function, matching the deployed definitions. The history checker pins this separate exact transition too: prior `adbe558c876189cfefe2702c5792c608e77e1490`, repaired `70cc593739bb010d65bc10d37a458cf17292aaa5`. Its regression test proves this pair passes and an additional byte change fails. The existing `0122_card_art_champion_preferences_test.sql` exercises these SQL functions, aliases, scope, and forbidden writes.

`supabase/tests/0130_season_end_historical_replay_test.sql` exercises replay before the dependent table exists, no-draft no-op, scoped repair of the latest Premier S5 draft, preservation of locked/public/older/foreign rows, repeat-run idempotency, and one emitted repair event.

## Migration history reconciliation

The earlier handoff was based on a checkout missing seven migration files. This branch is based on `origin/develop`, which contains all seven: `20261028000001`, `20261029000001`, and `20261101000001` through `20261105000001`. A read-only migration listing for Supabase project `tyywoneobreracfnujdk` confirmed those versions are already applied remotely, and `supabase/.temp/project-ref` names that same project. The release-history mismatch is resolved by using the correct `develop` history; no remote history repair or database write was needed.

The remote list also records `20260922052204` as applied. The local integration runner replays tracked migrations on a newly created local stack; it never links that stack to the cloud project.

## Verification and release status

The migration checker pins both exact old/new blob pairs, and its regression test proves each reviewed pair passes while an unreviewed edit fails. Final `npm run test:infra` passed with 245 migration sources staged as 242 versions, fresh migration replay, 157 pgTAP files / 2,433 assertions, a production build, and seven real Chromium journeys. `npm run test:db` uses the same disposable local-only stack and all final contract files passed in the full run. After committing, run `node scripts/check-migrations.mjs origin/develop HEAD` against the exact PR base and commit; no cloud history mutation is part of this verification.

The abandoned test project `fpl-e2e-0f0b2bff11` had no containers when inspected, so no unrelated live local Supabase stack was stopped. No production migration, history mutation, push, merge, or deployment was run. The documented release route remains PR to `develop`, green `checks` on that exact commit, then the release workflow merges to `main`.
