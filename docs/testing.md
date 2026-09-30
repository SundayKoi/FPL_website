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

CI runs migration-history validation, typecheck, ESLint, Vitest, and Python
checks in the required `checks` job. The same job runs `npm run test:infra`,
which replays migrations on a disposable local stack, runs pgTAP, builds the
production app, and runs the Chromium journeys. Commands are defined in
[package.json](../package.json).

## Vitest

`vitest.config.mts` discovers `.test.ts` and `.spec.ts` files in `src/lib`
and `scripts` in the Node project. Other `.test`/`.spec` TypeScript and TSX
files under `src` run in jsdom. Worktrees and Playwright specs are excluded;
scratch files outside these source directories are not collected.

```sh
npm test -- src/lib/teams/identity.test.ts
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
not from `supabase/` directly: one immutable data-repair migration cannot
run on an empty database as written, and the migration wrapper stages a
reviewed stand-down for it (see the
[README](../README.md#ci-and-what-vercel-builds)).

```sh
npm run test:db                                    # isolated fresh replay + pgTAP
npm run db:stage                                   # optional manual project at supabase/.staged
npx supabase start --workdir supabase/.staged      # for manual database work
npx supabase test db --workdir supabase/.staged
```

`npm run db:stage` runs
`node scripts/supabase-migrations.mjs stage supabase/.staged --fresh`. It
writes the config, edge functions, staged migrations, and numbered pgTAP
files with their helpers, leaving out operational SQL scripts. This staged
project is useful for manual database work. For verification, `npm run
test:db` creates a fresh disposable local Supabase project, stages the
reviewed migration collisions and fresh-only stand-down, replays the full
history, and runs every numbered pgTAP contract in one command. It uses unique loopback ports and
project identity, rejects ambient Supabase credential overrides, and cleans
only the project it started. It does not read or rewrite `.env.local` or the
cloud CLI link. Shared SQL fixtures live in
`supabase/tests/helpers/*.sql.inc` and are included inside each transaction.

Every test file declares a plan, calls `finish()`, and rolls back its
transaction. Give fixtures test-specific names, supply required columns,
and keep permission and state-transition assertions intact. Missing RPCs,
columns, or views indicate a schema prerequisite to investigate, not a
reason to skip an assertion or mark a migration applied.

## Playwright and infrastructure runner

`npm run e2e` creates an isolated local Supabase project, replays migrations,
builds the production app with that stack's local URL and keys, starts
`next start` on a free local port, and runs Chromium. It needs Docker and the
Chromium browser installed. It creates no demo data and does not use an
existing app server or edit `.env.local`. The stack and isolated build directory
are removed on success or failure. Ambient Supabase settings cause an early
failure so fixtures cannot write to a linked or mixed database.

The full command `npm run test:infra` adds the entire pgTAP suite against that
freshly replayed database before the production build and browser run. CI
runs this command inside the existing required `checks` job. Use
`npm run test:db` for fresh replay plus pgTAP without the build/browser step.
`npm run e2e:list` checks Playwright discovery only; it does not prove any
journey passes.

The seven independently seeded journey groups cover:

- password session persistence, sign-out, private-data denial, and authorized
  staff access;
- Premier, Academy, and historical-season row isolation;
- auction bid propagation and reconnect catch-up;
- match-draft propagation, stale-write rejection, and spectator denial;
- persisted betting results, wallet balances, and duplicate-resolution safety;
- recovery of a durable pending Season's End purchase; and
- Season's End sale, copy trade, and dust outcomes with persisted ownership and
  wallet readback.

The suite uses one worker so fixtures remain deterministic. Test setup may use
service credentials to create and inspect fixtures; browser actions exercise
the ordinary user's server and database boundary. Live Discord, Riot, and
OAuth-provider behavior is not exercised.
