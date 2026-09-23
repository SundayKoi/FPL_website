# Expeditions, the next level — implementation plan

**Spec:** `docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md`
**Branch:** `claude/playoff-card-printing-z4cud3` (from `develop`). One PR per phase.
**Stack:** Next.js 16 (read `node_modules/next/dist/docs/` first), Supabase (RLS, security-definer RPCs), pgTAP, Vitest (node for `src/lib/**`, jsdom for components), Playwright (Chromium at `/opt/pw-browsers/chromium`).

## Global constraints (every phase)

- Never edit an existing migration. New versions `20261026000001`…`20261030000001`; pgTAP tests `0130`…`0134`. Run `node scripts/check-migrations.mjs <base> HEAD`.
- Redeclaring `launch_expedition` (Phase 3 only) copies the 12-argument body from `supabase/migrations/20261020000001_on_air_card.sql` lines 141–319 verbatim, then applies the two named edits. `resolve_expedition` (`20261015000001`) and `decide_expedition_fork` (`20261009000001`) are not redeclared.
- `RUN_COLUMNS` in `queries.ts` never grows. New tables are read by their own fail-soft queries.
- Every rules-6 branch is guarded by `rules >= ARCHETYPE_RULES`; scripted-rand tests prove a rules-5 run's events and journal are byte-identical before and after.
- Comments say why. Copy is declarative and theatrical like the rest of the board.
- Acceptance for every phase: `npm run typecheck && npm run lint && npm test`, plus `npm run test:db` for phases with SQL (local `npx supabase start`), plus `npm run build` for phases touching pages/server boundaries.

## Phase graph

```
1 ──► 2 ──► 3 ──┐
       │        ├──► 5 ──► 6 ──► 7 ──► 8
       └──► 4 ──┘
```
Phase 4's SQL, `league.ts`, `leagueSweep.ts`, `LeagueGoalPanel.tsx` and tests may start alongside Phase 2 (disjoint files); its single call-site line in `runs.ts` and its panel line in `ExpeditionBoard.tsx` are added after Phase 2 merges. Everything else is sequential.

---

## Phase 1 — Foundation: rules 6, the ability table, shared hooks

**Goal.** Move the rulebook to 6, define every archetype's edge as data, add the types the resolver and views will fill, and pin the guardrail arithmetic. No behaviour change yet.

**Create**
- `supabase/migrations/20261026000001_expedition_rules_six.sql`: header comment (why: abilities, tent, edge reveals resolve under 6); `alter table public.expedition_runs alter column rules set default 6;`; `create or replace function public.expedition_rules_version() returns int language sql stable security definer set search_path = public as $$ select coalesce((regexp_match(column_default, '\d+'))[1]::int, 1) from information_schema.columns where table_schema = 'public' and table_name = 'expedition_runs' and column_name = 'rules' $$;` revoke from public/anon/authenticated, grant execute to service_role.
- `supabase/tests/0130_expedition_rules_six_test.sql` (plan 4): a fresh `launch_expedition` (13-arg, `p_convoy` null) stamps `rules = 6`; a row inserted with explicit `rules = 5` keeps 5; `expedition_rules_version()` returns 6; authenticated cannot execute it.
- `src/lib/expeditions/archetypes.ts`: `ARCHETYPE_RULES = 6`; `AbilityKind` union (loot, finale, guard, shield, front, camp, hold, toll, gamble, find, merchant, rival, ghost, warned, momentum, call, clock, reveal, mutation, rescue, jack); `ArchetypeAbility { title; kind; power; does: string }`; `ARCHETYPE_ABILITIES: Record<string, ArchetypeAbility>` (all 57 rows of spec §1.2 with the named constants); `abilityOf(copy)`; `ActiveAbility { copyId; ability; counts: boolean; ignoredFor?: number }`; `abilitySheet(copies): ActiveAbility[]` (one per kind, power, miles via `milesOf`, lower id); `activeAbilities(copies)` (only `counts`); `traitsOf(copies, rules): AbilityTraits { stormproof; hunterFinds; merchantDraw; reveal; speedrun }`; `edgeLine(copies)` for the journal.
- `src/lib/expeditions/archetypes.test.ts`: table keys == `ARCHETYPE_TITLES` + `FALLBACK_ARCHETYPE`; every kind has ≤ 1 winner per squad; ties resolved by miles then id; frozen-title fallback; `traitsOf` off below rules 6.

