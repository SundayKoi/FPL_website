# Wide Directory Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the players and teams directory layouts for desktop readability while preserving mobile stacking.

**Architecture:** Make focused Tailwind class changes in the two existing directory components. Players gets a wide desktop grid with single-line names and localized horizontal scrolling; Teams gets a larger shell and a fourth card column only at very wide screens.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Vitest.

## Global Constraints

- Players uses a larger desktop page container `max-w-[1800px]`.
- Players uses `whitespace-nowrap` for player names and a desktop minimum grid width with localized horizontal scrolling.
- Teams uses the same larger desktop page container.
- Teams remains three columns at `xl` and uses four columns at `2xl`.
- Mobile stacking behavior remains unchanged.
- Modify only `src/components/players/PlayersDirectory.tsx` and `src/components/teams/TeamsDirectory.tsx`.

---

### Task 1: Widen the players directory

**Files:**
- Modify: `src/components/players/PlayersDirectory.tsx`
- Test: `src/components/players/PlayersDirectory.test.tsx` (run unchanged behavior tests)

**Interfaces:**
- Consumes and produces the existing `PlayersDirectory` props and season behavior unchanged.

- [ ] **Step 1: Record the current focused test baseline**

Run: `npm test -- src/components/players/PlayersDirectory.test.tsx`

Expected: the existing three player-directory tests pass before the class-only change.

- [ ] **Step 2: Widen the desktop shell and grid**

In `PlayersDirectory.tsx`:

```tsx
<div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
```

Change the player directory section to provide local desktop scrolling and the grid to maintain a wider five-column canvas:

```tsx
<section aria-label="Player directory" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
  <div className="grid gap-5 sm:grid-cols-2 xl:min-w-[1500px] xl:grid-cols-5">
```

Add `whitespace-nowrap` to the player-name link while keeping its existing focus, hover, and truncation-related classes. Do not change season state, data, links, role order, labels, or mobile breakpoints.

- [ ] **Step 3: Run the focused tests and diff check**

Run: `npm test -- src/components/players/PlayersDirectory.test.tsx` and `git diff --check`.

Expected: three tests pass and no whitespace errors occur.

- [ ] **Step 4: Commit the players layout change**

```bash
git add src/components/players/PlayersDirectory.tsx
git commit -m "style: widen players directory"
```

### Task 2: Widen the teams directory

**Files:**
- Modify: `src/components/teams/TeamsDirectory.tsx`
- Test: `src/components/teams/TeamsDirectory.test.tsx` (run unchanged behavior tests)

**Interfaces:**
- Consumes and produces the existing `TeamsDirectory` props and roster/admin behavior unchanged.

- [ ] **Step 1: Record the current focused test baseline**

Run: `npm test -- src/components/teams/TeamsDirectory.test.tsx`

Expected: the existing two TeamsDirectory tests pass before the class-only change.

- [ ] **Step 2: Widen the teams shell and very-wide roster grid**

Change the page shell to:

```tsx
<div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
```

Change the placeholder roster grid to:

```tsx
<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
```

Leave `rosterContent` rendering unchanged so admin editing continues to own its layout.

- [ ] **Step 3: Run the focused tests and diff check**

Run: `npm test -- src/components/teams/TeamsDirectory.test.tsx` and `git diff --check`.

Expected: two tests pass and no whitespace errors occur.

- [ ] **Step 4: Commit the teams layout change**

```bash
git add src/components/teams/TeamsDirectory.tsx
git commit -m "style: widen teams directory"
```

### Task 3: Verify the combined layout change

**Files:**
- Modify only the two directory components if a concrete verification issue is found.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

Expected: all project tests pass; if nested worktrees are present, run `npx vitest run --exclude '.worktrees/**'` to avoid discovering duplicate external worktree tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: zero errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build -- --webpack`

Expected: exit 0 and the existing route list remains intact.

- [ ] **Step 4: Inspect the rendered result**

At desktop width, confirm the players directory has a wider five-column canvas and single-line player names, and the teams page uses the additional width/fourth column only on very wide screens. Confirm mobile still stacks the content.
