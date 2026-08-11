# Homepage Upcoming Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive homepage schedule card that advances strictly from Week 1 through Week 5 as each week’s fixtures receive results and links to the matching Schedule-page section.

**Architecture:** Add a pure schedule progression helper that selects the first incomplete regular-season stage without skipping empty weeks. Add a server-side homepage schedule fetcher that resolves the newest season and returns the active stage plus fixtures. Render those fixtures through a focused homepage component that reuses `FixtureCard`; add stable stage IDs to the Schedule page for deep links.

**Tech Stack:** Next.js 16 App Router, React 19 server components, Supabase server client, Tailwind CSS v4, Vitest + Testing Library.

## Global Constraints

- Advance strictly through `week_1` → `week_2` → `week_3` → `week_4` → `week_5`.
- A week remains active until every fixture row in that week has both scores recorded.
- Never skip a week because a later week has data.
- If the active week has no fixture rows, show “Schedule coming soon” while linking to that week.
- After Week 5 is complete, show a regular-season-complete state and do not select gauntlet/playoff stages.
- Keep fixture rows responsive and preserve the existing Schedule-page formatting.
- Run the clean test suite excluding unrelated `.worktrees/**` and `e2e/**`, targeted lint, and a production build.

---

### Task 1: Implement strict regular-season progression

**Files:**
- Modify: `src/lib/schedule/format.ts`
- Modify: `src/lib/schedule/format.test.ts`

**Interfaces:**
- Produces `REGULAR_SEASON_STAGES` and `selectActiveRegularSeasonStage(rows: FixtureRow[]): FixtureStage | null`.

- [ ] **Step 1: Write failing progression tests**

Add fixture factories and tests covering incomplete Week 1 → `week_1`, completed Week 1 → `week_2`, completed Week 1 with no Week 2 rows → `week_2`, and all five weeks complete → `null`.

```ts
expect(selectActiveRegularSeasonStage([fixture("week_1", null, null)])).toBe("week_1");
expect(selectActiveRegularSeasonStage([fixture("week_1", 2, 1)])).toBe("week_2");
expect(selectActiveRegularSeasonStage([fixture("week_1", 2, 1), fixture("week_3", null, null)])).toBe("week_2");
expect(selectActiveRegularSeasonStage(allFiveWeeksComplete())).toBeNull();
```

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run: `npm test -- src/lib/schedule/format.test.ts`

Expected: FAIL because the new stage list and selector do not exist.

- [ ] **Step 3: Implement the pure selector**

Export `REGULAR_SEASON_STAGES = ["week_1", "week_2", "week_3", "week_4", "week_5"] as const`. For each stage, filter rows by stage; return the first stage whose filtered rows are empty or contain any row where `hasResult` is false. Return `null` only when every stage has at least one fixture and every fixture has a result.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `npm test -- src/lib/schedule/format.test.ts`

Expected: PASS.

### Task 2: Add the homepage schedule data boundary

**Files:**
- Create: `src/lib/home/schedule.ts`
- Create: `src/lib/home/schedule.test.ts`

**Interfaces:**
- Produces `HomepageScheduleData` with `season: string | null`, `activeStage: FixtureStage | null`, and `fixtures: FixtureRow[]`.
- Produces `fetchHomepageSchedule(): Promise<HomepageScheduleData>`.

- [ ] **Step 1: Write failing fetcher tests**

Mock the server Supabase client and verify it resolves the newest season, selects the strict active stage, filters returned fixtures to that stage, and returns the Week 1 empty state when no fixture rows exist. Use rows for two seasons to prove the newest season is selected.

```ts
await expect(fetchHomepageSchedule()).resolves.toMatchObject({
  season: "S5",
  activeStage: "week_1",
  fixtures: expect.arrayContaining([expect.objectContaining({ stage: "week_1" })]),
});
```

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

Run: `npm test -- src/lib/home/schedule.test.ts`

Expected: FAIL because the module and fetcher do not exist.

- [ ] **Step 3: Implement the server fetcher**

Query `fixtures` with `select("*")`, cast to `FixtureRow[]`, derive seasons with `seasonsOf`, select the newest season with `resolveSeason`, filter rows to that season, call `selectActiveRegularSeasonStage`, and return only rows whose `stage` equals the selected active stage. Return `{ season: null, activeStage: "week_1", fixtures: [] }` when no fixtures exist so the homepage still links to Week 1.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `npm test -- src/lib/home/schedule.test.ts`

Expected: PASS.

### Task 3: Render the homepage schedule card

**Files:**
- Create: `src/components/home/UpcomingSchedule.tsx`
- Create: `src/components/home/UpcomingSchedule.test.tsx`
- Modify: `src/components/home/LeagueHub.tsx`
- Modify: `src/components/home/LeagueHub.test.tsx`

**Interfaces:**
- `UpcomingSchedule` consumes `HomepageScheduleData` and renders the active week, fixture rows, state copy, and Schedule link.
- `LeagueHub` fetches `fetchHomepageSchedule()` in parallel with the existing homepage data fetches.

- [ ] **Step 1: Write failing component tests**

Cover fixture rendering and link generation, empty active-week state, and regular-season-complete state. Add a homepage test asserting the card appears below the dashboard.

```tsx
expect(screen.getByRole("article", { name: /upcoming schedule/i })).toBeTruthy();
expect(screen.getByText("Alpha")).toBeTruthy();
expect(screen.getByRole("link", { name: /view full schedule/i })).toHaveAttribute(
  "href",
  "/schedule#week_1",
);
```

- [ ] **Step 2: Run focused tests and confirm the expected failure**

Run: `npm test -- src/components/home/UpcomingSchedule.test.tsx src/components/home/LeagueHub.test.tsx`

Expected: FAIL because the component is missing and LeagueHub has no schedule card.

- [ ] **Step 3: Implement the card and homepage wiring**

Render a full-width `card-brand` article below the existing dashboard. Use `stageMeta(activeStage)` for the week title/note, render `FixtureCard` rows when available, show “Schedule coming soon” for empty active weeks, and show “Regular season complete” when `activeStage` is null. Build the link as `/schedule#${activeStage}` for the newest season and `/schedule?season=${encodeURIComponent(season)}#${activeStage}` for older seasons. Keep the header wrapping and link touch-friendly.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `npm test -- src/components/home/UpcomingSchedule.test.tsx src/components/home/LeagueHub.test.tsx src/lib/home/schedule.test.ts`

Expected: PASS.

### Task 4: Add Schedule-page anchors and verify the feature

**Files:**
- Modify: `src/app/schedule/page.tsx`
- Modify: `src/app/schedule/page.test.tsx` if an existing page test file is present or needed for the new IDs.

- [ ] **Step 1: Add stable IDs to every stage section**

Set each group stage section’s id to `meta.stage` so `/schedule#week_1` and later links land on the matching section. Preserve all existing content and admin behavior.

- [ ] **Step 2: Run the clean automated checks**

Run:

```bash
npx vitest run --exclude '.worktrees/**' --exclude 'e2e/**'
npx eslint src/components/home src/lib/home src/lib/schedule src/app/schedule/page.tsx
npx next build --webpack
git diff --check
```

Expected: all commands exit successfully; the clean suite includes the new progression, data, component, and anchor coverage.

- [ ] **Step 3: Review responsive classes and final diff**

Confirm the card is full-width below the dashboard, the header uses wrapping flex layout, `FixtureCard` remains responsive, and only intended files plus the approved spec/plan are changed. Preserve unrelated untracked assets and report any `.git` permission limitation without destructive cleanup.
