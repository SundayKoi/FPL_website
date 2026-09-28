# Test-suite reduction implementation plan

Date: 2026-09-27

Branch: `clean-up-tests`

Status: implementation and local verification complete. The CSV inventory has 629 assertion rows across 626 test paths. Final Vitest is 257 files / 2,738 tests; typecheck passes, ESLint has one existing `<img>` advisory, and Python passes (25 tests). The final `npm run test:infra` passes: 245 migration sources stage to 242 versions; fresh replay and 157 pgTAP files / 2,433 assertions pass; the production build completes; and all seven Chromium browser journeys pass. The retained Vitest suite is 44,849 lines with 6,635 `expect()` calls, down from 431 files, 59,642 lines, and 8,805 calls. The 85–130 file target remains unmet; the remaining contracts and rationale are recorded below. Two exact, user-authorized repairs to already-applied migrations are pinned in the history checker and detailed in the [historical replay repair handoff](2026-09-27-historical-migration-replay-repair.md). The seven migration versions previously missing locally are present on `origin/develop` and confirmed applied remotely; no cloud history repair was needed.

## Objective and decisions

Significantly reduce feature-specific tests and their maintenance burden. Make a small set of infrastructure E2E journeys the primary proof that the application works across browser, Next.js, authentication, database, and realtime boundaries.

Do not write tests for reversible, low-impact changes or assertions that mirror the implementation. Do not translate deleted component tests into browser tests. Keep tests only when they protect a consequential failure and exercise the layer that can actually detect it.

The proposed exception to E2E-first coverage is a compact set of database contracts and fast infrastructure regressions. Browser happy paths cannot establish RLS, caller authorization, transaction rollback, malformed signature handling, or every idempotency edge. Keep those checks at their authoritative boundary. This is not an E2E-only rewrite and does not preserve every existing unit test under an “infrastructure” label.

Reduction targets, subject to the assertion audit below:

- Remove approximately 70–80% of the 431 TypeScript test files: roughly 85–130 remain at most as an initial target, preferably fewer where justified. Reduce test code and assertions too; combining files without removing redundant coverage does not count.
- Remove most of the 196 app/component test files. Retain a DOM test only for a named consequential behavior that cannot be covered more directly and reliably elsewhere.
- Keep about 7–9 independent infrastructure browser scenarios, Chromium only initially. No route-by-route, card-variant, screenshot, or cosmetic regression matrix.
- Consolidate SQL tests around unique authorization, isolation, lifecycle, and money invariants. Do not impose an arbitrary SQL deletion quota: report the actual reduction and why each remaining contract matters.
- Retain the two Python infrastructure test modules, reducing redundant cases where justified. Do not replace deterministic ingestion/settlement checks with live Riot or Discord calls.

These are planning targets, not permission to remove unique important coverage to hit a number. If the target cannot be reached safely, record the remaining contracts and their cost explicitly.

## Evidence from discovery

The implementation branch `feature/clean-up-tests-infra` is based on `origin/develop` at `ff20e8582c61e6a43600bfed0eb38bbcb67a5d5d`. It is isolated from the original `feature/redesign-UI` checkout, whose extensive unrelated tracked and untracked changes remain untouched and outside this branch.

| Surface | Observed baseline | Implication |
| --- | --- | --- |
| TypeScript tests | 431 files, 59,642 lines | Largest reduction opportunity. |
| Vitest projects | 225 Node files; 206 remaining files selected for jsdom by current globs | Pure logic under `src/app` can run in jsdom unnecessarily. |
| TypeScript directories | 157 component, 39 app, 226 library, 4 hook, 5 script files | Classify assertions, not just directories. |
| Mocking | 169 files contain `vi.mock(` | Review setup cost versus observable protection; a mock is not automatically bad. |
| File-reading tests | 16 files contain `readFileSync` | Some inspect CSS/SQL text; migration-tool tests also read files legitimately. |
| SQL | 150 numbered test files, 14,800 lines | Many are valuable real database contracts; consolidate carefully. |
| Python | 2 modules | Ingestion and settlement infrastructure. |
| Playwright | 6 scenarios in 5 files | Baseline inventory only; seven journey groups now run against the production build and disposable local stack. |
| CI | Migration history check, typecheck, lint, Vitest, Python | No production build, pgTAP, or browser run in current CI. |
| Release | `.github/workflows/release.yml` waits for check run named `checks` on the exact `develop` commit | New verification must feed that gate. |

