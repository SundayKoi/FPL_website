# Performance and cleanup audit — September 5, 2026

## Scope

Inventoried application routes, components, libraries, scripts, the edge function,
and database migrations (about 833 source files before cleanup). Traced imports
to identify unused production modules and inspected query fan-out, repeated
sorting/filtering, allocation inside loops, timers, client bundles, and test
configuration. Detailed review focused on stats, card generation and reads,
search, Premium preview, scouting, realtime, and scheduled ingestion.

This is a repository audit with local measurements, not a production load test
or a claim that every line was manually reviewed. No database schema, grants,
RLS policies, pricing, scoring weights, or settlement rules were changed.

## Applied changes

| Area | Problem | Change |
| --- | --- | --- |
| Power rankings | Sorted the same role/stat cohort repeatedly for every player | Build role groups and percentile indexes once; preserve stable tie ordering and identity behavior |
| Card generation | Repeated cohort scans for each player's percentile metrics | Share lazily built metric indexes within one build; retain midrank ties and malformed-stat behavior |
| Card reads | Large seasons could stop at the API's row limit | Paginate aggregate, raw-game, and game-log reads with deterministic ordering and propagate failures |
| Weekly reads | Fetched whole-season logs and moments for one week | Apply date/week predicates in the database query |
| Stats interface | Initial client dependency graph included every tab | Defer secondary tabs and player details; retain an eager default leaderboard |
| Search | Re-normalized every indexed label on each keystroke; sequential league team queries | Prepare normalized search entries once per index; batch both leagues' teams; paginate player identities |
| Independent reads | Serial requests in stats tabs and Premium preview | Overlap independent reads while preserving dependent operations |
| Countdown | Updated React state four times per second and kept polling after expiry | Update displayed seconds only and stop the timer at expiry; retain 250 ms expiry checks |
| Local grouping | Copied a growing array for every appended row | Append into locally owned groups in weekly cards, auto-dust, and scouting |
| Test runtime | Pure library/script tests initialized a DOM | Separate Node and jsdom Vitest projects |

The shared pagination helper rejects later-page errors and its page-limit guard
instead of returning plausible partial data. Existing user-scoped Supabase
clients and service-role boundaries remain in place.

Removed four production components with no live import paths:
`AdminBriefEditor`, `Announcements`, `CaptainGate`, and `WeeklyStandouts`.
Removed their orphaned helpers and retired weekly-ranking pipeline. Kept weekly
aggregation used by the current homepage. Also removed historical commented-out
formula code.

Removed tests for the retired standouts pipeline, a source-text test checking for
an already-deleted page toggle, stale mocks, and a redundant SQL-band assertion.
Kept behavioral, authorization, financial, and cross-language contract coverage.
Added regressions for pagination beyond 1,000 rows, later-page failures, weekly
query predicates, search batching, stable ranking ties, and countdown renders.

## Measurements

Local synthetic comparisons used the original implementation from Git and the
updated code with identical inputs. Full ranking/card outputs and unchanged
inputs were checked across eight cohort sizes; card checks also included
malformed stats. These are isolated computation timings, not page-load timings.

| Workload | Before | After |
| --- | ---: | ---: |
| Rank 60 players | 0.47 ms | 0.20 ms |
| Rank 200 players | 6.41 ms | 0.72 ms |
| Rank 1,000 players | 202.27 ms | 4.01 ms |
| Generate 60 cards | 2.73 ms | 2.15 ms |
| Generate 200 cards | 14.42 ms | 7.16 ms |
| Generate 1,000 cards | 265.21 ms | 58.44 ms |

The Webpack client-reference manifest's initial StatsTabs JavaScript chunks fell
from 323,361 to 291,144 bytes (86,387 to 78,882 gzip bytes). This measures those
component chunks, not the entire page; deferred tabs download when needed.

The full Vitest run fell from roughly 85 seconds to 51 seconds. Test counts and
machine load differed between runs, so this is directional evidence rather than
a controlled benchmark. The final suite contains 347 files and 2,926 tests.

## Verification and remaining limitations

- All 347 Vitest files / 2,926 tests passed, including the new regressions.
- TypeScript check passed.
- ESLint passed with one existing raw-image warning in `ChampionDatum.tsx`.
- Production Webpack build passed (`npm run build -- --webpack`). The standard
  Turbopack build still fails in this host environment while its worker tries
  to bind a port (`Operation not permitted`), including after an escalation.
- Python ingestion assertions passed using a temporary environment containing
  `requests`; repository dependency files were not changed.
- Browser smoke checks against the production build passed for the leaderboard,
  deferred Champions and Players tabs, player details, and indexed player search.
  No browser warning/error logs were returned during these checks.
- `npm run test:db` ran but failed against the existing local database: newer
  schema objects are missing, including `card_provenance`, `card_listings`,
  `showdown_tables`, `card_auto_dust`, and `forfeit_team_id`. Existing data was
  not reset or migrated for this audit. The full database suite still needs a
  database with the repository migrations applied.
- Full seeded Playwright workflows were not rerun for this pass; the browser
  smoke checks above cover the changed public navigation paths.

Preserved bounded small-card simulation loops, ordered ingestion/settlement
writes, and retry/CAS behavior where parallelism could change correctness.
Realtime and pointer-animation paths already using focused subscriptions or
animation-frame DOM updates were retained. Database index changes require
representative query plans and production cardinalities; no speculative indexes
were added. Remaining per-card cohort totals still do some repeated scanning,
so generation is not entirely linear despite the measured improvement.
