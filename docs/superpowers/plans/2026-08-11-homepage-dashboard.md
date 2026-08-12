# Homepage Broadcast Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the homepage into a responsive broadcast dashboard with FPL S5 teams shown in an initial 0–0 standings card and the existing weekly power rankings shown in a compact right rail.

**Architecture:** Keep `LeagueHub` as the server component that fetches Twitch data, weekly standouts, and featured-draft teams. Add a small typed homepage standings fetcher and a presentational `HomeStandings` component. Use a fluid CSS grid with the broadcast at roughly `2fr` and a stacked `1fr` right rail; make card headers and badges wrap naturally at narrow widths.

**Tech Stack:** Next.js 16 App Router, React 19 server components, Supabase server client, Tailwind CSS v4 utilities, Vitest + Testing Library.

## Global Constraints

- Use the configured `league_settings.featured_draft_id` as the team source; do not hardcode team names or use placeholder teams.
- Display initial standings records as `0–0`, ordered by `nomination_position`.
- Preserve existing Twitch live/offline/empty behavior and weekly-stat fetching behavior.
- Use a fluid large-screen ratio near `2fr 1fr`, then collapse to one column in broadcast → standings → power-rankings order.
- Do not force the power-score pill, headings, team names, or actions into unbreakable rows; prevent horizontal overflow at all supported widths.
- Run focused tests, the full test suite, lint, and production build before claiming completion.

---

### Task 1: Add the homepage standings data seam

**Files:**
- Create: `src/lib/home/standings.ts`
- Create: `src/lib/home/standings.test.ts`

**Interfaces:**
- Produces `HomeStandingTeam` with `id`, `name`, `abbreviation`, `nomination_position`, `wins`, and `losses`.
- Produces `fetchHomepageStandings(): Promise<HomeStandingTeam[]>`.

- [ ] **Step 1: Write the failing fetcher tests**

Mock `@/lib/supabase/server` with a chainable Supabase client and cover both the normal path and no-featured-draft path. Assert that the settings query reads `featured_draft_id`, the teams query filters by that id, orders by `nomination_position`, and returned teams map to `wins: 0` and `losses: 0`.

```ts
it("loads featured-draft teams as initial 0–0 standings", async () => {
  mockServerSupabase.mockResolvedValue(makeSupabase({
    league_settings: { data: { featured_draft_id: "draft-s5" } },
    teams: { data: [
      { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1 },
      { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2 },
    ] },
  }));

  await expect(fetchHomepageStandings()).resolves.toEqual([
    { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 0, losses: 0 },
    { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2, wins: 0, losses: 0 },
  ]);
});

it("returns no rows when no draft is featured", async () => {
  mockServerSupabase.mockResolvedValue(makeSupabase({
    league_settings: { data: { featured_draft_id: null } },
  }));

  await expect(fetchHomepageStandings()).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/lib/home/standings.test.ts`

Expected: FAIL because the standings module and fetcher do not exist.

- [ ] **Step 3: Implement the minimal typed server fetcher**

Create the `src/lib/home` directory and use `createServerSupabase()`. Query `league_settings` for `featured_draft_id` at `id = 1`; return `[]` if it is missing. Otherwise query `teams` with `draft_id = featuredDraftId`, select only the fields needed by the card, order ascending by `nomination_position`, and map each row to a `HomeStandingTeam` with zero wins and losses. Treat missing team data as `[]` and throw Supabase query errors so the homepage can use its existing async error boundary behavior.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/lib/home/standings.test.ts`

Expected: PASS.

### Task 2: Build the compact standings card

**Files:**
- Create: `src/components/home/HomeStandings.tsx`
- Create: `src/components/home/HomeStandings.test.tsx`

**Interfaces:**
- Consumes `teams: HomeStandingTeam[]`.
- Produces an accessible `article` named “team standings” with resilient rows and an explicit empty state.

- [ ] **Step 1: Write the failing component tests**

Cover all required visible states and classes. Assert that every input team appears with `0–0`, that rank numbers use nomination order, and that the no-team copy appears without rendering a fake team.

```tsx
it("renders every featured team with an initial 0–0 record", () => {
  render(<HomeStandings teams={[team("Alpha", 1), team("Bravo", 2)]} />);
  expect(screen.getByRole("article", { name: /team standings/i })).toBeTruthy();
  expect(screen.getByText("Alpha")).toBeTruthy();
  expect(screen.getAllByText("0–0")).toHaveLength(2);
});

