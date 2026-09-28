# Clean-up tests review completion handoff

Date: 2026-09-28

## Candidate and base

- Verified source/test candidate: `810fa7b46eb850d91acc6689c9e9e0c6aef77c11` on `feature/clean-up-tests-infra`, in `.worktrees/develop`.
- Latest merged base: `origin/develop` at `c7369b4f7087ddf598a82f369d91623769b9e699`.
- The primary `clean-up-tests` checkout and its unrelated changes were left untouched.
- The source/test candidate is committed locally and unpushed. This report and the replay-note update are documentation-only follow-ups; no source or SQL changed after the verified candidate. PR #388 is open at remote head `3ce7a6dbf662a9adc0eabb5789b19d5c9577952b`. GitHub reports its `checks` run succeeded on that older head; it does not verify this candidate. No PR, branch, deployment, release, or remote database changes were made.

## Review completion matrix

| Review requirement | Result and evidence |
| --- | --- |
| One candidate, latest base, no unrelated checkout work | Completed. The branch merges develop through `c7369b4f`; the local candidate includes the reviewed test, inventory, runner, migration, and documentation changes. The identity-test merge conflict now checks both league-specific draft identity and saved banner colors. The low-value layout metadata and mocked homepage-copy tests remain deleted per the original cleanup plan. |
| Expedition page extraction | Reviewed separately as a route-boundary refactor. The 282-line `ExpeditionsPageView` function body moved unchanged into a shared module; the Premier route supplies the Premier league and query parameter, and the Academy route imports the shared module and supplies Academy. The app no longer imports a shared view from another route entrypoint. The production build passed; the seven browser journeys do not directly exercise Expeditions. |
| Access and authorization journey | Passed. Password sessions, private reads, and staff-only mutation are exercised through the production app boundary; denied requests preserve state. |
| Betting | Passed. Admin resolution uses the ordinary signed-in server action, repeats resolution, and reads exact market, payout, ledger, and balance state; no service-role mutation is the behavior under test. |
| Auction | Passed. The two-captain journey checks the winner, price, budget change, persisted settlement, nomination turn, and ordinary duplicate-close behavior. |
| League/season isolation | Passed. The test combines a selected-league application read with Premier, Academy, and historical data; foreign rows stay hidden and the foreign-ID denial leaves state unchanged. |
| Match-draft realtime | Passed. Captains synchronize and reconnect; stale revisions and spectator actions fail, and persisted state is checked. |
| Season’s End recovery | Passed. A paid purchase starts through the signed-in UI, a deterministic local trigger interrupts after charge, the owner retries the same request, and another user replays that exact UUID through the normal boundary. Readback proves one opening/debit, five distinct owned copies, and unchanged foreign inventory/wallet state. |
| Season’s End commerce | Passed. Independently seeded sales/trades check exact owner and provenance; sale and dust ledger cardinality and resulting balances are asserted. |
| Assertion inventory and retained coverage | Completed. `docs/testing-inventory.csv` has 647 assertion-group rows across 644 paths. All 447 current test artifacts are mapped; there are no missing retained paths. Seven latest-base tests were added to the ledger. The six previously missing retained contracts were restored or moved, including safe redirect validation and league-scoped team identity. |
| Historical migration policy and replay | Passed locally. Both authorized historical blob transitions remain narrowly pinned; all current migrations replay on the isolated stack. One forward request-UUID ownership migration has matching pgTAP coverage. |
| Actual PR CI | Not verified for this candidate. PR #388’s successful `checks` run belongs to remote head `3ce7a6db`, while this candidate is newer and remains unpushed. |

The scenario assertions ran together with `npm run test:infra`; `npm run e2e:list` also found exactly seven Chromium tests in seven files.

## Reduction and maintenance evidence