Representative evidence, not a claim that every assertion has already been reviewed:

- `src/components/cards/PlayerCard3D.test.tsx` has 1,080 lines, including exact classes, transforms, artwork paths, and decorative labels. `ExpeditionBoard.test.tsx` has 1,315 lines. Large mixed files need assertion-level classification.
- `src/components/home/FeaturedHomepageCopy.test.tsx` mocks many data providers and child components to assert supplied headings and copy. Remove this kind of test without replacing it.
- Card mockup tests read CSS source. Expedition and pack tests sometimes search SQL/source strings. These do not establish deployed database behavior.
- `src/app/auth/callback/route.test.ts` actually tests `safeNextPath`, including an origin-escape regression. Keep the behavioral protection and move it to an appropriate Node location; do not remove it just because it is in `src/app`.
- `src/lib/betting/discord/verify.test.ts` signs real messages and checks tampering/malformed input. This is useful infrastructure coverage; consolidate overlapping malformed-input cases.
- `src/lib/match-draft/sync.test.ts` checks stale revisions. Preserve that invariant even if most surrounding presentation cases are removed.
- `supabase/tests/0008_grants_test.sql` protects direct-write and private-RPC permissions. `0126_season_end_release_hardening_test.sql` includes duplicate-request, frozen-outcome, and publication contracts. These are not cosmetic tests.
- `src/app/serverClientBoundary.test.ts` documents a real binder-page failure, but uses a naming/regex heuristic. Preserve until production-build/runtime coverage or a suitable static check demonstrably catches the relevant failure. Do not mistake it for a complete boundary checker.

Read [testing guidance](../testing.md), [backend contracts](../backend.md), [release contracts](../releases.md), and [repository instructions](../../AGENTS.md) before implementation. Installed Next.js guides at `node_modules/next/dist/docs/01-app/02-guides/testing/{playwright,vitest}.md` recommend production-code E2E and explain the limitation around async Server Component unit tests. Read the installed environment-variable guide before changing build/test environment handling; public variables are inlined at build time.

## Coverage disposition

Create `docs/testing-inventory.csv` during implementation with one row per existing test file and split rows for mixed files. Columns: path, contract/assertion group, disposition (`delete`, `retain`, `consolidate`, `replace`), failure prevented, authoritative layer, replacement path/scenario if any, verification evidence. This is a migration ledger, not a new custom test framework.

| Existing area | Default disposition | Important exceptions / destination |
| --- | --- | --- |
| Home, navigation, directories, informational pages, branding, card rendering | Delete copy/class/layout/static-link/prop-passthrough assertions | Preserve any genuine private-data exposure or consequential interaction regression until mapped. Keyboard/focus behavior is not automatically cosmetic; assess actual impact without creating a visual E2E matrix. |
| `src/lib/cards/*Mockups*`, decorative card variants, theme, formatting, display labels | Delete implementation-mirroring cases | Keep any independent inventory, ownership, edition-integrity, or monetary logic mixed into the file. |
| `src/app/**/page.test.tsx` and heavily mocked async pages | Delete render-wiring tests | Server authorization and real request behavior move to access/isolation E2E or retained focused boundary checks. |
| Query and action mocks | Delete exact chain/call-order assertions and trivial forwarding tests | Preserve pagination/data-loss, scope filtering, caller identity derivation, and failure propagation until real integration coverage proves the contract. |
| `src/hooks/useDraftState`, match-draft synchronization, draft components | Consolidate | Browser multi-user propagation and catch-up; retain a few fast out-of-order/retry cases if browser scheduling cannot exercise them deterministically. |
| Packs, market, trades, Season's End, daily rewards | Remove UI duplication; consolidate important contracts | Persisted ownership, wallet accounting, single fulfillment, recovery, stale offers, and shared reward caps. Standard and Season's End inventory are separate systems; one does not prove the other. |
| Expeditions, fantasy, Higher/Lower, FPL'dle feature rules | Delete display/config/source-text duplication; review domain rules | Keep unique irreversible reward/state-transition protections; do not generate an E2E spec per feature. |
| Stats, scouting, scheduling, identity, bracket logic | Delete presentation/mapping trivia | Retain incorrect-winner, duplicate-ingestion, cross-season contamination, destructive reassignment, and financial-input regressions. |
| Auth, callback, Discord verification, trusted job boundaries | Retain/consolidate narrow negative and positive cases | A browser sign-in smoke does not prove OAuth exchange, signature validation, or service-role caller checks. |
| Migration ordering/staging script tests | Retain | Real temp-directory/Git-history behavior protects immutable SQL and release correctness. |
| SQL schema-shape and historical feature tests | Consolidate; remove superseded/duplicate assertions | Preserve active grants, RLS, forbidden transitions, rollback, exact-once debit/credit, immutable release and identity contracts. Do not edit migrations. |
| Python ingestion and settlement | Retain/consolidate | External payload normalization, unique-match counting, incomplete/conflicting evidence, season boundaries, retries, and error propagation. |

