# Captain Opponent Scouting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a trade-aware, data-only scouting dashboard for each captain's next opponent on the Premier and Academy Captain pages.

**Architecture:** Keep Supabase reads in the existing Captain Server Component, pass compact serializable draft/fixture rows into one narrow Client Component, and recompute scope-dependent facts with pure TypeScript derivations. Team patterns use games involving the next opponent; player pools start from the opponent's current Teams-page roster and search attributed pick actions across league history so a traded player's history follows them.

**Tech Stack:** Next.js 16.3 App Router, React 19 Client/Server Components, TypeScript, Supabase PostgREST, Tailwind CSS v4, Vitest, Testing Library, Riot Data Dragon champion assets.

**Spec:** `docs/superpowers/specs/2026-08-23-opponent-scouting-design.md`

## Global Constraints

- Show historical data only; do not generate recommendations, threat scores, priority labels, or coaching prose.
- Render the feature on both `/captain` and `/academy/captain`, scoped to that page's league and season.
- Treat every captain as Premium; display the Premium label without a Discord-role lookup or new access flag.
- Resolve displayed players from the opponent's current featured-draft roster, matching the Teams page.
- Attribute player champion history by normalized `action.playerName` across former teams so trades follow the player.
- Use `src/lib/match-draft/champions.ts` for every champion icon URL and always show the champion's text name.
- Reserve red for ban data; use consistent neutral styling for player-pool champion labels.
- Expanded past games show both sides, five pick slots per side, first three bans, and last two bans.
- Do not add a migration, service-role client, Realtime subscription, external dependency, separate route, or Premium navigation entry.
- Follow `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`: database reads stay in the Server Component and the scope selector is the smallest practical Client Component boundary.
- Preserve all unrelated working-tree changes and stage only files named by the active task.

---

## File Structure

### New domain files

- `src/lib/scouting/types.ts` — serializable source rows and derived scouting view models.
- `src/lib/scouting/derive.ts` — pure normalization, scope, team-pattern, player-pool, and full-draft derivations.
- `src/lib/scouting/derive.test.ts` — domain coverage including trades, phase splits, incomplete drafts, and stable rankings.
- `src/lib/scouting/queries.ts` — narrow public Supabase reads for historical fixtures and match drafts.
- `src/lib/scouting/queries.test.ts` — PostgREST query contract and league filtering.

### New UI files

- `src/components/captain/OpponentScout.tsx` — client controller for scope selection and dashboard composition.
- `src/components/captain/OpponentScout.test.tsx` — interaction, copy, icon/name, phase, and data-only assertions.
- `src/components/captain/scouting/ChampionDatum.tsx` — reusable champion icon-plus-name rendering.
- `src/components/captain/scouting/ScoutPatterns.tsx` — first picks, bans, sequences, pairings, side, adaptation, and flex facts.
- `src/components/captain/scouting/ScoutPlayerPools.tsx` — current-roster player rows and neutral champion tokens.
- `src/components/captain/scouting/ScoutPastDrafts.tsx` — expandable complete two-sided drafts.

### Existing files modified

- `src/app/captain/page.tsx` — fetch source rows, isolate scout failures, and mount the dashboard below `NextMatchCard` for both league variants.
- `src/app/captain/page.test.tsx` — Premier/Academy integration, next-opponent props, no-fixture omission, and query-failure isolation.
- `docs/superpowers/specs/2026-08-23-opponent-scouting-design.md` — retain the clarified global player-history scope for trades.

---

### Task 1: Define scouting source types and core opponent-game derivation

**Files:**
- Create: `src/lib/scouting/types.ts`
- Create: `src/lib/scouting/derive.ts`
- Create: `src/lib/scouting/derive.test.ts`

**Interfaces:**
- Consumes: `FixtureRow`, `LolRole`, `MatchDraftAction`, `MatchDraftPositions`, and `DraftSide` from existing domain modules.
- Produces: `ScoutSource`, `ScoutScope`, `ScopedScoutData`, `scopeTeamGames(source, scope)`, and `deriveScoutData(source, scope)` for later tasks.

- [ ] **Step 1: Write failing tests for team identity, scopes, ordered picks, and opposing bans**

Create fixtures with Night Vale on blue and red, a completed prior series, one current-season series, and six recent fixture ids. Include all 20 LCS actions in one game and skipped actions in another. Assert:

