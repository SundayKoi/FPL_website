# Scoped historical migration replay repair

The user authorized a narrow repair to `20260922052204_rebuild_season_end_draft_after_hash_fix.sql` as part of the test-cleanup work. This local exception does not authorize remote SQL, migration-history edits, release, or deployment.

The migration sorts before the later migration that creates `season_end_releases`, but its PL/pgSQL `%rowtype` declaration resolved that table at function creation time. Fresh replay therefore failed before it could reach the table guard. The repair uses an untyped `record` and returns only when `to_regclass('public.season_end_releases')` is null. It preserves the existing selection, hashing, locking, and replacement body and still surfaces errors when the table exists.

The history checker permits the `20260922052204` transition only when both Git blobs match the reviewed pair: prior `787088fc1e1a149e165de22cb592c09b26cd7144`, repaired `ced3709037e6667ec5894ada0fdb4be91d35adf7`. It still rejects any other edit to the path.

Fresh replay then exposed a second applied-history defect in `20261018000001_card_art_champion_preferences.sql`: both `LANGUAGE sql` functions began with a bare `CASE`, so PostgreSQL rejected the migration. A read-only query of the deployed project showed both live function definitions already use `SELECT CASE`. With the user's explicit authorization, the tracked migration added that `SELECT` to each function, matching the deployed definitions. The history checker pins this separate exact transition too: prior `adbe558c876189cfefe2702c5792c608e77e1490`, repaired `70cc593739bb010d65bc10d37a458cf17292aaa5`. That repaired migration is now present on `develop`; the local migration stager uses it directly without a replacement. Its regression tests prove the source has replayable SQL bodies. The existing `0122_card_art_champion_preferences_test.sql` exercises these SQL functions, aliases, scope, and forbidden writes.

`supabase/tests/0130_season_end_historical_replay_test.sql` exercises replay before the dependent table exists, no-draft no-op, scoped repair of the latest Premier S5 draft, preservation of locked/public/older/foreign rows, repeat-run idempotency, and one emitted repair event.

## Migration history reconciliation

The earlier handoff was based on a checkout missing seven migration files. The final candidate merges `origin/develop` through `c7369b4f7087ddf598a82f369d91623769b9e699`, which contains all seven: `20261028000001`, `20261029000001`, and `20261101000001` through `20261105000001`. On 2026-09-28, after confirming `supabase/.temp/project-ref` is `tyywoneobreracfnujdk`, a read-only listing of that project confirmed these versions are applied. The release-history mismatch is resolved by using the correct `develop` history; no remote history repair or database write was needed.

The remote list also records `20260922052204` as applied. The local integration runner replays tracked migrations on a newly created local stack; it never links that stack to the cloud project.

## Verification and release status

On 2026-09-28, the committed source/test candidate `810fa7b46eb850d91acc6689c9e9e0c6aef77c11` passed the review matrix. `npm run test:infra` staged 247 migration sources as 244 versions, replayed the full local history, passed 159 pgTAP files / 2,455 planned assertions, built the production app, and passed all seven Chromium journeys; the isolated stack stopped and temporary Next.js type paths were restored. The separate full verification commands and timings are in the [review completion handoff](2026-09-28-clean-up-tests-review-completion.md).

`node scripts/check-migrations.mjs c7369b4f7087ddf598a82f369d91623769b9e699 810fa7b46eb850d91acc6689c9e9e0c6aef77c11` passed on the committed candidate. It reported only the three pre-existing duplicate-version warnings: `20260915000001`, `20261005000001`, and `20261009000001`. The checker pins both exact historical repair pairs and its regression tests reject unreviewed changes. No cloud migration or history mutation was performed.

The local integration runner uses an isolated disposable project. The two latest candidate migrations were tested locally; they were not applied to the cloud project. The user-authorized old local test project had been inspected before this run; the runner stopped only the project it created.

PR #388 remains open at remote head `3ce7a6dbf662a9adc0eabb5789b19d5c9577952b`, targeting `develop`. GitHub reports its `checks` run succeeded on that older commit; it does not validate this local candidate, which remains unpushed. No push, PR merge, production migration, deployment, or release was run. The eventual proposed commit still needs the required green `checks` result before the separately authorized release workflow can merge it to `main`.
