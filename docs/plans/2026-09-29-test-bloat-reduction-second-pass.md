# Test-bloat reduction: second-pass completion report

Prepared 2026-09-29 against the current `develop` head. This report records the
scoped remainder from the execution plan; it does not import the dirty primary
checkout.

## Scope and result

The candidate is based on `develop` commit
`7d46e6aca4713bcbc8a7ce4dda4147071a8ef6b6` (tree
`9213e847dd4fff30efe9983e5c5f6d66c4f26872`). The implementation commit is
`435bba30e9372f2e9cf24ab8b71114691266c237` (tree
`cffd1a42aa01bd466fa83892b729deb259e0a840`). The candidate changes test code,
test guidance, the inventory, and a read-only metrics script. It does not change
application behavior or historical migrations.

The requested 85–130 source-module goal remains unmet: **279 modules remain, 149
above the upper bound**. That count is not manufactured through suite
consolidation. The current `docs/testing-inventory.csv` enumerates all 279
source modules that still exist under `src/` and `scripts/`, with each module's
failure contract, disposition, layer, and exact replacement reference where
applicable. A reconciliation check found no unmapped current module and no
current module lacking a retained disposition.

`develop` gained 13 source modules after the first-pass candidate (279 to 292);
this pass removes 13 from the current suite. The retained 279 comprise 30 app,
42 component, 4 hook, 195 library, and 8 script modules. This pass also reduces
the two large mixed component suites, and replaces a mocked patron-view query
assertion with database coverage. Compared with the previous first-pass commit,
the module count stays at 279 while test lines drop by 886, literal `expect`
calls by 233, and `vi.mock` calls by 5. The new modules added to `develop` since
the first pass were audited individually; owner access, paired league/season
scope, bracket outcomes, stream-aware anchor navigation, legacy routes, and
unsaved schedule-edit protection remain covered.

## Reproducible measurements

Run:

```sh
python3 scripts/measure-test-suite.py \
  ff20e8582c61e6a43600bfed0eb38bbcb67a5d5d \
  810fa7b46eb850d91acc6689c9e9e0c6aef77c11 \
  7d46e6aca4713bcbc8a7ce4dda4147071a8ef6b6 \
  435bba30e9372f2e9cf24ab8b71114691266c237
```

The machine-readable output is [2026-09-29-test-bloat-reduction-second-pass-metrics.json](2026-09-29-test-bloat-reduction-second-pass-metrics.json).
Counts use committed `git archive` trees. Source modules are `.test.ts`,
`.test.tsx`, `.spec.ts`, and `.spec.tsx` files in `src/` and `scripts/`; test
lines are `splitlines()` counts; literal assertions match `\bexpect\s*\(`;
mock files and calls match `\bvi\.mock\s*\(`. Playwright specs, their support
files, Python tests, and numbered pgTAP files are counted separately.

| Snapshot | Source modules | Test lines | `expect(` | Files with `vi.mock` | `vi.mock(` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original baseline `ff20e85` | 453 | 66,169 | 10,158 | 174 | 498 |
| First-pass candidate `810fa7b` | 279 | 48,011 | 7,148 | 109 | 349 |
| Current `develop` base `7d46e6a` | 292 | 48,460 | 7,217 | 114 | 355 |
| Second-pass candidate `435bba3` | 279 | 47,125 | 6,915 | 108 | 344 |

Relative to the original baseline, the candidate removes 174 modules (38.4%),
19,044 lines (28.8%), 3,243 literal assertions (31.9%), 66 mock-bearing files
(37.9%), and 154 mock calls (30.9%). Relative to the current base, it removes
13 modules, 1,335 lines, 302 literal assertions, 6 mock-bearing files, and 11
mock calls.

Playwright remains at seven independently seeded journeys in seven files. The
candidate retains ten support files and 999 support lines, unchanged from the
current base; no browser scenario was added to replace a removed component
assertion. Python support remains two test modules and 1,704 lines. The database
suite grows from 159 files / 2,455 planned assertions to 160 / 2,457 for the
public patron view replacement.

## Audit decisions and retained exceptions