```ts
expect(resolveScoutedSide(game, " night vale ")).toBe("blue");
expect(scopeTeamGames(source, "season").every((game) => game.fixture.season === "S5")).toBe(true);
expect(new Set(scopeTeamGames(source, "recent").map((game) => game.fixture.id)).size).toBe(5);
expect(deriveScoutData(source, "season").firstPicks[0]).toMatchObject({ champion: "Ahri", count: 2 });
expect(deriveScoutData(source, "season").bannedAgainst[0]).toMatchObject({ champion: "Rumble", count: 2 });
expect(deriveScoutData(source, "season").pastDrafts[0].blue.banPhaseOne).toHaveLength(3);
expect(deriveScoutData(source, "season").pastDrafts[0].blue.banPhaseTwo).toHaveLength(2);
expect(deriveScoutData(source, "season").pastDrafts[0].red.picks).toHaveLength(5);
```

Also assert equal counts sort by normalized champion name, skipped champions do not enter frequency rankings, and skipped slots remain present in `pastDrafts` with `{ champion: null, skipped: true }`.

- [ ] **Step 2: Run the new domain test and verify failure**

Run: `npm test -- src/lib/scouting/derive.test.ts`

Expected: FAIL because `@/lib/scouting/derive` and `@/lib/scouting/types` do not exist.

- [ ] **Step 3: Define exact source and view-model types**

Add these public shapes to `types.ts`, using the existing domain types for nested fields:

```ts
export type ScoutScope = "recent" | "season" | "all";

export interface ScoutFixtureRow {
  id: string;
  season: string;
  stage: FixtureRow["stage"];
  team_a: string | null;
  team_b: string | null;
  scheduled_at: string | null;
  best_of: FixtureRow["best_of"];
  score_a: number | null;
  score_b: number | null;
}

export interface ScoutDraftRow {
  id: string;
  fixture_id: string;
  game_number: number;
  blue_team_name: string | null;
  red_team_name: string | null;
  winner_team: string | null;
  actions: MatchDraftAction[];
  positions: MatchDraftPositions | null;
  created_at: string;
}

export interface ScoutRosterPlayer {
  id: string;
  displayName: string;
  role: LolRole;
}

export interface ScoutHistory {
  fixtures: ScoutFixtureRow[];
  drafts: ScoutDraftRow[];
}

export interface ScoutSource extends ScoutHistory {
  opponentName: string;
  currentSeason: string;
  nextFixture: ScoutFixtureRow;
  roster: ScoutRosterPlayer[];
}
```

Define derived types for `ChampionCount`, `DraftSlot`, `FullDraftSide`, `PastDraft`, `PlayerPoolRow`, `SideFacts`, `AdaptationFacts`, `FlexFact`, and `ScopedScoutData`. `ScopedScoutData` must contain `gamesSampled`, `blueGames`, `distinctChampions`, `firstPicks`, `bannedAgainst`, `banPhaseOne`, `banPhaseTwo`, `openings`, `pairings`, `sideFacts`, `adaptation`, `flexes`, `playerPools`, and `pastDrafts`.

- [ ] **Step 4: Implement normalization, action ordering, scopes, and core counts**

In `derive.ts`:

```ts
export function scoutKey(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function resolveScoutedSide(
  game: ScoutDraftRow,
  opponentName: string,
): DraftSide | null {
  const target = scoutKey(opponentName);
  if (scoutKey(game.blue_team_name) === target) return "blue";
  if (scoutKey(game.red_team_name) === target) return "red";
  return null;
}
```

Join drafts to fixtures by `fixture_id`, discard untouched rows, and sort by `scheduled_at` descending, then `game_number` descending. Implement `recent` by selecting the first five distinct fixture ids from that ordering, `season` by exact `currentSeason`, and `all` without a season filter. Use `LCS_DRAFT_STEPS` and `actionForStep` rather than array offsets to construct five picks and the two ban phases for each side.

For `bannedAgainst`, select the side opposite `resolveScoutedSide`; for `firstPicks`, select the scouted side's earliest non-skipped pick step. Calculate `rate` as `count / gamesSampled * 100`, rounded to one decimal. Stable-sort every ranking by count descending and `champion.localeCompare` ascending.

- [ ] **Step 5: Run the domain test and verify pass**

Run: `npm test -- src/lib/scouting/derive.test.ts`

Expected: PASS with the scope, first-pick, opposing-ban, stable-sort, skipped-slot, and 3/2 phase assertions.

- [ ] **Step 6: Commit the core derivation**

```bash
git add src/lib/scouting/types.ts src/lib/scouting/derive.ts src/lib/scouting/derive.test.ts
git commit -m "feat: derive opponent draft scouting facts"
```

