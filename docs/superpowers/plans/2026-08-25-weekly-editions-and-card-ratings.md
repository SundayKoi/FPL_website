# Weekly Card Editions and Role-Aware Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make weekly card drops rate players on that week's games alone, put the top tiers back in reach, and give every role its own five stat bars.

**Architecture:** Three independent changes on the same engine. The curve is two constants. The bars move into a new pure `measures.ts` module that owns the vocabulary and the per-role assignment, leaving `build.ts` to call it. Weekly editions add one sibling builder, `fetchWeekCards`, that scopes the cohort to a week and reuses `buildSeasonCards` untouched — the archive, pack roller and edition picker keep working on `PlayerCardData` exactly as they do now.

**Tech Stack:** TypeScript, Next.js 16 App Router, Supabase (postgres-js client), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-weekly-editions-and-card-ratings-design.md`

## Global Constraints

- **No migration.** Every column needed already exists on `raw_stats`. Do not add or alter tables.
- **Frozen copies must keep rendering.** Cards already in `card_inventory` carry the old five bars (`combat`/`economy`/`vision`/`form`/`clutch`). `CardSubStat["key"]` must keep those members. The renderer already maps over `card.subStats` and prints `stat.label`, so it needs no change — do not make it role-aware.
- **Weeks 1 and 2 stay archived as they are.** The change is forward-looking; never re-archive an existing edition week.
- **Every bar is a percentile against the player's own role cohort**, via the existing `roleCohort()` (same-role peers, falling back to the whole cohort under 4 members).
- Bars render on the 20–99 scale via the existing `toStat()`.
- Run tests with `npx vitest run <path>`. Full suite: `npm test`. Also `npx tsc --noEmit` and `npm run lint` before the final commit of each task.

---

### Task 1: Rating curve

Puts Master and Challenger back in reach. Independent of everything else.

**Files:**
- Modify: `src/lib/cards/build.ts` (the `OVR_SCALE` constant, ~line 119)
- Test: `src/lib/cards/build.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new. `tierFor(overall)` and `buildCard()` keep their signatures.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/cards/build.test.ts`, inside the existing `describe("buildCard")` block:

```ts
it("maps the league's best week onto a reachable top tier", () => {
  // A raw Power score of 92 was a real week-1 high in S4. Under the old
  // curve (28 + s*0.68) it capped at 91 — Diamond — and Challenger at 94
  // needed a score of 97, which nobody reaches. 28 + s*0.72 lands it at 94.
  expect(Math.round(28 + 92 * 0.72)).toBe(94);
  expect(tierFor(Math.round(28 + 92 * 0.72)).key).toBe("challenger");
  // A median week is untouched territory: still comfortably Gold.
  expect(tierFor(Math.round(28 + 55 * 0.72)).key).toBe("gold");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cards/build.test.ts -t "reachable top tier"`
Expected: FAIL — `expected 91 to be 94` (the assertion arithmetic is fixed, so this fails only if the constant is wrong; see Step 3's note).

- [ ] **Step 3: Change the constant**

In `src/lib/cards/build.ts`, replace:

```ts
const OVR_SCALE = 0.68;
```

with:

```ts
// 0.72, not 0.68: raw Power scores top out near 86 over a season and 92-96
// over a single week, so the old scale left Master (89) and Challenger (94)
// unreachable and the pack economy's legendary class permanently empty.
// Modelled on four real weekly cohorts — 0.72 mints roughly one Challenger
// in a strong week and none in a quiet one, and never hits the 99 clamp
// (which would tie players and make collector serials arbitrary).
const OVR_SCALE = 0.72;
```

Then rewrite the test's first two assertions to go through the real code rather than restating the arithmetic:

```ts
it("maps the league's best week onto a reachable top tier", () => {
  const best = buildCard({ row: target, cohort: cohortOf(target), games, gameLog });
  expect(best.overall).toBeGreaterThan(0);
  // The curve itself: a 92 raw score must clear Challenger's 94 floor.
  expect(tierFor(Math.round(OVR_BASE + 92 * OVR_SCALE)).key).toBe("challenger");
  expect(tierFor(Math.round(OVR_BASE + 55 * OVR_SCALE)).key).toBe("gold");
});
```

and export the constants from `build.ts` so the test can use them:

```ts
export const OVR_BASE = 28;
export const OVR_SCALE = 0.72;
```

Update the test's import line to include them:

```ts
import { assignArchetypes, buildCard, buildSeasonCards, cardSlug, FALLBACK_ARCHETYPE, OVR_BASE, OVR_SCALE, teamBadgeKey, tierFor, type CardGameRow } from "./build";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/cards/build.test.ts`
Expected: PASS. Other assertions in this file check ranges and ordering, not exact OVR values, so they should be unaffected. If one asserts a specific overall, update it to the new expected number and note the curve change in a comment.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cards/build.ts src/lib/cards/build.test.ts
git commit -m "feat: raise the OVR curve so the top tiers are reachable"
```

---

### Task 2: The measure vocabulary

A new pure module owning every bar's definition. No wiring yet — this task ends with tested functions nothing calls.

**Files:**
- Create: `src/lib/cards/measures.ts`
- Create: `src/lib/cards/measures.test.ts`
- Modify: `src/lib/cards/build.ts` (widen `CardGameRow` only — the wiring lands in Task 3)

**Interfaces:**
- Consumes: `CardGameRow` from `build.ts`.
- Produces:
  - `export interface GameTotals { objectives: number; turrets: number }`
  - `export function gameTotals(games: CardGameRow[]): GameTotals`
  - `export function pctOf(values: number[], value: number): number`
  - `export type MeasureKey = "combat" | "damage" | "economy" | "laning" | "vision" | "objectives" | "turrets" | "survival" | "presence" | "impact"`
  - `export const MEASURE_LABELS: Record<MeasureKey, string>`
  - `export const ROLE_BARS: Record<string, MeasureKey[]>` and `export const DEFAULT_BARS: MeasureKey[]`
  - `export function barsForRole(roleMode: string | null | undefined): MeasureKey[]`

- [ ] **Step 1: Widen `CardGameRow`**

In `src/lib/cards/build.ts`, add these fields to the `CardGameRow` interface (all nullable — a game row predating a column, or a role that never touches an objective, legitimately has none):

```ts
export interface CardGameRow {
  summoner_name: string;
  tag: string;
  champion: string | null;
  win: boolean | null;
  game_date: string | null;
  match_id: string;
  team_name: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  total_damage_to_champions: number | null;
  /** Objective and turret work — only on raw_stats, never on
   *  stats_player_agg, so these ride the per-game rows both build paths
   *  already fetch. */
  dragon_kills?: number | null;
  baron_kills?: number | null;
  objective_damage?: number | null;
  turret_kills?: number | null;
  turret_damage?: number | null;
  turret_plates_destroyed?: number | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/cards/measures.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CardGameRow } from "./build";
import { DEFAULT_BARS, ROLE_BARS, gameTotals, pctOf } from "./measures";

const game = (over: Partial<CardGameRow> = {}): CardGameRow => ({
  summoner_name: "Player",
  tag: "NA1",
  champion: "Jhin",
  win: true,
  game_date: "2026-08-01T00:00:00Z",
  match_id: "NA1_1",
  team_name: "Gamblers",
  kills: 5,
  deaths: 3,
  assists: 6,
  cs: 200,
  total_damage_to_champions: 20000,
  ...over,
});

describe("gameTotals", () => {
  it("averages objective and turret work per game", () => {
    const totals = gameTotals([
      game({ dragon_kills: 2, baron_kills: 1, objective_damage: 9000, turret_kills: 1, turret_damage: 4000, turret_plates_destroyed: 2 }),
      game({ dragon_kills: 0, baron_kills: 1, objective_damage: 3000, turret_kills: 1, turret_damage: 2000, turret_plates_destroyed: 0 }),
    ]);
    // (2+1 + 0+1) / 2 = 2 takedowns, (9000+3000)/2 = 6000 damage
    expect(totals.objectives).toBeCloseTo(2 + 6000 / 1000, 5);
    // (1+1)/2 = 1 turret, (4000+2000)/2 = 3000 damage, (2+0)/2 = 1 plate
    expect(totals.turrets).toBeCloseTo(1 + 3000 / 1000 + 1, 5);
  });

  it("treats missing columns as zero rather than NaN", () => {
    const totals = gameTotals([game()]);
    expect(totals.objectives).toBe(0);
    expect(totals.turrets).toBe(0);
  });

  it("returns zeroes for a player with no games", () => {
    expect(gameTotals([])).toEqual({ objectives: 0, turrets: 0 });
  });
});

describe("pctOf", () => {
  it("ranks a value within the cohort, 0 worst and 100 best", () => {
    expect(pctOf([1, 2, 3, 4, 5], 5)).toBe(100);
    expect(pctOf([1, 2, 3, 4, 5], 1)).toBe(0);
    expect(pctOf([1, 2, 3, 4, 5], 3)).toBe(50);
  });

  it("gives a lone player the middle rather than dividing by zero", () => {
    expect(pctOf([7], 7)).toBe(50);
  });

  it("puts everyone at the middle when the whole cohort ties", () => {
    // A week where nobody took an objective must not read as five 99s.
    expect(pctOf([0, 0, 0, 0], 0)).toBe(50);
  });
});

describe("ROLE_BARS", () => {
  it("gives all five roles exactly five bars, starting at Combat", () => {
    for (const role of ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]) {
      expect(ROLE_BARS[role], role).toHaveLength(5);
      expect(ROLE_BARS[role][0], role).toBe("combat");
    }
  });

  it("gives each role its signature measure", () => {
    expect(ROLE_BARS.TOP).toContain("turrets");
    expect(ROLE_BARS.JUNGLE).toContain("objectives");
    expect(ROLE_BARS.UTILITY).toContain("vision");
    expect(ROLE_BARS.BOTTOM).toContain("damage");
    expect(ROLE_BARS.MIDDLE).toContain("damage");
  });

  it("has a five-bar default for an unknown role", () => {
    expect(DEFAULT_BARS).toHaveLength(5);
    expect(ROLE_BARS.SOMETHING_ELSE).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/cards/measures.test.ts`
Expected: FAIL — cannot resolve module `./measures`.

- [ ] **Step 4: Write the module**

Create `src/lib/cards/measures.ts`:

```ts
// The card's stat-bar vocabulary and which five bars each role wears.
//
// Split out of build.ts because the assignment is a product decision that
// changes far more often than the rating engine around it, and because
// every measure here is a pure function of rows the engine already has.
//
// Bars are percentiles against the player's own role cohort, so a Support's
// Vision is judged against Supports and never against ADCs.

import type { CardGameRow } from "./build";

export type MeasureKey =
  | "combat"
  | "damage"
  | "economy"
  | "laning"
  | "vision"
  | "objectives"
  | "turrets"
  | "survival"
  | "presence"
  | "impact";

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  combat: "Combat",
  damage: "Damage",
  economy: "Economy",
  laning: "Laning",
  vision: "Vision",
  objectives: "Objectives",
  turrets: "Turrets",
  survival: "Survival",
  presence: "Presence",
  impact: "Impact",
};

/**
 * Five bars per role. Combat leads everywhere so cards stay comparable at a
 * glance, Impact closes everywhere, and the middle three say what the role
 * is actually for. Keyed by raw_stats' role_mode spelling.
 */
export const ROLE_BARS: Record<string, MeasureKey[]> = {
  TOP: ["combat", "laning", "turrets", "survival", "impact"],
  JUNGLE: ["combat", "objectives", "vision", "presence", "impact"],
  MIDDLE: ["combat", "damage", "laning", "presence", "impact"],
  BOTTOM: ["combat", "damage", "economy", "laning", "impact"],
  UTILITY: ["combat", "vision", "presence", "survival", "impact"],
};

/** What a card wears when its role is unknown or unrecorded. */
export const DEFAULT_BARS: MeasureKey[] = ["combat", "damage", "economy", "vision", "impact"];

export function barsForRole(roleMode: string | null | undefined): MeasureKey[] {
  return (roleMode && ROLE_BARS[roleMode]) || DEFAULT_BARS;
}

export interface GameTotals {
  /** Objective takedowns + objective damage per 1k, averaged per game. */
  objectives: number;
  /** Turret kills + turret damage per 1k + plates, averaged per game. */
  turrets: number;
}

const num = (value: number | null | undefined): number => (typeof value === "number" ? value : 0);

/**
 * Per-game objective and turret work for one player.
 *
 * Damage is divided by 1000 before being added to takedowns so a single
 * 9000-damage baron doesn't drown out the count of objectives actually
 * taken — the two live on comparable scales this way.
 */
export function gameTotals(games: CardGameRow[]): GameTotals {
  if (games.length === 0) return { objectives: 0, turrets: 0 };
  let objectives = 0;
  let turrets = 0;
  for (const game of games) {
    objectives += num(game.dragon_kills) + num(game.baron_kills) + num(game.objective_damage) / 1000;
    turrets += num(game.turret_kills) + num(game.turret_damage) / 1000 + num(game.turret_plates_destroyed);
  }
  return { objectives: objectives / games.length, turrets: turrets / games.length };
}

/**
 * Percentile (0-100) of `value` within `values` — rank position over cohort
 * size, matching how build.ts's pct() reads a PlayerAggRow field.
 *
 * A cohort of one, or one where everybody ties, returns 50: there is no
 * ranking to report, and handing out 100 would tell the reader a week in
 * which nobody took an objective was a week of five perfect scores.
 */
export function pctOf(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] === sorted[sorted.length - 1]) return 50;
  const index = sorted.indexOf(value);
  if (index === -1) return 50;
  return (index / (sorted.length - 1)) * 100;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/cards/measures.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/cards/measures.ts src/lib/cards/measures.test.ts src/lib/cards/build.ts
git commit -m "feat: add the card stat-bar vocabulary and per-role assignment"
```

---

### Task 3: Wire the bars into the engine

Replaces the fixed five bars with each role's set. This is where the change becomes visible.

**Files:**
- Modify: `src/lib/cards/build.ts` (`CardSubStat`, the `subStats` block ~line 665, `buildSeasonCards`)
- Test: `src/lib/cards/build.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produced.
- Produces: `PlayerCardData.subStats` now holds the role's five measures. `CardSubStat["key"]` widens to `MeasureKey | "form" | "clutch"`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/cards/build.test.ts`:

```ts
describe("role-aware bars", () => {
  it("gives each role its own five bars", () => {
    const cohort = cohortOf(agg());
    const cards = buildSeasonCards({
      cohort,
      gamesByPlayer: new Map([["player#na1", [gameRow({ turret_kills: 2, dragon_kills: 1 })]]]),
      gameLog: logOf({ NA1_1: 30 }),
    });
    const card = cards.find((c) => c.name === "Player")!;
    expect(card.subStats).toHaveLength(5);
    expect(card.subStats[0].key).toBe("combat");
    expect(card.subStats.at(-1)!.key).toBe("impact");
    // agg()'s role_mode is BOTTOM, so this card must wear the ADC set.
    expect(card.subStats.map((s) => s.key)).toEqual(["combat", "damage", "economy", "laning", "impact"]);
  });

  it("labels every bar and keeps values on the 20-99 scale", () => {
    const cohort = cohortOf(agg());
    const cards = buildSeasonCards({ cohort, gamesByPlayer: new Map(), gameLog: new Map() });
    for (const stat of cards[0].subStats) {
      expect(stat.label.length).toBeGreaterThan(0);
      expect(stat.value).toBeGreaterThanOrEqual(20);
      expect(stat.value).toBeLessThanOrEqual(99);
    }
  });

  it("scores objectives and turrets against the cohort's per-game work", () => {
    // Two junglers, one doing all the objective work. Both need games so the
    // objective cohort has something to rank.
    const busy = agg({ summoner_name: "Busy", role_mode: "JUNGLE" });
    const idle = agg({ summoner_name: "Idle", role_mode: "JUNGLE" });
    const cards = buildSeasonCards({
      cohort: [busy, idle, agg({ summoner_name: "Third", role_mode: "JUNGLE" }), agg({ summoner_name: "Fourth", role_mode: "JUNGLE" })],
      gamesByPlayer: new Map([
        ["busy#na1", [gameRow({ dragon_kills: 4, baron_kills: 2, objective_damage: 20000 })]],
        ["idle#na1", [gameRow({ dragon_kills: 0, baron_kills: 0, objective_damage: 0 })]],
        ["third#na1", [gameRow({ dragon_kills: 1, objective_damage: 2000 })]],
        ["fourth#na1", [gameRow({ dragon_kills: 2, objective_damage: 4000 })]],
      ]),
      gameLog: logOf({ NA1_1: 30 }),
    });
    const objectivesOf = (name: string) =>
      cards.find((c) => c.name === name)!.subStats.find((s) => s.key === "objectives")!.value;
    expect(objectivesOf("Busy")).toBeGreaterThan(objectivesOf("Idle"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cards/build.test.ts -t "role-aware bars"`
Expected: FAIL — the first test gets `["combat","economy","vision","form","clutch"]`.

- [ ] **Step 3: Widen the sub-stat key**

In `src/lib/cards/build.ts`:

```ts
import { MEASURE_LABELS, type MeasureKey, barsForRole, gameTotals, pctOf } from "./measures";

export interface CardSubStat {
  /** "form" and "clutch" are retired but stay in the union: every copy
   *  already frozen in card_inventory carries them, and the renderer prints
   *  whatever a card holds. */
  key: MeasureKey | "form" | "clutch";
  label: string;
  value: number;
}
```

- [ ] **Step 4: Compute the measures**

In `buildCard`, replace the block that computes `combat` / `economy` / `vision` / `form` / `clutch` and the `subStats: [...]` literal. Delete the old `form` and `clutch` locals — `lastFive`, `streak` and `clutchWr` are still used by the archetype facts below, so keep those.

Add a `measureValues` helper above `buildCard`:

```ts
/** Every bar's raw percentile for one player, before toStat()'s 20-99 squeeze.
 *  `objectiveCohort` and `turretCohort` are every cohort member's per-game
 *  work, which only the whole-league builder can assemble — a solo buildCard
 *  passes empty arrays and those two bars land at the middle. */
function measureValues(
  cohort: PlayerAggRow[],
  row: PlayerAggRow,
  totals: GameTotals,
  objectiveCohort: number[],
  turretCohort: number[],
): Record<MeasureKey, number> {
  const rc = roleCohort(cohort, row);
  return {
    combat: mean([
      pct(rc, row, (r) => r.kda),
      pct(rc, row, (r) => r.avg_kills),
      pct(rc, row, (r) => r.avg_kp_pct),
      pct(rc, row, (r) => r.avg_deaths, true),
    ]),
    damage: mean([pct(rc, row, (r) => r.avg_dmg_per_min), pct(rc, row, (r) => r.avg_dmg_share_pct)]),
    economy: mean([pct(rc, row, (r) => r.avg_cs_per_min), pct(rc, row, (r) => r.avg_gold_per_min)]),
    laning: mean([pct(rc, row, (r) => r.avg_cs_at_10), pct(rc, row, (r) => r.avg_gold_at_10)]),
    vision: pct(rc, row, (r) => r.avg_vision_per_min),
    survival: mean([pct(rc, row, (r) => r.avg_deaths, true), pct(rc, row, (r) => r.avg_dmg_taken_per_min, true)]),
    presence: mean([pct(rc, row, (r) => r.avg_kp_pct), pct(rc, row, (r) => r.avg_assists)]),
    impact: mean([pct(rc, row, (r) => r.avg_dmg_share_pct), pct(rc, row, (r) => r.avg_kp_pct)]),
    objectives: pctOf(objectiveCohort, totals.objectives),
    turrets: pctOf(turretCohort, totals.turrets),
  };
}
```

Add the two cohort arrays to `BuildCardInput` (optional, defaulting to empty) alongside `teamImages`:

```ts
  /** Every cohort member's per-game objective work, for the Objectives bar. */
  objectiveCohort?: number[];
  /** Every cohort member's per-game turret work, for the Turrets bar. */
  turretCohort?: number[];
```

Destructure them in `buildCard` with `objectiveCohort = []`, `turretCohort = []`, then inside `buildCard` replace the old bar computation with:

```ts
  const totals = gameTotals(games);
  const values = measureValues(cohort, row, totals, objectiveCohort, turretCohort);
  const bars = barsForRole(row.role_mode);
```

and replace the `subStats:` literal with:

```ts
    subStats: bars.map((key) => ({ key, label: MEASURE_LABELS[key], value: toStat(values[key]) })),
```

- [ ] **Step 5: Assemble the cohorts in `buildSeasonCards`**

`buildSeasonCards` already builds an `extrasByKey` map over the cohort; add the objective and turret cohorts the same way, before the `.map()` that calls `buildCard`:

```ts
  // Objective and turret work live on the per-game rows, not on the agg
  // view, so their cohort has to be assembled here where every player's
  // games are in hand.
  const totalsByKey = new Map<string, GameTotals>();
  for (const row of cohort) {
    const key = playerKey(row);
    totalsByKey.set(key, gameTotals(gamesByPlayer.get(key) ?? []));
  }
  const objectiveCohort = [...totalsByKey.values()].map((t) => t.objectives);
  const turretCohort = [...totalsByKey.values()].map((t) => t.turrets);
```

and pass them into the existing `buildCard({...})` call:

```ts
        teamImages,
        teamAbbrs,
        objectiveCohort,
        turretCohort,
```

Import the type alongside the functions: `import { ..., type GameTotals } from "./measures";`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/cards/build.test.ts src/lib/cards/measures.test.ts`
Expected: PASS. Existing tests asserting `subStats` contained `vision`/`form`/`clutch` will fail — update them to the new per-role sets, keeping a comment that the old keys survive only on frozen copies.

- [ ] **Step 7: Confirm frozen copies still render**

Run: `npx vitest run src/components/cards`
Expected: PASS. `PlayerCard3D` maps over `card.subStats` and prints `stat.label`, so a fixture carrying the old five must still render. If any card fixture in those tests declares `subStats`, leave it on the old keys deliberately — that is the frozen-copy guard.

- [ ] **Step 8: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/lib/cards/build.ts src/lib/cards/build.test.ts
git commit -m "feat: every role wears its own five stat bars"
```

---

### Task 4: Weekly editions

Scopes a drop's cards to that week's games.

**Files:**
- Modify: `src/lib/cards/queries.ts` (add `fetchWeekCards`; widen the `raw_stats` select)
- Modify: `src/lib/stats/weekly.ts` (`WEEKLY_STAT_COLUMNS`)
- Modify: `scripts/weekly-card-drop.ts` (~line 75)
- Test: `src/lib/cards/queries.test.ts`

**Interfaces:**
- Consumes: `buildSeasonCards` from Task 3, `aggregateWeeklyPlayerRows` from `src/lib/stats/weekly.ts`.
- Produces: `export async function fetchWeekCards(supabase: SupabaseClient, season: string, week: string): Promise<PlayerCardData[]>` — `week` is a Monday, `YYYY-MM-DD`.

- [ ] **Step 1: Widen the column lists**

In `src/lib/cards/queries.ts`, the `raw_stats` select inside `fetchSeasonCards` currently reads:

```ts
.select("summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, total_damage_to_champions")
```

Extract it to a shared constant above the function and add the new columns:

```ts
/** The per-game columns a card needs. Objective and turret work is only on
 *  raw_stats — stats_player_agg has no such columns — so both build paths
 *  read it here. */
const CARD_GAME_COLUMNS =
  "summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, " +
  "total_damage_to_champions, dragon_kills, baron_kills, objective_damage, turret_kills, turret_damage, " +
  "turret_plates_destroyed";
```

Use `.select(CARD_GAME_COLUMNS)` in `fetchSeasonCards`. In `src/lib/stats/weekly.ts`, add `"dragon_kills"`, `"baron_kills"`, `"objective_damage"`, `"turret_kills"`, `"turret_damage"`, `"turret_plates_destroyed"` to `WEEKLY_STAT_COLUMNS`.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/cards/queries.test.ts`:

```ts
import { fetchWeekCards } from "./queries";

describe("fetchWeekCards", () => {
  it("rates a player on the requested week's games alone", async () => {
    const inWeek = { game_date: "2026-08-17T20:00:00Z", match_id: "NA1_1" };
    const nextWeek = { game_date: "2026-08-24T20:00:00Z", match_id: "NA1_9" };
    const captured: { column: string; value: unknown }[] = [];
    const supabase = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
        chain.gte = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
        chain.lt = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
        chain.then = (resolve: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;

    await fetchWeekCards(supabase, "S5", "2026-08-17");

    // The window must be half-open on the following Monday, so a game played
    // at 23:59 Sunday counts and the next week's opener does not.
    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-17T00:00:00.000Z" });
    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-24T00:00:00.000Z" });
    void inWeek; void nextWeek;
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/cards/queries.test.ts -t "fetchWeekCards"`
Expected: FAIL — `fetchWeekCards is not a function`.

- [ ] **Step 4: Write `fetchWeekCards`**

Add to `src/lib/cards/queries.ts`:

```ts
/**
 * Every player's card for ONE week, rated against that week's cohort.
 *
 * The sibling of fetchSeasonCards, and the builder a weekly drop archives:
 * a card stops meaning "how good is this player this season" and starts
 * meaning "how did they play that week". Ratings are cohort-relative, so a
 * narrower window spreads them — which is the point, and why the curve was
 * retuned alongside this.
 *
 * `week` is a Monday (YYYY-MM-DD); the window is half-open, [Monday, next
 * Monday), so a Sunday-night game lands in the week it was played.
 */
export async function fetchWeekCards(
  supabase: SupabaseClient,
  season: string,
  week: string,
): Promise<PlayerCardData[]> {
  const start = new Date(`${week}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const [gamesResult, logResult, teamIdentity, artResult] = await Promise.all([
    supabase
      .from("raw_stats")
      .select(CARD_GAME_COLUMNS)
      .eq("season", season)
      .gte("game_date", start.toISOString())
      .lt("game_date", end.toISOString()),
    supabase.from("stats_game_log").select("match_id, duration_min, blue_team, red_team").eq("season", season),
    fetchTeamIdentity(supabase, season),
    supabase.from("card_art_prefs").select("*").eq("season", season),
  ]);

  const games = (gamesResult.data as CardGameRow[]) ?? [];
  if (games.length === 0) return [];

  // The week's own cohort: aggregate the raw rows the same way the weekly
  // standouts and the fantasy scorer do, so one rating engine answers for
  // all three.
  const cohort = aggregateWeeklyPlayerRows(games as unknown as WeeklyRawStatRow[]);

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of games) {
    const key = cardPlayerKey(game.summoner_name, game.tag);
    gamesByPlayer.set(key, [...(gamesByPlayer.get(key) ?? []), game]);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of (logResult.data as Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">[]) ?? []) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const artPrefs = new Map<string, { skin: number; motto: string | null }>();
  for (const art of ((artResult.data as { summoner_name: string; tag: string; skin: number; motto?: string | null }[]) ?? [])) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), { skin: art.skin, motto: art.motto ?? null });
  }

  return buildSeasonCards({
    cohort,
    gamesByPlayer,
    gameLog,
    teamImages: teamIdentity.badges,
    teamAbbrs: teamIdentity.abbrs,
    artPrefs,
  });
}
```

Add the import at the top of `queries.ts`:

```ts
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/cards/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Point the drop at it**

In `scripts/weekly-card-drop.ts`, the archive path currently reads (~line 75):

```ts
  const cards = await fetchSeasonCards(supabase, season);
```

The drop already knows its week — `mondayOf(new Date())` at ~line 146 and `lastCompletedWeek` at ~line 233. Pass that week down to this function and change the read to:

```ts
  // The week's cards, not the season's: an edition is a snapshot of how
  // people played that week. Weeks archived before this change stay exactly
  // as they were — this only affects drops from here on.
  const cards = await fetchWeekCards(supabase, season, editionWeek);
```

Update the import on line 19 to bring in `fetchWeekCards` alongside `fetchAllCardSeasons`, and make sure `editionWeek` is computed before this call rather than at line 146 — move the `const editionWeek = mondayOf(new Date());` above it, or thread the already-resolved `week` in from the caller. Do not change `fetchSeasonCards`'s other callers: the live hub stays season-cumulative.

- [ ] **Step 7: Verify against the local stack, never production**

The drop archives editions AND pays fantasy. `FANTASY_DRY_RUN=true` (an env
var, not a CLI flag) suppresses the fantasy writes, payouts and Discord post
— but the edition archive still writes. So verify locally.

The local stack has the bundled historical ingest (S1-S4). Point it at a
week that has games and confirm the card count is a week's worth, not a
season's:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { fetchWeekCards } from './src/lib/cards/queries';
const c = createClient('http://127.0.0.1:54321', process.env.LOCAL_ANON!);
(async () => {
  const cards = await fetchWeekCards(c, 'S4', '2026-04-06');
  console.log('cards:', cards.length, '| top:', cards[0]?.name, cards[0]?.overall, cards[0]?.tier.label);
  console.log('bars:', cards[0]?.subStats.map(s => s.key).join(', '));
})();
"
```

Expected: roughly 60 cards (one per player who played that week), a top card
in the low-to-mid 90s under the new curve, and bars matching that player's
role set. Compare against `'2026-04-13'` — a different week must produce
different ratings.

- [ ] **Step 8: Full verification and commit**

```bash
npm test && npx tsc --noEmit && npm run lint
git add src/lib/cards/queries.ts src/lib/cards/queries.test.ts src/lib/stats/weekly.ts scripts/weekly-card-drop.ts
git commit -m "feat: weekly drops rate players on that week's games"
```

---

## Deferred

**Consistency** (the all-season drop's version of slot 5) is intentionally not built. It needs a window of many games to mean anything, and the all-season drop does not exist yet — building it now would ship a measure nothing renders. When that drop is designed, add `consistency` to `MeasureKey`, define it as the share of a player's games clearing the league's median performance, and swap it into slot 5 for that drop only.

**A minimum-games threshold** was considered and rejected: confirmed 2026-08-25 that every player plays a full series each week.
