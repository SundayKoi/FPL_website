# Academy scouting champion attribution: diagnosis and implementation handoff

Date: 2026-09-07. Scope: diagnosis and plan only; application code and database were not changed.

## Finding and confidence

A reproducible read-path defect can assign one ingested champion to two current roster players. The source-selection decision is made per player across the entire selected scope, rather than per game/participant. A player with no matched Riot rows falls back to draft attribution, including an inference from their current roster role. That inference can contradict the actual participant recorded by Riot.

This is confirmed with a synthetic Academy reproduction against the current working tree. No specific production player/game was supplied or inspected, so do not claim this is the verified cause of every reported live mismatch. The logic is shared with Premier; Academy is not its exclusive exposure.

### Evidence

- `scripts/riot_stats_ingest.py:744-757`: summoner name, tag and champion come from the same Riot participant object. There is no champion-to-roster-position join here. This does not establish that every historical database row is correct.
- `src/app/my-team/scouting/view.tsx:35`: the scouting roster forwards draft-player identity, role and OP.GG URL. The separate `riotAccounts` returned by `fetchMyRoster` are not forwarded as structured account evidence.
- `src/lib/scouting/inhouse.ts:141-147`: exact known Riot IDs are checked; unknown tags are rejected for players with account metadata, while players without metadata can match by bare name. Missing/stale account metadata can therefore either omit a player or admit an unrelated namesake. Ambiguity is checked only within the selected roster.
- `src/lib/scouting/inhouse.ts:162-164`: unmatched raw participants are discarded. Downstream cannot distinguish an ingested game with an unresolved participant from missing ingestion.
- `src/lib/scouting/derive.ts:218-234`: any matched rows cause the player's entire pool to use ingestion; zero matched rows cause it to use draft fallback. Mixed coverage can both lose valid draft-only games and falsely credit games to another player.
- `src/lib/scouting/derive.ts:160-169`: fallback uses a current roster role and draft role assignment as player evidence. A draft role identifies a lane/champion, not which human occupied it. Also, an exact `playerName` match returns before the side check, allowing an opposing-side namesake through.
- `src/lib/scouting/derive.test.ts:324`: the existing partial-ingestion test explicitly expects per-player fallback, but does not exercise contradictory ownership of the same game/champion.

### Reproduction (executed successfully)

Construct a `ScoutSource` for A1 with fixture `f1`, game 1, blue team `Academy Team`:

| Input | Value |
| --- | --- |
| Current roster | `top`: Academy Top, role top; `mid`: Academy Mid, role mid |
| Ingested participant | match `m1`, Academy Top#NA1, champion Ahri, linked to f1/game 1 |
| Draft pick | Blue pick 1 Ahri, no playerName |
| Draft role assignment | Ahri at blue mid |
| Scope | season |

Call `buildIngestedScoutingGames`, then `deriveScoutData(source, "season")`. Actual output: Academy Top **and** Academy Mid each receive Ahri ×1 and one sampled game. Expected: only Academy Top receives this ingested Ahri. Academy Mid has no verified participation. This models a role swap or missing/unresolved participant; the logic does not need a malformed champion asset to fail.

## Implementation tasks, in order

### 1. Pin the regression and inspect one affected live example when available

Add the reproduction to `src/lib/scouting/derive.test.ts` with an assertion that the champion belongs only to the ingested participant. Add the explicit-name/opposing-side case. Make the tests fail before changing the implementation.

For a supplied live example, read only the relevant A1 raw rows, report/game-to-fixture mapping, draft actions/positions, current roster and account metadata. Compare full `summoner_name#tag`, `match_id`, champion, team side and roster identity through every stage. Include legacy S5 rows mapped to Academy fixtures. Record whether the error is present in raw data, identity matching, fallback, or the final UI. Do not infer identities from role or champion. Do not perform bulk renames or reingestion as a speculative repair.

### 2. Preserve ingestion coverage independently of successful roster matching

Update `src/lib/scouting/inhouse.ts`, `queries.ts`, `types.ts`, and their callers/tests to return both matched participant rows and game coverage. Use a named DTO such as `{ games, coverage }`; update all callers found with `rg`, including other scouting consumers.

Coverage must retain match ID, resolved fixture/game reference, side, raw participant identity and champion for relevant ingested games, even when no current roster player matches. Do not derive coverage solely from `games`, since that repeats the current information loss. Keep unavailable/query-failed ingestion distinguishable from a successful empty read. Preserve existing pagination and legacy Academy season/report resolution.

Do not silently map multiple reports to an arbitrary fixture/game if their references conflict. Represent an ambiguous reference as unresolved. Use raw match ID as the primary game identity and a verified fixture ID/game number bridge when combining draft evidence.

### 3. Resolve attribution per game before aggregating player pools

Extract a small pure resolver from `deriveScoutData` rather than adding more nested per-player conditions:

