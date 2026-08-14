# Draft Rail Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent and bulk team-card collapse controls, make the chat rail sticky as a whole, and compact the filtered player pool while preserving drafted-player strike-through behavior.

**Architecture:** Keep `TeamColumn` responsible for local open/closed state and let `DraftBoard` broadcast a bulk target state. Keep `DraftChat` data behavior unchanged while moving sticky sizing to its rail wrapper. Add a presentation-only compact prop to `PlayerPool`.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Vitest/Testing Library.

## Global Constraints

- All teams start expanded; individual toggles and bulk controls remain available on every viewport.
- Bulk collapse/expand must still allow an individual card to be reopened afterward.
- Chat remains normal-flow below desktop and internally scrollable on desktop.
- Player search, role filters, alphabetical ordering, team display, and drafted-player strike-through remain unchanged.
- No database, route, realtime, or draft-action changes.

---

### Task 1: Test team collapse interactions

**Files:**
- Modify: `src/components/draft/TeamColumn.test.tsx`

- [ ] **Step 1: Add failing tests**

Cover expanded-by-default rendering, individual collapse/expand through an accessible button, and bulk target changes that collapse all then permit a single card to reopen.

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- src/components/draft/TeamColumn.test.tsx`

Expected: the new interaction tests fail because `TeamColumn` has no state or toggle prop.

### Task 2: Implement team controls and board bulk action

**Files:**
- Modify: `src/components/draft/TeamColumn.tsx`
- Modify: `src/components/draft/DraftBoard.tsx`
- Modify: `src/components/draft/DraftBoard.test.tsx`

- [ ] **Step 1: Add local TeamColumn state**

Add `useState(false)` for collapsed state, an effect keyed by the bulk target prop, and an accessible `Expand team`/`Collapse team` button. Keep the header visible when collapsed and hide roster/budget content until expanded.

- [ ] **Step 2: Add the rail bulk control**

Add `collapseAll` state and a `Collapse all`/`Expand all` button above the team cards. Pass the current bulk target to each `TeamColumn`; preserve all existing highlight props and render every team once.

- [ ] **Step 3: Extend board tests**

Assert the bulk button exists in the teams rail and the existing team/chat semantic regions remain present.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/components/draft/TeamColumn.test.tsx src/components/draft/DraftBoard.test.tsx`

Expected: all focused tests pass.

### Task 3: Finish sticky chat and compact player pool

**Files:**
- Modify: `src/components/draft/DraftBoard.tsx`
- Modify: `src/components/draft/DraftChat.tsx`
- Modify: `src/components/draft/PlayerPool.tsx`

- [ ] **Step 1: Move sticky sizing to the rail wrapper**

Make the desktop chat `<aside>` the sticky element with `self-start`, top offset, viewport height, and overflow containment. Keep the chat panel’s internal message list as the scroll region and remove redundant inner sticky positioning.

- [ ] **Step 2: Add PlayerPool compact presentation**

Add a `compact` prop defaulting to false. Pass `compact` from `DraftBoard` and use it only to reduce panel padding, filter control sizing, grid gaps, and row typography/padding. Preserve all existing filtering and sold-player classes.

- [ ] **Step 3: Run draft tests**

Run: `npm test -- src/components/draft`

Expected: all draft tests pass.

### Task 4: Verify, commit, and push

- [ ] **Step 1: Run lint and build**

Run: `npm run lint` and `npx next build --webpack`.

Expected: lint passes; build compiles and reports only unrelated existing repository errors if present.

- [ ] **Step 2: Review changes**

Run: `git diff --check`, inspect the diff, and confirm unrelated files remain unstaged.

- [ ] **Step 3: Commit and push**

Stage only the new plan, spec, and implementation/test files, commit with `feat: add draft rail interactions`, then push `main` without force-pushing.
