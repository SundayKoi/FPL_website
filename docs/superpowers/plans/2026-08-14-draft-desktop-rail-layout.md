# Draft Desktop Rail Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop draft board wider with all teams in a left rail and a sticky, internally scrolling chat rail on the right while preserving the mobile/tablet stack.

**Architecture:** Keep `DraftBoard` as the single layout and state orchestration point. Replace the current my-team-only desktop aside with a responsive three-column grid: teams, auction workspace, and chat. Add an optional class hook to `DraftChat` so its existing behavior is unchanged below desktop.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 utilities, Vitest/Testing Library, ESLint.

## Global Constraints

- No database, route, API, realtime, permission, or draft-state changes.
- Desktop rails activate at the existing `lg` breakpoint.
- Mobile/tablet order remains auction workspace, chat, player pool, then teams.
- Setup, loading, not-found, and completed-draft states remain full-width.
- Keep `DraftChat` mounted exactly once.

---

### Task 1: Add layout regression coverage

**Files:**
- Modify: `src/components/draft/DraftBoard.test.tsx`

**Interfaces:**
- Consumes: existing `DraftBoard` test mocks and draft fixture patterns.
- Produces: assertions for the desktop shell hooks and single chat/team-region structure.

- [ ] **Step 1: Write the failing test**

Add a loaded live-draft fixture test that asserts the board exposes a named teams region, a named desktop chat rail, and renders each team once. Use accessible labels or stable `data-testid` hooks only where the existing markup has no semantic label.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/components/draft/DraftBoard.test.tsx`

Expected: FAIL because the current board does not expose the new regions and only renders the current team in the desktop aside.

- [ ] **Step 3: Keep the test focused**

Do not assert pixel dimensions, Tailwind class strings, or browser viewport behavior in the component test. The test should protect the semantic structure and avoid coupling to CSS implementation.

### Task 2: Implement the responsive rail layout

**Files:**
- Modify: `src/components/draft/DraftBoard.tsx`
- Modify: `src/components/draft/DraftChat.tsx`

**Interfaces:**
- Consumes: existing `useDraftState`, `TeamColumn`, `PlayerPool`, and `DraftChat` props.
- Produces: a single responsive grid with all teams on the left, auction content in the center, and chat on the right.

- [ ] **Step 1: Write the minimal layout change**

In `DraftBoard`, widen the main shell and replace the current active-draft flex layout with a responsive grid. Use responsive ordering so the grid children render on narrow screens as workspace, chat, player pool, teams. Place all `teams.map(...)` cards in the left region and preserve `isNominator` and `isMyTeam` props.

- [ ] **Step 2: Add the chat rail styling hook**

In `DraftChat`, accept an optional `className` prop and merge it onto the outer section. Keep the existing compact message list defaults, while passing desktop-only classes from `DraftBoard` that make the rail sticky and viewport-height constrained. Add desktop-only flex sizing to the message list so it becomes the internal scroll container.

- [ ] **Step 3: Run the focused test to verify it passes**

Run: `npm test -- src/components/draft/DraftBoard.test.tsx src/components/draft/DraftChat.test.tsx`

Expected: PASS with no changes to draft state or chat behavior tests.

### Task 3: Verify the full change

**Files:**
- Modify: `docs/superpowers/plans/2026-08-14-draft-desktop-rail-layout.md`

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: exit 0 with zero failed tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 with zero errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0 with the Next.js production build completing successfully.

- [ ] **Step 4: Review the diff and update this checklist**

Run: `git diff --check` and `git diff --stat`.

Expected: no whitespace errors; only the approved spec/plan and draft layout implementation files are staged for commit.

- [ ] **Step 5: Commit and push**

Run:

```bash
git add docs/superpowers/specs/2026-08-14-draft-desktop-rail-layout-design.md docs/superpowers/plans/2026-08-14-draft-desktop-rail-layout.md src/components/draft/DraftBoard.tsx src/components/draft/DraftBoard.test.tsx src/components/draft/DraftChat.tsx
git commit -m "feat: rearrange draft desktop rails"
git push origin main
```

Expected: commit succeeds and `origin/main` advances to the new commit.