---

### Task 2: Add modular player pools and neutral pattern derivations

**Files:**
- Modify: `src/lib/scouting/derive.ts`
- Modify: `src/lib/scouting/derive.test.ts`

**Interfaces:**
- Consumes: `ScoutSource`, scoped team games, the full league `drafts` collection, and current `roster` from Task 1.
- Produces: complete `playerPools`, `openings`, `pairings`, `sideFacts`, `adaptation`, and `flexes` inside `deriveScoutData`.

- [ ] **Step 1: Write failing tests for trades and current-roster modularity**

Build league-wide draft rows where current Night Vale player `Northstar` picked Ahri twice for a former team, picked Orianna once for Night Vale, and a traded-away player has five Night Vale picks. Assert:

```ts
const pools = deriveScoutData(source, "all").playerPools;
expect(pools.map((row) => row.playerName)).toEqual([
  "Hollowpoint", "GhostRoute", "Northstar", "Halflight", "LowTide",
]);
expect(pools.find((row) => row.playerName === "Northstar")?.champions).toEqual([
  { champion: "Ahri", count: 2 },
  { champion: "Orianna", count: 1 },
]);
expect(pools.some((row) => row.playerName === "Former Mid")).toBe(false);
```

Add coverage that current-season pools include former-team actions in the current season, `recent` takes each current player's five most recent attributed fixture ids, missing `playerName` actions are excluded, name matching trims and ignores case, and a current player with no actions remains with `totalPicks: 0`.

- [ ] **Step 2: Write failing tests for openings, pairings, sides, adaptation, and flexes**

Assert an opponent opening sequence such as `Ahri / Vi / Nautilus`, unordered within-game champion pairs counted once per game, separate blue/red sample counts, first-pick change after a recorded loss, repeated champions in the next game, and a champion appearing in two indices of confirmed `positions` producing role labels from `ROLE_LABELS`.

Run: `npm test -- src/lib/scouting/derive.test.ts`

Expected: FAIL because the six advanced derivations are empty or absent.

- [ ] **Step 3: Implement trade-aware player-pool selection**

Index all draft rows by fixture metadata. For each current roster player, select pick actions whose normalized `playerName` equals normalized `displayName`, without filtering by the action's team name. Apply scopes as follows:

```ts
function playerDraftsForScope(
  playerName: string,
  source: ScoutSource,
  scope: ScoutScope,
): ScoutDraftRow[] {
  const attributed = source.drafts.filter((draft) =>
    draft.actions.some((action) =>
      action.kind === "pick" &&
      action.champion &&
      scoutKey(action.playerName) === scoutKey(playerName),
    ),
  );
  if (scope === "all") return attributed;
  if (scope === "season") return attributed.filter(
    (draft) => fixtureById(source, draft.fixture_id)?.season === source.currentSeason,
  );
  return takeMostRecentFixtureGroups(attributed, source.fixtures, 5);
}
```

Sort the final player rows by `ROLE_ORDER`, then display name. Count every attributed pick, stable-sort champion counts, and slice the visible list to five without losing `distinctChampions` or `totalPicks`.

- [ ] **Step 4: Implement the remaining neutral pattern derivations**

- Opening: join the first three scouted-side picks with `" / "` and count identical strings.
- Pairing: create every two-champion combination from the scouted side's five picks, alphabetize each pair, and count a pair once per game.
- Side facts: group games by scouted side and derive the most common first pick for each group.
- Adaptation: within each fixture, order games ascending; after a game the opponent lost, compare its first pick and picked-champion set with the next game.
- Flexes: read the scouted side's confirmed `positions`, map indices to `ROLE_LABELS`, and return champions observed in more than one distinct role.

Every list uses count-descending/name-ascending ordering. No function returns urgency, score, recommendation, priority, or prose fields.

- [ ] **Step 5: Run the complete derivation suite**

Run: `npm test -- src/lib/scouting/derive.test.ts`

Expected: PASS, including the former-team/current-roster trade scenario.

- [ ] **Step 6: Commit modular pools and patterns**

```bash
git add src/lib/scouting/derive.ts src/lib/scouting/derive.test.ts
git commit -m "feat: add trade-aware scouting patterns"
```

---

### Task 3: Load compact historical scouting source rows from Supabase

**Files:**
- Create: `src/lib/scouting/queries.ts`
- Create: `src/lib/scouting/queries.test.ts`