The earlier cleanup summary recorded a baseline of 431 files, 59,642 lines, and 8,805 expectations. Re-scanning an archive of the plan’s recorded branch-start commit `ff20e8582c61e6a43600bfed0eb38bbcb67a5d5d` with the same `.test`/`.spec` source scan returns 453 files, 66,169 lines, 10,158 literal `expect()` calls, and 174 files with 498 `vi.mock()` calls. The earlier baseline numbers do not reproduce against that commit; the table below uses the reproducible archive scan.

| Measure | Start commit | Candidate | Change |
| --- | ---: | ---: | ---: |
| Source test files | 453 | 279 | −174 (38.4%) |
| Test lines | 66,169 | 48,011 | −18,158 (27.4%) |
| Literal `expect()` calls | 10,158 | 7,148 | −3,010 (29.6%) |
| Files containing `vi.mock()` | 174 | 109 | −65 (37.4%) |
| `vi.mock()` calls | 498 | 349 | −149 (29.9%) |

The 85–130 source-file target remains unmet by 149 files above its upper bound. The current 279 modules include 195 library tests for authorization and identity, league/season scoping, ingestion and settlement, wallet/ownership/idempotency, and distinct game/card rules; 28 app tests for server access and scoped data; 44 component tests for named client interactions; four hook tests; and eight script tests. They cost 48,011 lines and 109 mock-bearing files. Further reductions need a separate assertion-level review; merging modules to make the count smaller would hide that cost rather than remove it.

The browser specs fell from 13 cases in eight files (978 lines) to seven independent cases in seven files (753 lines). The fixture/support layer grew from six files / 733 lines to ten / 999 lines (+266 lines) to isolate local auth/database setup, request replay, and deterministic recovery. This work reduced journey duplication, but it did not reduce fixture-source lines. The final SQL suite has 159 files / 2,455 planned assertions; its grants, RLS, lifecycle, rollback, ownership, and money contracts remain at the database boundary.

## Verification record

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, 6.61 s. |
| `npm run lint` | Passed, 30.44 s; one pre-existing `@next/next/no-img-element` advisory remains in `src/components/captain/scouting/ChampionDatum.tsx`. |
| `npm test` | 279 files / 2,916 tests passed; Vitest 33.47 s, wall time 34.41 s. |
| `npm run test:python` | 25 passed, 0.79 s. |
| `npm run e2e:list` | Seven tests in seven files, 2.12 s. |
| `npm run test:infra` | Passed. Fresh staging read 247 migration source files and produced 244 versions; all 159 pgTAP files / 2,455 planned assertions passed; production build passed; seven Chromium journeys passed (Playwright reported 1.2 minutes). The runner stopped its isolated Supabase project and restored `tsconfig.json` and `next-env.d.ts`. |
| `node scripts/check-migrations.mjs c7369b4f7087ddf598a82f369d91623769b9e699 810fa7b46eb850d91acc6689c9e9e0c6aef77c11` | Passed. It emitted only the three pre-existing duplicate-version warnings for `20260915000001`, `20261005000001`, and `20261009000001`. |

The full `test:infra` wall time was not captured separately; its production build and all integration stages exited successfully. The intentional recovery interruption produced an expected local trigger error before owner retry passed.

## Migration and release notes

The two historical fixes are described in [the replay repair note](2026-09-27-historical-migration-replay-repair.md) and constrained to their exact reviewed Git blob pairs. No history repair was needed. Before the current read-only migration listing, `supabase/.temp/project-ref` was checked and matched FPL project `tyywoneobreracfnujdk`. The listing confirmed `20261028000001`, `20261029000001`, and `20261101000001` through `20261105000001` are applied. The latest site-search migration `20261106000001_site_search_log.sql` and candidate request-identity migration `20261106000002_season_end_request_identity.sql` were exercised only on the isolated local stack; no cloud SQL or DDL was executed.

The current tests do not cover a live OAuth provider, live Discord/Riot calls, every route, multiple browsers, or comprehensive accessibility. Required CI must run on the eventual proposed commit before the release workflow can use it; the green PR check on `3ce7a6db` is older evidence only.