Before deleting a meaningful assertion, name where its failure would now be detected. “Covered by E2E” must identify the exact assertion and execution path, not just a file name. Purely cosmetic assertions need no replacement.

### Final reduction audit

The safe reduction stopped at 257 Vitest files (250 under `src/`, plus seven script contracts), not the initial 85–130 target. That is a 40% file reduction, with 24.8% fewer test lines, 24.6% fewer `expect()` calls, and 41.4% fewer files using `vi.mock()`. The 629-row inventory records 206 deletions, seven consolidations, four replacements, and 412 retained contract rows (some mixed files have more than one row).

The 250 remaining `src/` files cover 181 library, 37 component, 28 app, and four hook contracts. Their failure modes are spread across distinct authoritative systems that seven browser journeys cannot replace: money calculations and ledger/idempotency edges; ownership and league/season scoping; authentication, OAuth redirect and signed-provider verification; ingestion/identity normalization and duplicate handling; pagination and data-loss boundaries; and the rule/state machines for multiple independent games and card systems. The database suite supplies real RLS, grants, transaction, rollback, and RPC checks; Vitest keeps deterministic branch and malformed-input coverage that browser happy paths cannot establish. Removing another 127 files to hit the numeric target would delete unique protection without an equivalent passing replacement. The target is therefore recorded as unmet rather than met by grouping files or relabeling unrelated tests.

## Target E2E journeys

Use real application requests, local Auth, migrations, RLS, RPCs, and realtime. Seed setup through trusted test helpers, but perform the behavior under test through the ordinary application/user boundary. Privileged readback can confirm persisted results; privileged mutations cannot substitute for testing a user's permissions. External providers may be stubbed at their network boundary only where necessary; document what remains untested.

| Journey | Required observable outcome | Files / changes |
| --- | --- | --- |
| Session and access | Password sign-in on the local stack, session survives reload, sign-out revokes browser access. Anonymous and ordinary members cannot read private data or perform an admin mutation; authorized staff can. Verify denial and unchanged persisted state, not merely hidden controls. | New `e2e/access.spec.ts`; reuse login helpers. Keep focused OAuth/redirect/signature tests. |
| League and season isolation | Seed distinguishable Premier, Academy, and historical-season records. Exercise a representative shared read and scoped mutation. Foreign records stay absent and a foreign identifier cannot broaden access. | New `e2e/isolation.spec.ts`; consolidate existing weak public-boundary checks. SQL retains the broader table/RPC matrix. |
| Auction propagation and recovery | Two captains nominate/bid; the other browser sees updates without refresh. Disconnect one context, mutate from the other, reconnect and observe catch-up. Settlement persists exactly once with correct roster, budget, and turn. | Strengthen `e2e/draft.spec.ts`; retain local countdown and use observable waits. |
| Match-draft synchronization | Separate captains apply one valid draft action, observer catches up after reconnect, stale revision cannot overwrite newer state, spectator cannot mutate. | New `e2e/match-draft.spec.ts`. Auction coverage does not exercise this separate synchronization implementation. Keep adversarial ordering in Node/SQL if needed. |
| Betting wallet lifecycle | Member places stake, staff resolves, member reloads and sees the persisted balance and settled record. Repeating resolution cannot pay twice. | Strengthen `e2e/betting.spec.ts` with ledger/balance readback; retain SQL lock/rollback/permission cases. |
| Purchase recovery | Start one paid Season's End opening, interrupt at an observed pending state, resume the same request, verify one charge, one opening, five distinct owned copies. Another member cannot recover that opening. | Split recovery out of `e2e/season-end.spec.ts`; independent seed. Do not rely on racing an immediate reload against an unknown request state. |
| Ownership and commerce | Independently seed owners/copies, complete one sale and one trade, assert exact owner IDs and wallet/provenance deltas after reload; dust once with one credit. | Separate independently seeded scenario in `e2e/season-end.spec.ts`. Database tests prove stale offers, duplicate dust, and standard-card contracts. |