The removed source modules cover static staff search-summary output, static
economy-page anchors, mock-only auction board loading/layout, an action-level
sign-out mock duplicated by the real access journey, trivial tier-label
formatting, a shortcut helper duplicated by its consumer, direct realtime
status-string mapping, and static navigation/site-directory link catalogs.
The inventory gives a path-by-path disposition and replacement evidence.

The test for `ActivePatrons` checked a mocked table name and select string,
which could not establish the actual view's grants or columns. The replacement
`supabase/tests/0137_public_patron_view_test.sql` checks anonymous `SELECT`
privilege and the exact public projection (`username`, `avatar_url`,
`patron_until`, `patron_flame`). It passed on a fresh disposable replay before
the mocked suite was removed.

The two largest UI suites still protect unique action boundaries. After
removing 16 empty-state/copy/visual cases, `ExpeditionBoard.test.tsx` remains
1,959 lines for exact launch/reveal/claim payloads, selection limits, insurance
and loss consent, one-of-one ownership, paid actions, recovery, and known-place
privacy. After removing 14 image/layout/overlay-sizing cases,
`MatchDraftBoard.test.tsx` remains 824 lines for turn and side rules, persisted
deadlines and clock-skew retries, ready/finalization behavior, ban-pass
confirmation, winner flow, and token-checked lobby RPC routing. The lower layers
do not replace those client decisions. Other retained high-cost examples
include `src/lib/expeditions/runs.test.ts` (1,779 lines / 230 assertions),
`src/lib/expeditions/routes.test.ts` (1,497 / 441), and
`src/lib/packs/open.test.ts` (1,039 / 156 / 17 mocked calls); they cover state,
ownership, payment, retries, and exact-once outcomes. The CSV is the complete
retained module/contract enumeration, rather than this short list of examples.

## Dirty primary checkout accounting

The primary checkout remained untouched at 440 status entries. Comparing its
test and test-policy paths with the same `origin/develop` base found 230 changed
paths: 189 were already absent from `develop` or had working-tree contents
identical to `develop`; 8 were local deletions of files still present in the
base; and 33 had content differences. Four of those eight low-risk navigation
deletions were independently reviewed and made here (`SiteNavigation`,
`CardsTabs`, `HomeOrientation`, and the site directory). The other four
(`SiteSearch`, `CompareClient`, `RegularSeasonHomePage`, and card-section path
mapping) remain in the candidate because they cover search interaction,
incorrect comparison data, home data/viewer binding, or paired-league paths.
The 33 content-different paths remain in the primary checkout because they are
coupled to broader UI/data/runner changes or their intent is uncertain. No
primary-checkout files or untracked artifacts were copied.

## Verification

Environment: macOS 15.6.1 arm64, Node 22.23.2, npm 10.9.8, Next.js 16.3.0,
Vitest 4.1.10. A pre-edit `npm test` on the base passed 2,947 tests across 292
files in 39.79 seconds.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; 26.7 seconds. |
| `npm run lint` | Passed with one pre-existing `ChampionDatum.tsx` `<img>` warning; the unused-import warning introduced during pruning was fixed. |
| `npm test` | Passed: 279 files, 2,851 tests; Vitest duration 34.29 seconds. |
| `npm run test:python` | Passed: 25 tests (0.005 seconds in unittest; command completed in 0.37 seconds). |
| `npm run e2e:list` | Passed: seven tests in seven files; 0.73 seconds. |
| `npm run test:db` | Passed on a fresh disposable replay before removing the mocked patron test. |
| `npm run test:infra` | Passed: 247 source migrations staged to 244 versions; pgTAP, production build, and all seven Chromium journeys passed; approximately 116 seconds end to end. |
| `node scripts/check-migrations.mjs 7d46e6aca4713bcbc8a7ce4dda4147071a8ef6b6 435bba30e9372f2e9cf24ab8b71114691266c237` | Passed. It reported three pre-existing duplicate migration-version warnings; no migration changed in this candidate. |

The infrastructure runner used only its isolated local Supabase project and
removed it after the run. It restored the temporary Next.js type-path edits to
`tsconfig.json` and `next-env.d.ts`. No cloud migration, deployment, or
production operation was performed.

The commit above is the measured test-source tree. The report and JSON are
added in a documentation-only follow-up; they do not change the measured test,
runner, or SQL files. PR and post-merge CI results are recorded in the final
task update after the normal protected workflow completes.