**Modify**
- `src/lib/cards/build.ts`: `export const ARCHETYPE_TITLES = ARCHETYPES.map((a) => a.title);` (one line, after the table).
- `src/lib/expeditions/routes.ts`: `RouteEvent.ability?: string`; `RouteInput.camp?: { tent: number } | null`; export nothing else new. (Behaviour untouched.)
- `src/lib/expeditions/config.ts`: `expectedDailyDollars(tier, durationHours = EXPEDITION_TIERS[tier].durationHours)`.
- `src/lib/expeditions/config.test.ts`: speedrun and slot guardrail assertions (spec §8) importing `SPEEDRUN_HOURS`, `SPEEDRUN_MAX_HOURS` from `archetypes.ts` and `CAMP_SLOTS_MAX` = 1 from `camp.ts` (create the constant file stub `src/lib/expeditions/camp.ts` with `CAMP_SLOTS_MAX` only; Phase 3 fills it).
- `src/lib/expeditions/queries.ts`: `fetchRulesVersion(supabase): Promise<number>` (rpc `expedition_rules_version`, fails soft to 1).

**Acceptance.** `npm test -- --project=node`, `npm run test:db` (0130 green), typecheck, lint, `node scripts/check-migrations.mjs origin/develop HEAD`.

**Ownership.** Phase 1 owns: the migration/test above, `archetypes.ts(.test)`, `build.ts` (one export), `config.ts/.test.ts`, `queries.ts` (one function), `routes.ts` (types only), `camp.ts` stub.

---

## Phase 2 — Abilities on the road

**Goal.** Edges fire in the resolver, the derivation, the fork buttons, the journal, the claim and the launch; the tent hook exists (data arrives in Phase 3). Runs below 6 unchanged.