1. Establish eligible games for the selected league and scope once, and reuse that set for every player and source. Preserve existing scope behavior unless a test explicitly documents a necessary correction; do not expand this fix into a scope redesign.
2. Within each game, accept uniquely resolved Riot participant-to-player identity as authoritative. Deduplicate identical participant rows; conflicting participant/champion identities must remain unresolved rather than inflate counts.
3. When relevant Riot coverage exists, do not assign an unresolved participant's champion to someone based on their current role or draft name. A matched Riot owner always defeats conflicting draft attribution, including explicit names.
4. For games without Riot coverage, allow an unambiguous explicit draft player identity only after verifying the action belongs to the scouted side and fixture scope. Reject skipped actions. Do not use current roster role alone as proof of historical participation; retain role assignment for draft visualization and role statistics.
5. Merge accepted game-level records, then aggregate by player ID and normalized champion. A player can retain valid draft-only games alongside ingested games. Never count the same game/participant twice.

Avoid the superficial patch `if (ingestedGames) disable all draft fallback`: that would discard legitimate draft-only games and would not address unresolved identity or partial coverage.

### 4. Make identity gaps explicit without weakening tag checks

Keep exact full Riot ID matching and existing ambiguity rejection. Do not solve missing accounts by universally stripping tags or adding speculative aliases.

Review `fetchMyRoster`, `resolvePlayerOpggUrl`, and `scoutingRoster` for confirmed player/account relationships. Forward structured account pairs when a unique player association is actually established. Team membership alone is insufficient to associate each of several team accounts with a specific draft player. If current schema/data cannot prove that association, keep it unresolved and report the gap; do not invent a join by array position or role. Fix verified stale account metadata separately from the attribution algorithm.

An optional diagnostic count should distinguish matched, unmatched and ambiguous participants so a successful query with identity gaps does not masquerade as no games. Keep sensitive account/admin details out of public payloads.

### 5. Reflect evidence accurately in the UI

Update `ScoutPlayerPools.tsx` and `OpponentScout` tests as needed so users can distinguish Riot-confirmed picks, draft-only picks, and unresolved/no attributed participation. Current role labels can remain roster labels but must not imply a historical role was verified. Keep unknown participants unattributed. Do not populate past-draft player names from roster slot order.

Preserve unrelated in-house aggregation behavior; its name-only identity model is a separate path and should not be silently rewritten as part of this fix.

## Regression matrix

- The reproduced A1 role-swap/conflicting-champion case credits only the Riot owner.
- A substitute/unmatched participant's champion is not credited to the current starter.
- Conflicting explicit draft name loses to Riot ownership for the same game.
- An opposing-side namesake is rejected before name matching.
- Exact full Riot ID selects the correct player; wrong tag, duplicate account ownership and ambiguous names stay unresolved.
- One player with both ingested and draft-only games gets both exactly once.
- Duplicate rows do not inflate champion counts; unresolved fixture/game bridges do not suppress unrelated draft games.
- Successful empty ingestion, partial participant coverage and failed ingestion have distinct behavior.
- Legacy S5 Academy rows still resolve to A1; Premier rows do not leak into Academy.
- Recent/season/all scopes apply consistently to accepted attribution; pagination remains covered.
- UI displays corrected ownership and empty/unresolved states with stable player-ID-based keys where available.

## Verification and rollout

Start with `npx vitest run src/lib/scouting/inhouse.test.ts src/lib/scouting/derive.test.ts src/lib/scouting/queries.test.ts`, then relevant roster, scouting route and `OpponentScout` component tests. Run `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build`. Verify the actual Academy scouting page for an affected game and a Premier control when authenticated access is available. Follow repository browser verification skills if starting a dev server.

No database schema change is required for the initial read-path correction. If a subsequently verified identity repair requires schema/RPC changes, read `docs/backend.md`, add a forward migration and matching pgTAP coverage, retain user-scoped clients/RLS, and run `npm run test:db`. Do not edit applied migrations or introduce service-role reads into normal scouting.

The working tree already contains extensive unrelated changes, including scouting/roster/UI work. Re-read `git diff` before implementing and preserve that work. Read AGENTS.md, README.md and the relevant installed Next.js documentation before coding. Deliver a focused diff and explain any baseline check failures separately from new regressions.

Acceptance: every displayed ingested champion belongs to the uniquely resolved participant for that game, no role inference contradicts Riot ownership, and legitimate draft-only evidence survives without double counting. A production data backfill is unnecessary if raw participant rows are correct; verify before proposing one.

## Diagnosis validation

The existing three scouting suites passed: 43 tests. The synthetic reproduction above returned the incorrect double attribution against unchanged application code. Full `npm test` passed: 360 files, 2,980 tests. `npm run lint` passed with one existing `no-img-element` warning in `ChampionDatum.tsx`. `npm run build` failed because the sandbox denied Turbopack's local port binding during CSS processing (`Operation not permitted`); production-build verification remains outstanding. No database changes were made, so pgTAP was not run for this documentation handoff.
