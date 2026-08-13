# Header Navigation Dropdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the shared header so Home is represented only by the logo, Premium appears before Info, and Info contains Sign Up, League Links, and Rulebook while Premium contains Betting and Draft League.

**Architecture:** Keep the existing client-side `SiteNavigation` component as the single source of truth. Represent the two dropdowns as controlled button/menu groups in that component, sharing the existing mobile-menu close behavior and adding outside-click, Escape, and route-change cleanup. Extend the existing component test suite before changing production code.

**Tech Stack:** Next.js 16 App Router, React 19 client component state/effects, `next/link`, Vitest, Testing Library, Tailwind utility classes.

## Global Constraints

- Keep the FPL logo linked to `/` and remove only the visible Home nav item.
- Put `Sign Up` under the Info dropdown at `/signup`.
- Put `League Links` under Info at `/info#league-resources`.
- Put `Rulebook` under Info at `/info#rulebook-heading`.
- Put `Betting` at `/betting` and `Draft League` at `https://www.draftleague.lol/` under Premium.
- Render Premium before Info in the primary navigation order.
- The Draft League link opens a new tab with `rel="noopener noreferrer"`.
- Dropdown triggers use `aria-haspopup="menu"` and reflect state with `aria-expanded`.
- Dropdowns close on link selection, Escape, route changes, and outside clicks.
- Preserve existing responsive layout, styling vocabulary, auth slot, and unrelated working-tree changes.

---

### Task 1: Add the navigation behavior contract

**Files:**
- Modify: `src/components/SiteNavigation.test.tsx`
- Reference: `src/components/SiteNavigation.tsx`

**Interfaces:**
- Consumes: Existing `SiteNavigation` render API and mocked `usePathname` hook.
- Produces: Test coverage that defines the new visible navigation and dropdown interaction behavior before implementation.

- [ ] **Step 1: Replace the old primary-link assertions with the new structure assertions**

Update the existing route test so `Home`, `Betting`, and `Sign Up` are not visible as top-level links. Keep assertions for the unchanged links, and assert the logo still has `href="/"`. Assert the new `Info` and `Premium` controls exist as buttons rather than links.

- [ ] **Step 2: Add a failing test for the Info dropdown**

Add a test that clicks the `Info menu` button, verifies `aria-expanded="true"`, finds the `Sign Up` link with `href="/signup"`, then clicks the trigger again and verifies `aria-expanded="false"`.

- [ ] **Step 3: Add a failing test for the Premium dropdown and external destination**

Add a test that clicks the `Premium menu` button, verifies the `Betting` link points to `/betting`, and verifies the `Draft League` link has `href="https://www.draftleague.lol/"`, `target="_blank"`, and `rel="noopener noreferrer"`.

- [ ] **Step 4: Add failing close-behavior tests**

Add tests showing that an open dropdown closes when Escape is dispatched and when a dropdown link is clicked. Use the existing `fireEvent` style and query the trigger’s `aria-expanded` value for the observable contract.

- [ ] **Step 5: Run the focused tests and verify they fail for the missing behavior**

Run:

```bash
npm test -- src/components/SiteNavigation.test.tsx
```

Expected: the suite fails because the current flat nav still renders Home, Betting, and Sign Up as links and does not expose Info/Premium menu buttons.

### Task 2: Implement controlled Info and Premium dropdowns

**Files:**
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/app/info/page.tsx`
- Test: `src/components/SiteNavigation.test.tsx`

**Interfaces:**
- Consumes: The failing behavior tests from Task 1.
- Produces: A responsive, accessible `SiteNavigation` with `Info` and `Premium` menu buttons and the requested destinations.

- [ ] **Step 1: Replace the flat nav data with grouped navigation definitions**

Remove the Home item and the top-level Betting and Sign Up items. Keep the other primary links, and add grouped definitions for:

```ts
const DROPDOWN_LINKS = {
  info: [
    { href: "/signup", label: "Sign Up" },
    { href: "/info#league-resources", label: "League Links" },
    { href: "/info#rulebook-heading", label: "Rulebook" },
  ],
  premium: [
    { href: "/betting", label: "Betting" },
    {
      href: "https://www.draftleague.lol/",
      label: "Draft League",
      target: "_blank",
      rel: "noopener noreferrer",
    },
  ],
} as const;
```

Keep `/betting` as an internal Next link and use the external-link attributes only for Draft League.

- [ ] **Step 2: Put Premium before Info and expose the League Links anchor**

Order `DROPDOWNS` as Premium followed by Info. In `src/app/info/page.tsx`, add `id="league-resources"` to the existing section with `aria-label="League resources"`; keep the existing `rulebook-heading` id unchanged.

- [ ] **Step 3: Add state and IDs for the active dropdown**

Add a state value such as `openDropdown: "info" | "premium" | null`, plus stable IDs for each menu using `useId`. Preserve the current mobile `open` state and route-change reset. When the mobile menu closes because of a route change or link click, also reset `openDropdown`.

- [ ] **Step 4: Add outside-click cleanup**

Create a ref around the header or navigation region and register a document-level pointer handler only while a dropdown is open. If the event target is outside that ref, set `openDropdown` to `null`. Keep the existing Escape handler and make Escape close the dropdown first; when no dropdown is open, it should close the mobile menu as it does today.

- [ ] **Step 5: Render the grouped menu buttons and links**

Render Info and Premium as buttons with `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`. Render each menu with `role="menu"` and its links with `role="menuitem"`. Use the existing focus classes and responsive utility classes so menus are inline within the mobile panel and positioned below their trigger on desktop. Clicking a trigger toggles that dropdown and closes the other dropdown.

- [ ] **Step 6: Preserve active-route behavior**

Apply `aria-current="page"` to the Info or Premium trigger when one of its internal links is active, including `/betting` descendants. Do not mark the external Draft League link active based on the local pathname. Keep the logo’s `aria-label="FPL home"` and existing auth slot intact.

- [ ] **Step 7: Run the focused test suite and fix only implementation issues**

Run:

```bash
npm test -- src/components/SiteNavigation.test.tsx
```

Expected: all navigation tests pass, including the new dropdown and close-behavior assertions.

### Task 3: Run project verification

**Files:**
- No additional files.

**Interfaces:**
- Consumes: The tested navigation implementation.
- Produces: Fresh evidence that the navigation change does not break linting or the production build.

- [ ] **Step 1: Run the full Vitest suite**

Run:

```bash
npm test
```

Expected: exit code `0` with no failed tests.

- [ ] **Step 2: Run ESLint**

Run:

```bash
npm run lint
```

Expected: exit code `0` with no lint errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: exit code `0` and successful Next.js production compilation.

- [ ] **Step 4: Review the final diff and working tree**

Run:

```bash
git diff -- src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx
git status --short
```

Confirm only the intended navigation files were modified by implementation and all pre-existing untracked files remain untouched.