**Interfaces:**
- Consumes: a cookie-bound `SupabaseClient`, active `league`, and `leagueTeamNames` from `CaptainContext.teams`.
- Produces: `fetchScoutingHistory(supabase, input): Promise<ScoutHistory>`; Task 5 composes it with next-opponent and current-roster data into `ScoutSource`.

- [ ] **Step 1: Write the failing query-contract tests**

Mock `supabase.from` with thenable builders. Assert `fetchScoutingHistory`:

```ts
expect(from).toHaveBeenCalledWith("fixtures");
expect(from).toHaveBeenCalledWith("match_drafts");
expect(history.drafts[0].actions).toEqual(rawActions);
expect(history.fixtures.map((fixture) => fixture.id)).toEqual(["premier-fixture"]);
```

Assert both PostgREST errors are thrown, null `actions` become `[]`, null `positions` remain null, and the selected columns are exactly the compact fields in `ScoutFixtureRow` and `ScoutDraftRow` rather than `select("*")`. Cover the existing Captain-page league boundary: Premier keeps fixtures whose two teams are in `leagueTeamNames`; Academy keeps fixtures with at least one configured Academy team.

- [ ] **Step 2: Run the query test and verify failure**

Run: `npm test -- src/lib/scouting/queries.test.ts`

Expected: FAIL because `fetchScoutingHistory` does not exist.

- [ ] **Step 3: Implement the server query helper**

Use these selections:

```ts
const FIXTURE_COLUMNS =
  "id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b";
const DRAFT_COLUMNS =
  "id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, actions, positions, created_at";
```

Fetch both tables concurrently and check both errors. Normalize `leagueTeamNames`, filter fixtures with the same Premier/Academy rule already used in `CaptainPageView`, filter drafts to the retained fixture ids, and return plain objects only. Do not apply an opponent filter in PostgREST: names are free text, and the pure derivation owns trimmed case-insensitive matching. Keeping the full active-league draft collection is required for former-team player attribution.

- [ ] **Step 4: Run query and derivation tests**

Run: `npm test -- src/lib/scouting/queries.test.ts src/lib/scouting/derive.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the query boundary**

```bash
git add src/lib/scouting/queries.ts src/lib/scouting/queries.test.ts
git commit -m "feat: load opponent scouting history"
```

---

### Task 4: Build the interactive scouting dashboard

**Files:**
- Create: `src/components/captain/OpponentScout.tsx`
- Create: `src/components/captain/OpponentScout.test.tsx`
- Create: `src/components/captain/scouting/ChampionDatum.tsx`
- Create: `src/components/captain/scouting/ScoutPatterns.tsx`
- Create: `src/components/captain/scouting/ScoutPlayerPools.tsx`
- Create: `src/components/captain/scouting/ScoutPastDrafts.tsx`

**Interfaces:**
- Consumes: `OpponentScout({ source }: { source: ScoutSource })` and `deriveScoutData(source, scope)`.
- Produces: the complete Premium scouting section mounted by Task 5.

- [ ] **Step 1: Write failing component tests for default rendering and filtering**

Render `OpponentScout` with the compact fixture used by the domain tests. Assert:

```ts
expect(screen.getByText("Premium · Opponent scouting")).toBeTruthy();
expect(screen.getByRole("heading", { name: "Draft intel" })).toBeTruthy();
expect(screen.getByLabelText("Draft history")).toHaveValue("season");
expect(screen.getByText("18 drafts sampled")).toBeTruthy();

fireEvent.change(screen.getByLabelText("Draft history"), { target: { value: "all" } });
expect(screen.getByText("41 drafts sampled")).toBeTruthy();
```

Assert the output contains none of `/recommend|must ban|priority|threat score/i`.
Render a source with no draft actions and assert `No recorded drafts for this
opponent yet`. Render a source with an empty current roster but valid opponent
games and assert team history remains visible alongside `Current roster unavailable`.

- [ ] **Step 2: Write failing component tests for champion presentation, pools, and complete drafts**

Assert every known champion datum renders an `img` whose `src` equals `championIconUrl(name)` and accessible text with the champion name. Assert player-pool tokens share one neutral class and do not use per-item blue/purple/green classes. Open a Past Draft `<details>` row and assert:

```ts
expect(within(game).getByText("Blue side")).toBeTruthy();
expect(within(game).getByText("Red side")).toBeTruthy();
expect(within(game).getAllByText("Ban phase 1 · first 3")).toHaveLength(2);
expect(within(game).getAllByText("Ban phase 2 · last 2")).toHaveLength(2);
expect(within(game).getAllByTestId("blue-pick-slot")).toHaveLength(5);
expect(within(game).getAllByTestId("red-pick-slot")).toHaveLength(5);
```

Run: `npm test -- src/components/captain/OpponentScout.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement `ChampionDatum` and the focused presentational components**

