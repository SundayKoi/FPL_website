# Testing

## Choose checks by change

| Change | Verification |
| --- | --- |
| Markdown only | Review the diff, relative links, and any commands or factual claims changed. No application suite or build needed. |
| TypeScript or React | Focused regression coverage, then `npm run typecheck`, `npm run lint`, and `npm test`. |
| Python scripts | `npm run test:python`; no live Riot or Supabase credentials needed. |
| SQL or authorization | Matching pgTAP coverage via `npm run test:db`, plus relevant application tests. Follow [release contracts](releases.md) for migrations. |
| Realtime or multi-user flow | Relevant Playwright scenarios against local Supabase; cover reconnect/catch-up and separate users where affected. |
| Build, dependency, routing, or server/client boundary | `npm run build` in addition to the affected checks. |

Combine rows when a change crosses boundaries. Test observable behavior and
regressions; avoid tests that merely repeat implementation details. Once checks
pass, repeat them only for further edits or unresolved evidence. Report checks
that could not run and why; unavailable infrastructure is not a passing result.

Local edits and checks can proceed without approval at each step. Database and
browser tests write fixtures: confirm they target the local stack before running
them. Operational scripts and linked-database migration pushes have different
side effects and are not test commands.

CI runs TypeScript, ESLint, Vitest, and Python checks in its `checks` job,
and the pgTAP suite against a fresh local Postgres in its `database` job (see
[SQL](#sql)). Commands are defined in [package.json](../package.json); the
production build is `npm run build`.

## Vitest

`vitest.config.mts` discovers `.test.ts` and `.spec.ts` files in `src/lib`
and `scripts` in the Node project. Other `.test`/`.spec` TypeScript and TSX
files under `src` run in jsdom. Worktrees and Playwright specs are excluded;
scratch files outside these source directories are not collected.

```sh
npm test -- src/components/teams/AdminTeamEditor.test.tsx
npm test -- --project=node
npm test -- --project=dom
```

The jsdom setup in `src/test-utils/setup-dom.ts` unmounts rendered components
after every test. A test does not need its own `afterEach(cleanup)`. Keep an
explicit `cleanup()` in compound teardown when components must unmount before
fake timers, spies, or browser stubs are restored.

- Establish mock defaults in `beforeEach`, so a test can run alone.
- Pair `vi.useFakeTimers()` with `vi.useRealTimers()` in teardown.
- Pair `vi.spyOn()` with `vi.restoreAllMocks()` or the spy's `mockRestore()`.
- Use `vi.stubGlobal()` / `vi.unstubAllGlobals()` for browser and fetch mocks.
- Use `vi.stubEnv()` / `vi.unstubAllEnvs()` for environment changes. Passing
  `undefined` simulates an absent variable without losing its original value.
- Wait for the expected result, not merely an element that already exists.
  For example, use `waitFor(() => expect(status.textContent).toContain(...))`
  when a status element first displays a saving message.
- Keep query mocks specific enough to prove filtering, permissions, and
  pagination. `src/test-utils/supabaseQuery.ts` is available for simple query
  chains; a paging test still needs a mock that actually slices its rows.

Avoid global mock resets or browser-error suppression that can hide test
dependencies or failures. Keep domain fixtures and expected outcomes next to
the tests when their differences are part of the behavior being checked.

## Python

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install requests python-dotenv
npm run test:python
```

Both `scripts/test_*.py` modules use standard-library unittest discovery.
The mapper module adapts its existing function tests through `load_tests`,
so all groups run even if an earlier group fails. Successful test output is
buffered; failures retain their diagnostic output. These tests mock HTTP
requests and do not need Riot credentials or a Supabase connection.

## SQL

The database under test is built from the staged fresh-database project,
not from `supabase/` directly: two immutable migrations cannot run on an
empty database as written, and the migration wrapper stages reviewed
replacements for them (see the
[README](../README.md#ci-and-what-vercel-builds)).

```sh
npm run db:stage                                   # writes supabase/.staged
npx supabase start --workdir supabase/.staged      # or `db start` for Postgres only
npm run test:db
```

`npm run db:stage` runs
`node scripts/supabase-migrations.mjs stage supabase/.staged --fresh`. It
writes the config, edge functions, staged migrations, and the numbered
`supabase/tests/[0-9]*_test.sql` files with their helpers, leaving out the
operational SQL scripts in the same directory. `npm run test:db` restages
(so edited tests are picked up) and runs
`supabase test db --workdir supabase/.staged`. It does not reapply
migrations; after adding or changing one, restage and run
`npx supabase db reset --workdir supabase/.staged` first. A new volume
applies every staged migration and fails on the first that errors. The CI
`database` job relies on that: it runs
`npx supabase db start --workdir supabase/.staged`, then `npm run test:db`.
Shared SQL fixtures live in `supabase/tests/helpers/*.sql.inc` and are
included inside each transaction.

Every test file declares a plan, calls `finish()`, and rolls back its
transaction. Give fixtures test-specific names, supply required columns,
and keep permission and state-transition assertions intact. Missing RPCs,
columns, or views indicate a schema prerequisite to investigate, not a
reason to skip an assertion or mark a migration applied.

## Playwright

Start local Supabase from the staged project (`npm run db:stage`, then
`npx supabase start --workdir supabase/.staged`). Playwright expects the app at
`http://localhost:3000` and starts `npm run dev` if needed. No manual demo seed
is required.

`npm run e2e` uses one worker against the local app and database. Auction,
betting, and FPL'dle specs seed their scenarios through `e2e/fixtures.ts`;
the color-system spec inspects the app without seeding. The same helper
provides dev sign-in and two isolated captain contexts that close even on
failure. Keep the worker count at one because the scenarios share the local
database. `npm run e2e -- --list` checks discovery without starting the app.