**Modify**
- `src/lib/expeditions/routes.ts`: in `resolveRoute` read `edges = road.rules >= ARCHETYPE_RULES ? activeAbilities(copies) : []`; implement every hook in spec §1.3 in the documented order (guard/front/shield/warned scaling inside the victim loop; loot edges after the bonus; camp edges inside the camp branch; hold edge; toll edges; gamble edges; momentum on all routes; finale edges after insurance and before the clamp; tent: `input.camp?.tent` absorbs the first camp wound/haunt and, at 2, the first toll — event text "The tent held: …"). Every ability event carries `ability`. Update the rand-order comment. `forkOptions`: append edge sentences to teases under rules ≥ 6; Island King unlocks a second `hold`; Roaming Threat tease on `roam`.
- `src/lib/expeditions/journal.ts`: `encountersFor(run, company?, weather?, traits?)` (stormproof, merchantDraw, hunterFinds under rules ≥ 6, after the existing draws so legacy runs are unchanged); `roadJournal` adds the edge line at leg 0, 0.08 under rules ≥ 6.
- `src/lib/expeditions/companyReads.ts`: `encountersOf` passes no traits (other runs' squads are not read; a trait never changes rival/ghost legs, only storm/merchant/hunter, so company stays stable).
- `src/lib/expeditions/runs.ts`: claim — `traitsOf(copies, run.rules)` into `encountersFor`; `camp` = `await fetchCamp(service, discordId)` (null until Phase 3 lands; pass `{ tent: camp?.tent ?? 0 }`); merchant ×2 for Gold Hoarder; `p_outcome.abilities`. Launch — `fetchRulesVersion` + Speedrunner clock cut. Sweep — traits for the storm loop (fetch the squad before the storm loop, it is fetched for the ping anyway).
- `src/lib/expeditions/routes.test.ts`, `journal.test.ts`, `runs.test.ts`: a fixture squad per kind; scripted queues proving each hook; a "rules 5 snapshot" test that runs the existing fixtures with `rules: 5` and a squad full of edges and asserts events equal a run without edges.
- `src/components/cards/ExpeditionBoard.tsx`: picker chip shows `abilityOf(copy).title` and, when picked, the sheet ("Guard · Rival · Camp — all three count" / "a second Camp Thief counts for nothing"); ceremony lists `route.events.filter(e => e.ability)` under "Edges that fired". (Small, additive; `ExpeditionBoard.test.tsx` cases for both.)

**Acceptance.** Node + dom tests, typecheck, lint. No SQL.

**Ownership.** `routes.ts`, `journal.ts`, `runs.ts`, `companyReads.ts`, their tests, and the two additive board spots. Nothing in `queries.ts` beyond what Phase 1 added.

---

## Phase 3 — Base camp

**Goal.** A persistent camp with the slot, tent, forge and wall; purchases atomic and ledgered; a second Scouting Run; forged policies.

**Create**
- `supabase/migrations/20261027000001_expedition_base_camp.sql`: `expedition_camps` (spec §2.2, RLS owner read via `profiles`, grants); `expedition_runs.forged`; `expedition_camp_price`; `upgrade_expedition_camp`; `launch_expedition` 12-arg redeclared from `20261020000001` with the two edits; 14-arg wrapper; revokes/grants for all three.
- `supabase/tests/0131_expedition_base_camp_test.sql` (plan ≈ 16): bad price refused; slot bought → ledger row `expedition_camp` with −1500, fragments −1; second scout allowed, third refused 'tier already out'; tent 0→1→2, 'already built' at 2; 'policy' without forge refused; forge then policy (fragments −2), forge full at 2; forged launch on legend when the weekly cap is already spent → allowed, run has `insured` true and `forged` true; second forged launch that week → 'forge spent this week'; forged run not counted by the inner cap; scout forged → 'policy not wanted'; authenticated cannot execute.
- `src/lib/expeditions/camp.ts` (fill the stub): `CAMP_PRICES`, `FORGE_FRAGMENTS 2`, `FORGE_HOLD 2`, `FORGED_PER_WEEK 1`, `CampState`, `nextLevel`, `campLine`s for the panel; `camp.test.ts` holds `CAMP_PRICES` equal to `expedition_camp_price` by reading the newest migration declaring it.
- `src/components/cards/CampPanel.tsx` (+ test): levels, prices, buy/forge buttons, wall contents (props: `camp`, `fragments`, `balance`, `relics`, `accolades`, `landmarks`, `roads`).

**Modify**
- `src/lib/expeditions/queries.ts`: `fetchCamp`, `fetchForgedThisWeek`.
- `src/lib/expeditions/actions.ts`: `upgradeCampAction`, `forgePolicyAction` (getBettingUser, rpc, revalidate).
- `src/lib/expeditions/runs.ts`: `LaunchOptions.forged`; pre-checks; 14-arg call path; `friendlyExpeditionError` entries ('no forged policy', 'forge spent this week', 'policy not wanted', 'bad price', 'forge not built', 'forge is full', 'already built').
- `src/app/cards/expeditions/page.tsx`: read camp + forged count; pass to the board.
- `src/components/cards/ExpeditionBoard.tsx`: render `CampPanel`; the launch options row gains "Use a forged policy" when held; scout tier card's "Already in the field" respects `scoutSlots(camp)`.
- `src/lib/economy/ledger.ts`: SPEND rows "Base camp upgrades" and "Forging a policy" (figures imported from `camp.ts`).

**Acceptance.** `npm run test:db` (0131), node + dom tests, typecheck, lint, `npm run build`.

**Ownership.** Migration/test, `camp.ts(.test)`, `CampPanel.tsx(.test)`, `queries.ts` (camp reads), `actions.ts` (two actions), `runs.ts` launch path only, `page.tsx` (camp reads), `ExpeditionBoard.tsx` (panel + launch option), `ledger.ts`.

---

## Phase 4 — League expedition of the week

**Goal.** One shared weekly goal per season, progress from claimed runs, idempotent award through the sweep, shown on the board.

**Create**
- `supabase/migrations/20261028000001_expedition_league_goal.sql`: the view, two tables (public read policies, grants), `fell_expedition_league_goal` (spec §3.2), revokes/grants.
- `supabase/tests/0132_expedition_league_goal_test.sql` (plan ≈ 10): the view groups by Eastern Monday of `started_at`; below target → `(false, 0)` and no rows; at target → goal row, one reward per contributor, `fragments + 1` each, top flagged; second call → `(true, 0)` and no double credit; anon can select the view and the tables.
- `src/lib/expeditions/league.ts` (+ test): `LANDMARK_MILES 40`, `BOSS_HEALTH 24`, `leagueGoalFor`, `goalProgress`, `myShare`, `weeksToWatch(now)`.
- `src/lib/expeditions/leagueSweep.ts` (+ test with a mocked client): `sweepLeagueGoals(service, now)`.
- `src/components/cards/LeagueGoalPanel.tsx` (+ test).

**Modify**
- `src/lib/expeditions/queries.ts`: `fetchLeagueProgress`, `fetchLeagueGoals` (fail soft).
- `src/lib/expeditions/runs.ts`: one line in `sweepExpeditions` calling `sweepLeagueGoals` inside a try/catch that pushes to `errors` (after Phase 2 merges).
- `src/app/cards/expeditions/page.tsx`, `ExpeditionBoard.tsx`: read and render the panel (one prop, one line).

**Acceptance.** `npm run test:db` (0132), node + dom tests, typecheck, lint, build.

**Ownership.** Migration/test, `league.ts`, `leagueSweep.ts`, `LeagueGoalPanel.tsx`, their tests, `queries.ts` (league reads), the one-line hooks in `runs.ts`, `page.tsx`, `ExpeditionBoard.tsx`.

---

## Phase 5 — Server-derived views and the road ahead

**Goal.** The board renders what the server says the squad knows; unknown checkpoints show as unknowns with a dread mark; a fragment reveals a road; hidden places never reach the browser.

**Create**
- `supabase/migrations/20261029000001_expedition_road_ahead.sql`: `expedition_reveals`, `reveal_expedition_road`, RLS/grants.
- `supabase/tests/0133_expedition_road_ahead_test.sql` (plan ≈ 7): not the caller's run → 'unknown run'; claimed → 'already claimed'; no fragments → 'not enough fragments'; success decrements and inserts; second call → 'already revealed'; authenticated cannot execute.
- `src/lib/expeditions/forks.ts`: the client-safe half of `routes.ts` (types, `FORK_CHOICES`, `forkWindows`, `forkViews`, `openFork`, `choiceSheet`, `isCampChoice`, `ROLE_CALLS`, `ROLE_CALL_BY_CHOICE`, `VETERAN_TEASE`, `FRAGMENT_CHANCE`, `DEAD_NEEDS_PUSHES`, `TOLL_LOOT`, `SCOUTED_CAMP_RISK`, `ROAD_SIZES` = `{ scout: 4, gilded: 6, raid: 6, legend: 9, rescue: 3, exorcism: 0, legendary: 12, mythic: 10 }`). `routes.ts` imports and re-exports them (no other caller changes). `routes.test.ts` asserts `ROAD_SIZES` equals `ROADS` lengths.
- `src/lib/expeditions/reveal.ts` (+ test): `knownCheckpoints(run, copies, views, reveals, partnerReveal, rules): Map<index, revealedBy>`; `dangerOf(fork, wardenActive)`.
- `src/lib/expeditions/views.ts` (+ test): `runViewFor(...)` per spec §4.4; surfaced-only company; `nextAt`.
- `src/components/cards/expeditionImports.test.ts`: reads `ExpeditionBoard.tsx`, `RouteMap.tsx`/`LivingMap.tsx`, `ExpeditionRules.tsx`, `CampPanel.tsx`, `LeagueGoalPanel.tsx`, `AtlasPanel.tsx` (if present) and fails on `@/lib/expeditions/routes` or `@/lib/expeditions/journal` imports.

**Modify**
- `src/lib/expeditions/queries.ts`: `fetchReveals(supabase, discordId, runIds)`.
- `src/lib/expeditions/actions.ts`: `revealRoadAction(runId)`.
- `src/app/cards/expeditions/page.tsx`: build `views` (needs reveals, partner reveals via `convoys`, camp tent); pass `views`; stop passing `company` inside runs.
- `src/components/cards/ExpeditionBoard.tsx`: `RunTrail` and `ForkPrompt` consume `views[run.id]`; drop `journalFor`, `banterFor`, `forksFor`, `forkOptions` imports; add the reveal button ("Spend a fragment: see the road"); schedule `router.refresh()` at `nextAt`.
- `src/components/cards/RouteMap.tsx`: accept `road: PlaceView[]` (titles only for known places; `?` otherwise; dread mark for `warned`). Phase 7 replaces it.
- `src/components/cards/ExpeditionRules.tsx`: `placesOn` reads `ROAD_SIZES`.
- `ExpeditionBoard.test.tsx`: fixtures now pass `views`; new cases: unknown checkpoint renders no title, warned unknown renders the dread mark, reveal button calls the action.

**Acceptance.** `npm run test:db` (0133), node + dom tests (including the import guard), typecheck, lint, build.

**Ownership.** Everything listed; this phase owns `ExpeditionBoard.tsx` exclusively while it runs.

---

## Phase 6 — The atlas

**Goal.** A codex per collector derived from claimed runs, landmarks named after the first to reach them, a reward for completing a road.

**Create**
- `supabase/migrations/20261030000001_expedition_atlas.sql`: `expedition_landmarks`, `expedition_atlas_awards`, `expedition_road_size`, `expedition_road_reward`, `name_expedition_landmarks`, `award_expedition_road`, RLS/grants.
- `supabase/tests/0134_expedition_atlas_test.sql` (plan ≈ 12): road sizes per tier; landmark naming refuses places not in the run's stamped atlas; first claim wins, second returns no rows; award refused below size; award once with fragments (+ a comp for legendary); second award no-op; anon can read landmarks, not awards.
- `src/lib/expeditions/atlas.ts` (+ test): `ROAD_SIZES` (import from `forks.ts`), `ROAD_REWARDS`, `atlasStamp(run, forks, encounters, company)`, `atlasFor(runs, landmarks)`, `roadComplete`, `firstNamedLine`. Test holds `ROAD_SIZES`/`ROAD_REWARDS` equal to the SQL by reading the newest migration declaring each function.
- `src/components/cards/AtlasPanel.tsx` (+ test).
- `scripts/backfill-expedition-atlas.ts` (+ a small test of its pure planner): service role, stamps `outcome.atlas` on claimed runs lacking it, names landmarks in `claimed_at` order; `npx tsx scripts/backfill-expedition-atlas.ts --dry-run` prints the plan.

**Modify**
- `src/lib/expeditions/runs.ts`: claim stamps `p_outcome.atlas`; after the resolve, best-effort `name_expedition_landmarks` (announce newly named) and `award_expedition_road` when `roadComplete`.
- `src/lib/expeditions/queries.ts`: `fetchLandmarks(season)`, `fetchAtlasAwards(discordId, season)`.
- `src/lib/expeditions/views.ts`: `PlaceView.landmark` filled from landmarks (crest when the namer's wall is 2 — read camps for the namers in `page.tsx`).
- `page.tsx`, `ExpeditionBoard.tsx`: read and render `AtlasPanel`; `CampPanel` receives landmarks/roads.
- `ExpeditionRunOutcome` in `queries.ts`: optional `atlas`, `abilities` fields in the mapped type (not `RUN_COLUMNS`).

**Acceptance.** `npm run test:db` (0134), node + dom tests, typecheck, lint, build.

**Ownership.** Migration/test, `atlas.ts(.test)`, `AtlasPanel.tsx(.test)`, the script, `runs.ts` claim tail, `queries.ts` (atlas reads + outcome type), `views.ts` (landmark field), `page.tsx`/`ExpeditionBoard.tsx` (panel lines).

---

## Phase 7 — The living map

**Goal.** Replace `RouteMap` with an animated engraved night chart per spec §6.1, consuming `RunView` (fog, pins, weather, company, landmarks, league goal).

**Create**
- `src/components/cards/LivingMap.tsx` (+ `LivingMap.test.tsx` in jsdom: renders known/unknown roundels, dread mark, pins by fraction, weather class, reduced-motion attribute, no titles for unknown places).
- `src/components/cards/mapGlyphs.tsx`: the monoline glyph set keyed by place family; `glyphFor(key)`.
- `src/components/cards/mapTerrain.tsx`: per-tier terrain groups and path geometry (720×220), `PATHS` moved from `RouteMap.tsx`.
- `src/app/globals.css`: `@utility map-chart`, `map-fog`, `map-rain`, `map-drift`, marker transition, and a `prefers-reduced-motion` block for all of them (keep the `legend-embers` idiom).
- `src/app/admin/expedition-map/page.tsx` (+ `page.test.tsx`): fixture states (spec §6.2); staff-gated, open in development; a link card in `src/app/admin/page.tsx`.
- `src/lib/expeditions/mapFixtures.ts`: the six fixture `RunView`s for two tiers, pure, reused by the tests.

**Modify**
- `ExpeditionBoard.tsx`: `RunTrail` uses `LivingMap` (props: `view`, `progress`, `weather`, `goal`); remove `RouteMap.tsx`.
- `ExpeditionBoard.test.tsx`: swap the `route-map` test id for `living-map`.

**Acceptance.** dom + node tests, typecheck, lint, `npm run build`; `npm run dev` and eyeball `/admin/expedition-map` before handing to Phase 8.

**Ownership.** All files above; `ExpeditionBoard.tsx` only at the `RunTrail` call site.

---

## Phase 8 — Visual verification, rules, docs, economy page

**Goal.** Prove the map looks good, write the rules the players read, and record the design of record.

**Create**
- `e2e/expedition-map.spec.ts`: for each fixture state, `page.goto('/admin/expedition-map?state=<key>&tier=<tier>')`, viewport 1280×800 then 390×844, `toHaveScreenshot`-free plain `screenshot({ path })` into `e2e/screenshots/expedition-map/<state>-<tier>-<w>.png`; `.gitignore` the folder; run with `npx playwright test e2e/expedition-map.spec.ts --project=chromium` (Chromium at `/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Attach the twelve PNGs to the PR; iterate on line weights, contrast and label collisions until the owner signs off. Checklist in the PR: contours legible on the canvas, unknown roundels unmistakably unknown, dread mark visible at 390px, pins never overlap the open fork's label, storm and fog distinguishable, reduced-motion still readable.

**Modify**
- `src/components/cards/ExpeditionRules.tsx`: new sections — "Edges: what a title does on the road" (the table rendered from `ARCHETYPE_ABILITIES`, grouped by kind, the stacking rule), "Base camp" (levels/prices from `CAMP_PRICES`), "The league's expedition of the week", "The road ahead is earned" (the eight reveal rules), "The atlas" (road sizes and rewards). Every number imported, none restated.
- `docs/backend.md`: a new subsection after "Expedition routes" — "Expeditions, the next level" — one paragraph per feature naming modules, tables, RPCs, the rules-6 gate and the deploy-safety table.
- `src/lib/economy/ledger.ts`: EARN detail mentions the league goal's fragment and road rewards (fragments, not dollars); SPEND rows from Phase 3 plus "Revealing a road" (`REVEAL_FRAGMENTS`).
- `README.md`: one line under Playwright about the map screenshot spec.

**Acceptance.** Screenshot spec runs green; dom tests for the rules sections; typecheck, lint, build; docs diff reviewed for links.

**Ownership.** `ExpeditionRules.tsx(.test)`, `docs/backend.md`, `README.md`, `ledger.ts`, the spec file, `.gitignore`.

---

## Migration and test index

| Migration | pgTAP | Phase |
|---|---|---|
| `20261026000001_expedition_rules_six.sql` | `0130_expedition_rules_six_test.sql` | 1 |
| `20261027000001_expedition_base_camp.sql` | `0131_expedition_base_camp_test.sql` | 3 |
| `20261028000001_expedition_league_goal.sql` | `0132_expedition_league_goal_test.sql` | 4 |
| `20261029000001_expedition_road_ahead.sql` | `0133_expedition_road_ahead_test.sql` | 5 |
| `20261030000001_expedition_atlas.sql` | `0134_expedition_atlas_test.sql` | 6 |

## Decisions for the owner

See spec §9. Defaults are in code in one place each: `CAMP_PRICES` (`camp.ts` + `expedition_camp_price`), `FORGED_PER_WEEK`, `SPEEDRUN_MAX_HOURS`, `LANDMARK_MILES`/`BOSS_HEALTH`, `REVEAL_FRAGMENTS`, `ROAD_REWARDS`, and the ability magnitudes in `ARCHETYPE_ABILITIES`.
