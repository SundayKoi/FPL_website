# Code review and performance cleanup — October 1, 2026

## Scope and method

Reviewed the current `develop` baseline, `cbc9d4b0`, in an isolated checkout. The
existing `clean-up-tests` checkout and its uncommitted work were preserved.
Inventoried routes, client components, libraries, scripts, and import paths;
then traced the homepage, authentication/header, collections, pack opening,
Season's End scoring, and their server/database boundaries. Also inspected
staff access, commerce actions, offseason queries/actions, pagination,
realtime subscriptions, and the existing performance audit.

Implementation followed the installed Next.js documentation and the repository's
backend/testing contracts. The review prioritized repeated work and unnecessary
network round trips while retaining server authorization, league/season scope,
atomic commerce RPCs, frozen card data, and meaningful regression coverage.
This is a broad static review with targeted execution, not an assertion that
every source line or every production workload was profiled.

## Findings fixed

| Finding | Change and effect |
| --- | --- |
| Season's End repeatedly rebuilt and scanned each role's metric distributions for every observation | Build tied midrank indexes once per role/metric, then look up scores. Replace repeated team-game searches with an index. Keep the same formula, coverage rules, and tie handling. |
| Grouping copied the growing group's array on every append | Append into locally owned arrays in season scoring, pair art, and collection print grouping. Caller inputs and frozen card records stay unchanged. |
| The global header initialized a wallet and invoked `grant_signup_bonus` on ordinary signed-in page views | Use a read-only wallet display path, scoped to the authenticated user's Discord identity. Hide the balance when no wallet exists. Spending/claim paths still initialize through the original idempotent RPC. Profile and membership reads run concurrently. |
| Concurrent membership checks could duplicate a cold Discord request | Share pending membership reads by guild and user. Preserve the existing 60-second cache, five-second timeout, and inconclusive-response/access policy. |
| Concurrent skin catalog/art requests could duplicate CDN work | Share pending catalog reads by resolved champion ID and art probes by URL. Clear completed pending entries; retain successful catalog caching and Next.js fetch revalidation. |
| Temporary HTTP errors were cached as permanently missing card art | Cache explicit 403/404 results and successful probes. Retry rate limits, server errors, and network failures on a later request. |
| Homepage Twitch requests waited for unrelated panels to finish | Start settings-dependent Twitch work while awards, standings, cards, and other panels load. Premier starts that work before its season lookup; Academy reuses its server client for cards. Read standings fixtures and game durations concurrently. |
| Collection grouping and sorting reran on unrelated selection/dialog state changes | Extract shelf construction and memoize finder results, weeks, counts, pinned IDs, collapsed entries, and sorted copy views. Retain copy IDs, print runs, edition order, and Eclipse/signed/alternate print separation. |
| The root layout preloaded decorative card fonts on every route and duplicated its navigation tree | Disable preloading for Cinzel, Bangers, and Pinyon Script while retaining their CSS variables and font availability. Share the layout content and stream the auth slot independently through Suspense. Staff navigation still uses a server-side staff lookup. |
| Homepage awards maintained a second pagination loop that silently returned partial data at its page cap | Reuse `fetchAllPages` with the existing 40-page cap, season/team predicates, and primary-key ordering. Later-page errors and the cap now reject an incomplete dataset. |
| Small identity helpers pulled in the full card-building module | Import `cardPlayerKey` directly from its existing small module in season derivation and pair art. |

Regression tests cover percentile ties/invalid coverage, read-only wallet access
and missing wallets, membership request sharing and guild/user isolation, CDN
request sharing and retries, incomplete pagination, and collection copy/print
preservation. Existing monetary, ownership, access, and isolation tests remain.

## Scoring measurements

Compared `deriveSeasonEnd` from the baseline with the revised implementation on
the same local Node.js process. Synthetic inputs contain two five-player teams,
five roles, repeated/tied metric values, and 6, 30, 100, or 300 games. Timings
are the median of five invocations per implementation and input size.

| Stat rows | Before | After | Ratio |
| ---: | ---: | ---: | ---: |
| 60 | 1.56 ms | 1.40 ms | 1.1× |
| 300 | 7.27 ms | 5.00 ms | 1.5× |
| 1,000 | 41.19 ms | 15.24 ms | 2.7× |
| 3,000 | 298.26 ms | 48.08 ms | 6.2× |

Full derived outputs matched the baseline across 28 scenarios: each size plus
missing KDA, an invalid date, ambiguous roles, a duplicate observation, a
normalized team-name variant, and all metrics tied. Unmodified caller inputs
were also checked. These numbers measure isolated computation, not production
page-load time or Core Web Vitals.

The concurrency regressions also demonstrate that five simultaneous requests
for the same guild member make one upstream request, and five simultaneous
requests for a print missing its centered crop make two probes total (one per
directory).

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; one existing raw-image warning in `ChampionDatum.tsx` |
| `npm test` | 292 files / 2,927 tests passed |
| `npm run test:python` | 52 tests passed |
| `npm run test:infra` | 161 SQL files / 2,493 pgTAP assertions passed, production build passed, and all seven browser journeys passed |
| `git diff --check` | Passed |

The infrastructure runner replays the ordered migration history into a
disposable local Supabase project. Its browser journeys exercise server access,
betting settlement, the auction draft, Premier/Academy/historical isolation,
match-draft synchronization, interrupted paid-opening recovery, and Season's End
ownership/provenance/balances through commerce. The recovery journey deliberately
injects a fulfillment/refund failure, so its diagnostic logs are expected.

No migrations, dependencies, cloud credentials, cloud database data, or
deployment settings changed. This work targets `develop`; production operations
were outside this review.

## Remaining observations

- Production traffic traces and Core Web Vitals were unavailable. The homepage,
  collection, and font changes remove identifiable work, but their end-user
  latency benefit should be measured after a release.
- Vault provenance remains one read per found Eclipse, currently a deliberately
  small dataset. If that cohort grows, batch provenance by inventory ID while
  preserving the trusted server boundary and complete ordered chains.
- Identity-claim roster discovery uses one authoritative RPC per active team.
  A future batched RPC needs a forward migration and matching SQL coverage for
  exact league/season scope and ambiguous roster matches; ordinary public reads
  cannot substitute for those authorization checks.
- `ScheduleManagementDrawer` currently has no live production importer, but its
  context is referenced by active staff editors and its tests protect discard
  decisions. Retiring that workflow should follow an explicit decision about
  where unsaved-edit protection belongs.
- The existing `ChampionDatum.tsx` image warning remains. Optimizing that remote
  image requires choosing an image loader/cache configuration and validating
  the scouting UI; this review did not introduce a new image policy.