it("renders a no-data state without placeholder teams", () => {
  render(<HomeStandings teams={[]} />);
  expect(screen.getByText(/standings will appear once/i)).toBeTruthy();
  expect(screen.queryByText("Alpha")).toBeNull();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/components/home/HomeStandings.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the responsive card**

Render a `card-brand` article with a flexible header, a compact “TEAM STANDINGS” label, a title, and a small “0–0” status indicator. Render rows with CSS grid columns for rank, flexible team identity, and record; use `min-w-0` plus `truncate` on the name and avoid fixed-width text containers. Keep copy and row separators consistent with the existing brand cards. Use `text-nowrap` only on the record value, not on the full header.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/components/home/HomeStandings.test.ts`

Expected: PASS.

### Task 3: Recompose the homepage and harden compact power rankings

**Files:**
- Modify: `src/components/home/LeagueHub.tsx`
- Modify: `src/components/home/WeeklyStandouts.tsx`
- Modify: `src/components/home/LeagueHub.test.tsx`
- Modify: `src/components/home/WeeklyStandouts.test.tsx`

**Interfaces:**
- `LeagueHub` calls `fetchHomepageStandings()` and passes its result to `HomeStandings`.
- `WeeklyStandouts` keeps the existing `standouts: WeeklyStandout[]` prop and `/stats` link.

- [ ] **Step 1: Update failing homepage tests for the dashboard structure**

Replace assertions about the removed hero region with assertions for a `main` dashboard region containing the broadcast, standings, and weekly standouts. Assert the dashboard class contains a fluid two-column grid and that the right rail is a vertical stack. Mock the new standings fetcher alongside the existing Twitch and weekly fetchers so the server component test remains deterministic.

```tsx
expect(screen.getByRole("region", { name: /homepage dashboard/i })).toHaveClass(
  "lg:grid-cols-[2fr_1fr]",
);
expect(screen.getByRole("article", { name: /team standings/i })).toBeTruthy();
expect(screen.getByRole("article", { name: /latest week's standouts/i })).toBeTruthy();
```

- [ ] **Step 2: Run the focused homepage tests to verify the expected failures**

Run: `npm test -- src/components/home/LeagueHub.test.tsx src/components/home/WeeklyStandouts.test.tsx`

Expected: FAIL on the new dashboard/standings assertions before the implementation changes.

- [ ] **Step 3: Implement the dashboard composition**

In `LeagueHub`, fetch the standings in parallel with Twitch status and weekly standouts where possible. Remove the old hero intro and render a labeled dashboard section. Place `TwitchShowcase` first, then a right-rail `<div>` containing `HomeStandings` and `WeeklyStandouts`. Use `grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8` and let the cards define their own height; no fixed heights or desktop-only assumptions.

- [ ] **Step 4: Make `WeeklyStandouts` safe at narrow widths**

Change the outer card to compact padding/min-height appropriate for a right rail. Make the header `flex-wrap`, allow the heading block to shrink with `min-w-0`, and let the “Power score” pill use `shrink-0` only for its own content while moving below the heading when needed. Use a smaller responsive display heading so it does not force horizontal overflow. Preserve all existing rows, empty state, and `/stats` link.

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/components/home/LeagueHub.test.tsx src/components/home/WeeklyStandouts.test.tsx src/components/home/HomeStandings.test.tsx`

Expected: PASS.

### Task 4: Verify responsive behavior and production readiness

**Files:**
- Modify only files required by lint/build feedback; do not change unrelated user files.

- [ ] **Step 1: Run the full automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit successfully with no new warnings that indicate broken homepage code.

- [ ] **Step 2: Inspect the rendered homepage at representative widths**

Use the existing Playwright/local app setup to inspect at approximately 1440px, 1024px, 768px, and 390px widths. Confirm the broadcast is dominant at desktop, the two right-rail cards stack, the layout becomes one column below the large-screen breakpoint, long team names do not create horizontal scroll, the power-score pill wraps or drops below the heading, and the iframe remains aspect-ratio based.

- [ ] **Step 3: Run the final focused regression checks**

Run: `npm test -- src/components/home src/lib/home`

Expected: PASS for all homepage and standings tests.

- [ ] **Step 4: Review the diff and report workspace limitations**

Run: `git diff --check` and `git status --short`. Confirm only the intended homepage files plus the plan/spec documents are changed; preserve existing unrelated untracked assets. If git staging/commit remains blocked by `.git/index.lock` permissions, report that limitation without attempting destructive workarounds.