This is seven scenario groups. Allow up to nine individual scenarios if splitting improves failure diagnosis, not to add feature breadth. Each scenario must be independently seedable and runnable.

Existing E2E decisions:

- Remove `e2e/color-system.spec.ts` from the automated infrastructure suite. It contains useful contrast checks alongside exact color assertions; record that ongoing visual/accessibility review becomes change-driven/manual, rather than claiming build/typecheck replaces accessibility coverage.
- Remove `e2e/fpldle.spec.ts` unless the assertion audit finds an otherwise uncovered infrastructure contract. The current test proves two puzzles can be solved, not shared reward accounting. Keep daily reward idempotency and scope checks in SQL; do not retain this browser test just for feature completeness.
- Replace the first Season's End test: checking two pages lack “Admin preview” and “test wallet” text does not establish row-level league/season isolation.
- Replace incidental DOM structure dependencies such as betting's sibling XPath and commerce's first `section` where they obstruct stable outcomes. Prefer accessible roles/names; introduce a small semantic test ID only if necessary. Avoid restyling production UI in this cleanup.

## Implementation sequence

### 1. Record the baseline and classify tests

1. Confirm branch and current dirty state. Never reset, stash, or delete unrelated work. Recount files at execution time and record the base commit and pre-existing edits.
2. Build the assertion inventory. Review all files proposed for deletion; the examples above are starting points, not blanket directory deletion instructions.
3. Run the current fast checks once to distinguish pre-existing failures: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:python`. Capture duration, failures, file/test counts and environment. Use discovery before any database-writing browser run.
4. Mark unique infrastructure contracts and their replacement prerequisites. Failing meaningful tests remain tracked defects; do not erase a failure by relabeling it as redundant.

Deliverable: baseline plus approved-by-reasoning dispositions in the inventory. No separate user approval checkpoint is required for routine choices within this plan.

### 2. Make local integration execution trustworthy

Files: `playwright.config.ts`, `e2e/fixtures.ts`, all seed helpers, `e2e/season-end-fixture.ts`, a small shared local-stack launcher/config helper, and package scripts as needed.

1. Resolve API URL, anon key, service-role key, and database identity from the same explicitly selected local stack. Reject remote URLs, mixed credentials, and ambient overrides before any fixture write. Do not print credentials. Validate explicit loopback endpoints and expected stack identity, not substring matches on URLs.
2. Current draft/betting/Season's End helpers allow environment URL/key overrides. Replace that behavior consistently. FPL'dle currently selects the first `supabase_db_*` container; remove it with its obsolete spec or target the exact selected stack if retained. Season's End currently combines API configuration with separately resolved local SQL; ensure these cannot refer to different databases.
3. Launch a dedicated test app with explicit local environment. Do not reuse an arbitrary server on port 3000 (`reuseExistingServer` is currently true). Fail on a conflicting port or use an assigned test port. Do not rewrite a developer's `.env.local` or mutate the cloud CLI link.
4. For CI, build once with those same local public variables, then run the production server. Confirm the local password sign-in path remains available with local configuration in a production build; do not introduce a production auth bypass. A local dev-server option may remain for focused iteration.
5. Keep one worker until independent fixture isolation is demonstrated. Give scenarios their own identifiers, deterministic cleanup, and `finally` disposal. Fixed users must have known state at the beginning of each run. Scope fixture deletion; never wipe an existing developer database to seed a scenario.
6. Restrict the betting-membership bypass to the intended commerce fixtures. It does not verify the Discord role gate. Keep/strengthen focused gate-denial checks; do not globally bypass staff/owner/captain authorization.
7. Do not permit real Discord/Riot side effects from local seeded jobs or cron. Use inert test settings and prevent outbound operational writes while preserving the application/DB paths being tested.

Migration bootstrap uses `scripts/supabase-migrations.mjs`'s pure `stageMigrations` helper to combine the three known historical version collisions without changing the order of tracked files; unknown duplicate versions remain fatal. The isolated runner replays all staged migrations without copying cloud-link metadata. Both authorized replay repairs are pinned by exact old/new Git blobs in `scripts/check-migrations.mjs`. The historical replay regression is covered by `supabase/tests/0130_season_end_historical_replay_test.sql`; fresh replay and pgTAP pass in the final integration run. The seven remote versions formerly missing from the handoff checkout are present on `origin/develop` and already applied remotely. No remote history repair or database write was performed.

Verification: meaningful preflight cases reject remote/mixed config before writes; clean local migrations apply; each seed succeeds against the selected stack. These guards warrant tests because a mistake can mutate the wrong database. Keep their tests small and behavioral.

### 3. Establish the replacement integration contracts

1. Implement the seven journey groups above, reusing existing fixtures and adding only necessary helpers.
2. For recovery, use an observed durable request/opening ID and pending state or narrowly controlled transport interruption. Verify database results independently; do not import the implementation's result calculator to construct expected outcomes.
3. For authorization, exercise actual forbidden requests/RPCs with the user's identity. Where real Next.js action requests are necessary, capture/use the actual app request rather than hardcoding generated action IDs. SQL permissions alone do not prove service-role-backed server actions authenticate callers.
4. Keep no blanket `waitForTimeout`, no mocked Supabase success responses, and no global console-error suppression. Retain traces/logs on failure with secrets redacted. Expected denial responses should not be mistaken for unexpected server crashes.
5. Run each changed scenario once as it is developed. Re-run recovery/reconnect only when resolving a concrete timing concern. Record any uncovered pre-existing product defect separately; do not weaken assertions around it.

Exit: replacement behavior has been observed against the actual local app/DB. A `--list` result alone does not satisfy this step.

### 4. Delete redundant tests and consolidate retained contracts

1. Remove pure visual/copy/source-string cases first. Do not add replacement tests for these deletions.
2. For mixed files, extract the few high-value assertions before removing the expensive presentation harness. Explicitly review monetary, ownership, scope, pagination and authorization failures.
3. Consolidate retained Node tests by contract where this reduces duplication. Move pure logic out of jsdom discovery when appropriate. Avoid one giant generic test file, fixture factory, or registry that is harder to diagnose than the original suite.
4. Consolidate pgTAP by active contract, keeping each file's plan, `finish()`, and transaction rollback. Preserve meaningful negative-role tests and rejected-write state assertions. Use existing helper includes. Tests may be reorganized; historical migrations may not be edited. No production schema change is expected from this cleanup.
5. Do not claim single-transaction pgTAP proves concurrent races. Retain/add a small real multi-session integration case only for a specific critical concurrent-write contract lacking coverage; sequential idempotency is a different guarantee.
6. Remove dead test-only fixtures/matchers and dependencies only after searching their consumers. `src/lib/cards/samples.ts`, for example, is used by the E2E Season's End fixture; test-looking code is not automatically dead. Remove jsdom/Testing Library/plugin support only if no retained consumers require it.
7. Reconcile `vitest.config.mts`, `src/test-utils/*`, `src/vitest-matchers.d.ts`, `package.json`, lockfile and `tsconfig.json` only as needed. Do not hide tests with exclusions, `.skip`, `.todo`, or `passWithNoTests` to make counts fall. Keep discovery simple.

Exit: inventory accounts for every deletion/retention, and retained infrastructure invariants still have executable coverage. Report both file and line/assertion reductions.

### 5. Make CI and release use the new policy

Files: `.github/workflows/ci.yml`, `package.json`, Playwright config, bootstrap scripts; change `.github/workflows/release.yml` only if the gate architecture requires it.

1. Preserve migration history verification, typecheck, lint, reduced Vitest and Python checks.
2. Add a dedicated local Supabase bootstrap with no production secrets. Run the retained pgTAP contracts, build once against the local environment, install Chromium with the matching lockfile Playwright version, and run the small infrastructure E2E suite.
3. Prefer keeping these required steps inside the existing `checks` job initially. If runtime/resource evidence warrants splitting jobs, make `checks` an always-evaluated aggregate that fails for failed/cancelled/missing required dependencies. Preserve the exact-commit release contract. An optional independent browser job is insufficient.
4. Keep PR and `develop`/`main` push coverage; do not add broad path exclusions while removing unit coverage. Never use `continue-on-error` for required integration tests. Disable focused tests in CI and avoid retries that conceal first-run failures.
5. Upload actionable failure artifacts and clean up only the test stack on all exit paths. Measure the added build/stack time before adjusting the current 20-minute CI timeout. Fewer assertions may reduce maintenance without reducing CI wall time; report that tradeoff honestly.

### 6. Document the policy and complete verification

Update [testing guidance](../testing.md), the [README checks section](../../README.md#tests-and-checks), and the testing guidance in [AGENTS.md](../../AGENTS.md), preserving unrelated edits and the generated Next.js block. Document:

- No automated test by default for reversible styling, copy, layout, simple formatting, or implementation-mirroring wiring.
- New tests need a concrete consequential failure and the narrowest layer that can establish the behavior. Prefer extending a retained contract over creating a feature-specific suite.
- E2E is reserved for the critical boundary journeys above; no one-for-one replacement of component tests.
- Database permission/money invariants and trusted-job ingestion regressions remain required where changed.
- A change-based command matrix, local-only fixture setup, production-mode E2E command, required CI checks, and honest unsupported external-provider behavior.
- Once appropriate checks pass, repeat/broaden only for new edits, failures, or unresolved evidence.

For the completed implementation, run typecheck, lint, retained Vitest, Python, retained pgTAP, one production build, and the complete reduced E2E suite. Reuse the build for that run. Run the migration-history check against the actual base for the proposed merge, using the documented command, not a guessed branch. Also verify E2E discovery and no orphaned test imports. Broad verification is justified here because discovery, dependencies, CI, and coverage across the repository change.

## Completion criteria and handoff report

- Substantial measured reduction in test files, lines, assertions, mocks and fixture duplication; cosmetic tests are deleted rather than relocated.
- Each retained test has a named meaningful contract; unique security/data-integrity protections have not silently disappeared.
- All seven infrastructure journey groups pass against real local services, with independently seeded scenarios and persisted outcome checks.
- Migration setup is reproducible on a fresh disposable stack without touching cloud data or rewriting historical SQL.
- Required database/browser results reach the `checks` gate used by releases.
- Appropriate checks pass. Report pre-existing failures and unavailable infrastructure separately; neither is a pass. If integration is blocked, retain coverage whose replacement depends on it and leave the corresponding task incomplete.
- Document before/after counts and durations, deleted categories, retained exceptions, meaningful replacement evidence, known gaps, and exact commands/results. Do not claim OAuth-provider, live Discord/Riot, cross-browser, full accessibility, or all-route coverage.
- Commit/stage only changes made for this task if that is part of the execution request. No deployment, cloud migration, remote data mutation, or production release is authorized by this plan.

## Final verification record

- `npm run typecheck` — passed.
- `npm run lint` — passed with one existing `@next/next/no-img-element` warning in `src/components/captain/scouting/ChampionDatum.tsx`.
- `npm test` — 257 files and 2,738 tests passed.
- `npm run test:python` — 25 tests passed.
- `npm run test:infra` — fresh migrations, 157 pgTAP files / 2,433 assertions, production build, and seven real Chromium journeys passed; runner stopped and removed its disposable project in `finally`.
- Migration history checker — exact replay-repair exceptions and adversarial regression tests are included; final `node scripts/check-migrations.mjs origin/develop HEAD` passed, with only the three documented pre-existing duplicate-version warnings.
- Release path — focused PR to `develop`, then green `checks` on that exact commit; the release workflow merges it to `main`. No merge, cloud migration, or deployment was performed here.