`ChampionDatum` calls `championIconUrl`, uses a native `<img>` with `alt=""` because the adjacent name is visible, and renders the existing dashed empty slot for null/skipped champions. It accepts `tone: "neutral" | "pick-blue" | "pick-red" | "ban"` so color describes draft meaning rather than champion identity.

`ScoutPatterns` renders ranked bars with visible count and percent, phase chips, sequences, pairings, side samples, adaptation counts, and flex role labels. Red classes occur only in ban groups.

`ScoutPlayerPools` iterates all current roster rows, uses `ROLE_LABELS_SHORT`, renders three to five neutral `ChampionDatum` tokens, and shows `No attributed picks yet` when `totalPicks === 0`.

`ScoutPastDrafts` uses native `<details>/<summary>`. Each expanded body renders a responsive `md:grid-cols-[1fr_auto_1fr]` layout, stacking on mobile. Each side renders phase-one bans, phase-two bans, and five pick rows. Null/skipped slots retain their B1-B5 or R1-R5 labels.

- [ ] **Step 4: Implement the narrow Client Component controller**

At the top of `OpponentScout.tsx`, add `"use client"`. Keep only the selector state here:

```tsx
const [scope, setScope] = useState<ScoutScope>("season");
const data = useMemo(() => deriveScoutData(source, scope), [source, scope]);
```

Render the Premium kicker, Draft Intel heading, explicit no-recommendations subtitle, scope selector, opponent snapshot, and the three focused child sections. Use the approved expanded color vocabulary while retaining existing `card-brand`, `type-display`, `label-dash`, `line`, `navy`, `steel`, and `coral` product classes for surrounding chrome.

- [ ] **Step 5: Run the component and domain suites**

Run: `npm test -- src/components/captain/OpponentScout.test.tsx src/lib/scouting/derive.test.ts`

Expected: PASS with icon/name, neutral-pool, red-ban, scope interaction, complete-draft, and forbidden-copy assertions.

- [ ] **Step 6: Commit the dashboard**

```bash
git add src/components/captain/OpponentScout.tsx src/components/captain/OpponentScout.test.tsx src/components/captain/scouting
git commit -m "feat: build captain scouting dashboard"
```

---

### Task 5: Integrate scouting into both Captain page variants

**Files:**
- Modify: `src/app/captain/page.tsx:1-220`
- Modify: `src/app/captain/page.test.tsx`

**Interfaces:**
- Consumes: `fetchScoutingHistory`, `OpponentScout`, `nextFixture`, `opponentTeamId`, `opponentRoster`, `context.season`, `context.teams`, and `league`.
- Produces: fault-isolated scouting UI below `NextMatchCard` on Premier and Academy.

- [ ] **Step 1: Extend page mocks and write failing integration tests**

Mock `fetchScoutingHistory` and `OpponentScout`. Add tests that:

- a Premier captain with a next fixture passes `league: "premier"` and current team names to the history loader, then gives `OpponentScout` the opponent name, current season, next fixture, and opponent's current `draftPlayers`;
- an Academy captain does the same with `league: "academy"` and the Academy context;
- no upcoming fixture does not call the loader or render Opponent Scouting;
- a rejected scout query still renders Next Match, Tourney Codes, Report a Result, My Roster, My Results, and Announcements;
- an admin switch changes the active team and therefore the next-opponent scout input.

Use a mock component that renders `Opponent scouting: {source.opponentName}` so page composition order can be asserted directly below Next Match.

- [ ] **Step 2: Run the page test and verify failure**

Run: `npm test -- src/app/captain/page.test.tsx`

Expected: FAIL because the page neither calls the scouting loader nor mounts the component.

- [ ] **Step 3: Start the historical read in the existing server data flow**

Compute `opponentName` from the resolved next fixture with the existing normalized team comparison. Add `fetchScoutingHistory` to the same `Promise.all` that loads `opponentRoster`, because the current roster and historical rows are independent. After both resolve, map `opponentRoster.draftPlayers` to `{ id, displayName: display_name, role }` and compose the final `ScoutSource`.

Use an isolated result union rather than allowing scouting to reject the page:

```ts
const scoutingHistoryPromise = nextFixture && opponentName
  ? fetchScoutingHistory(supabase, {
      league,
      leagueTeamNames: context.teams.map((team) => team.name),
    }).then((history) => ({ ok: true as const, history }))
      .catch((error: unknown) => {
        console.error("Unable to load opponent scouting", error);
        return { ok: false as const };
      })
  : null;
```

Include `scoutingHistoryPromise` in the existing `Promise.all` beside
`opponentRoster`. Compose `source` from successful `history` only after that
shared `Promise.all` has returned the roster. Do not expose error objects to the
Client Component.

```ts
const scoutingSource =
  scoutingHistoryResult?.ok && nextFixture && opponentName
    ? {
        ...scoutingHistoryResult.history,
        opponentName,
        currentSeason: context.season,
        nextFixture,
        roster: (opponentRoster?.draftPlayers ?? []).map((player) => ({
          id: player.id,
          displayName: player.display_name,
          role: player.role,
        })),
      }
    : null;
```

- [ ] **Step 4: Mount the section below `NextMatchCard`**

Render `<OpponentScout source={scoutingSource} />` when it is non-null. When
`scoutingHistoryResult?.ok === false`, render a compact `card-brand` section
labeled `Premium · Opponent scouting` with `Scouting data is temporarily
unavailable.` Do not render anything when there is no next fixture, because
`NextMatchCard` already owns that empty state.

The shared `CaptainPageView` receives `league`, so this single integration covers both `/captain` and `/academy/captain` without duplicating route code.

- [ ] **Step 5: Run page, component, query, and derivation tests**

Run: `npm test -- src/app/captain/page.test.tsx src/components/captain/OpponentScout.test.tsx src/lib/scouting/queries.test.ts src/lib/scouting/derive.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Captain-page integration**

```bash
git add src/app/captain/page.tsx src/app/captain/page.test.tsx
git commit -m "feat: add scouting to captain hub"
```

---

### Task 6: Verify the complete flow and prepare main for push

**Files:**
- Modify only if verification exposes a defect: files created or modified in Tasks 1-5.
- Verify: `docs/superpowers/specs/2026-08-23-opponent-scouting-design.md`

**Interfaces:**
- Consumes: the completed read-only scouting feature.
- Produces: evidence that the feature is responsive, trade-aware, data-only, and safe to push to `main`.

- [ ] **Step 1: Run focused tests once more from a clean process**

Run:

```bash
npm test -- src/lib/scouting/derive.test.ts src/lib/scouting/queries.test.ts src/components/captain/OpponentScout.test.tsx src/app/captain/page.test.tsx
```

Expected: all scouting and Captain-page tests PASS.

- [ ] **Step 2: Run repository-wide static and unit checks**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all three commands exit 0. The build must complete under Next.js 16.3 without Client Component serialization errors.

- [ ] **Step 3: Start the local app and verify Captain scouting in a browser**

Run `npm run dev`, then use the repository's seeded captain/admin login flow from `README.md`. Verify at desktop width and 390px mobile width:

- Premier and Academy pages target their own next opponent;
- the Premium label is visible without a second access check;
- scope changes update counts without navigation or network requests;
- champion icons and names appear together;
- ban facts are red and player-pool tokens are neutral and consistent;
- current roster players match the corresponding Teams page;
- a complete Past Draft expands to blue and red sides, five picks each, and 3/2 ban phases;
- no recommendation or priority language appears;
- the console has no hydration, image, or runtime errors.

- [ ] **Step 4: Review the final diff without disturbing unrelated work**

Run:

```bash
git status --short
git diff --check
git diff origin/main...HEAD -- src/lib/scouting src/components/captain src/app/captain docs/superpowers
```

Confirm the pre-existing edits and untracked assets listed before implementation remain unstaged and unchanged. Confirm no migration, package change, Premium Discord gate, or service-role import entered the feature diff.

- [ ] **Step 5: Commit any verification-only correction**

If Step 3 or Step 4 required a correction, rerun the narrow failing check, stage only the corrected scouting file, and commit:

```bash
git commit -m "fix: polish opponent scouting verification"
```

If no correction was needed, do not create an empty commit.

- [ ] **Step 6: Push the verified commits to main**

Before pushing, run `git status --short --branch` and confirm `HEAD` is on `main`, ahead of `origin/main` only by the scouting design, plan, and implementation commits. Then run:

```bash
git push origin main
```

Expected: the remote reports `main -> main`. Do not force-push.
