# Wide Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FPL landing page use the same wide desktop container, gutters, and spacing rhythm as the Teams and Players directories.

**Architecture:** Keep `LeagueHub` as the landing-page composition and make a focused Tailwind class-only update to its existing shell and hero grid. Add a targeted render assertion for the layout classes so the intended wide shell and responsive gap are protected without changing content or behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the existing two-column hero and mobile stacking behavior.
- Use `max-w-[1800px]`, `px-4 sm:px-6`, and `py-12 sm:py-16` on the landing-page shell.
- Use `gap-8 xl:gap-12` on the hero grid.
- Preserve all copy, links, Twitch behavior, card content, routing, and global styles.
- Modify only `src/components/home/LeagueHub.tsx` and its focused test, plus this plan/spec documentation.

---

### Task 1: Widen the landing-page shell and hero spacing

**Files:**
- Modify: `src/components/home/LeagueHub.tsx`
- Modify: `src/components/home/LeagueHub.test.tsx`

**Interfaces:**
- Consumes: the existing `LeagueHub` component with no props.
- Produces: the same rendered landing-page content and links, with the wide responsive layout classes applied.

- [ ] **Step 1: Add a failing layout assertion**

In the existing `LeagueHub` test, render the component and assert the main shell and hero section expose the approved classes:

```tsx
it("uses the wide directory spacing on desktop", () => {
  render(<LeagueHub />);

  const main = screen.getByRole("main");
  expect(main.firstElementChild).toHaveClass(
    "max-w-[1800px]",
    "px-4",
    "sm:px-6",
    "py-12",
    "sm:py-16",
  );
  expect(screen.getByRole("region", { name: /the league never stops/i })).toHaveClass(
    "gap-8",
    "xl:gap-12",
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing classes**

Run: `npm test -- src/components/home/LeagueHub.test.tsx`

Expected: the existing broadcast test passes, while the new layout test fails because the current shell still uses `max-w-7xl`, `px-6`, and `py-10`, and the grid still uses `gap-5`.

- [ ] **Step 3: Apply the minimal class-only implementation**

In `LeagueHub.tsx`, change the shell and section classes as follows:

```tsx
<div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
  <section
    aria-labelledby="league-title"
    className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] xl:gap-12"
  >
```

Leave the hero copy, links, card, and all child classes unchanged.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- src/components/home/LeagueHub.test.tsx`

Expected: both tests pass with no warnings or errors.

- [ ] **Step 5: Check the focused diff**

Run: `git diff --check && git diff -- src/components/home/LeagueHub.tsx src/components/home/LeagueHub.test.tsx`

Expected: no whitespace errors and only the approved layout/test changes are present.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/components/home/LeagueHub.tsx src/components/home/LeagueHub.test.tsx
git commit -m "style: widen landing page layout"
```

### Task 2: Verify the complete change

**Files:**
- Verify: `src/components/home/LeagueHub.tsx`
- Verify: `src/components/home/LeagueHub.test.tsx`

**Interfaces:**
- Consumes: the completed landing-page class update from Task 1.
- Produces: verification evidence that existing behavior and the production app remain intact.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

Expected: Vitest exits with code 0 and reports zero failed tests.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: ESLint exits with code 0 and reports zero errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build -- --webpack`

Expected: Next.js exits with code 0 and the existing route set builds successfully.

- [ ] **Step 4: Recheck the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated pre-existing untracked files remain untouched.

- [ ] **Step 5: Inspect responsive layout**

Open the landing page at a mobile width, normal desktop width, and very wide desktop width. Confirm the hero stacks below the existing `lg` breakpoint, remains two columns on desktop, and uses the available wide canvas with the larger gap at `xl` widths.
