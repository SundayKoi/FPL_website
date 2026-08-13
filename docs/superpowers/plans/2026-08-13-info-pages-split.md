# Info Pages Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split League Links and Rulebook into separate App Router pages and update the Info dropdown to those routes.

**Architecture:** Add a shared server helper for info-resource fallback loading and admin detection. Recompose the current combined `/info` route into `/league-links`, `/rulebook`, and a small `/info` hub using existing components.

**Tech Stack:** Next.js 16 App Router server pages, React 19, Vitest, Testing Library, existing Supabase server helper, existing Tailwind utility styling.

## Global Constraints

- Keep the header dropdown order as Premium followed by Info.
- Keep Sign Up under Info at `/signup`.
- Move League Links under Info to `/league-links`.
- Move Rulebook under Info to `/rulebook`.
- Keep Betting and Draft League under Premium unchanged.
- Preserve the existing editable `info_resources` data model.
- Preserve unrelated working-tree changes.

---

### Task 1: Write the route contract tests

**Files:**
- Modify: `src/components/SiteNavigation.test.tsx`
- Modify: `src/app/info/page.test.tsx`
- Create: `src/app/league-links/page.test.tsx`
- Create: `src/app/rulebook/page.test.tsx`

**Interfaces:**
- Consumes: Existing async server page test pattern and Supabase mock style.
- Produces: Failing tests that define the new route split before app code changes.

- [ ] **Step 1: Update the SiteNavigation Info dropdown assertions**

Change the existing Info dropdown expectations so `League Links` has `href="/league-links"` and `Rulebook` has `href="/rulebook"`.

- [ ] **Step 2: Replace the combined Info page test with hub expectations**

Assert `/info` renders an `Info` heading, a link named `League Links` pointing to `/league-links`, a link named `Rulebook` pointing to `/rulebook`, and a link named `Sign Up` pointing to `/signup`.

- [ ] **Step 3: Add a League Links page test**

Mock `createServerSupabase` so there is no signed-in user and no resource rows. Render `LeagueLinksPage()` and assert:

```ts
expect(screen.getByRole("heading", { name: "League Links", level: 1 })).toBeTruthy();
expect(screen.getByRole("region", { name: "League resources" }).id).toBe("league-resources");
expect(screen.getByRole("heading", { name: "Payment", level: 2 })).toBeTruthy();
expect(screen.getByRole("heading", { name: "MasterDoc", level: 2 })).toBeTruthy();
expect(screen.queryByRole("article", { name: "Rulebook resource" })).toBeNull();
```

- [ ] **Step 4: Add a Rulebook page test**

Mock `createServerSupabase` so there are no resource rows. Render `RulebookPage()` and assert:

```ts
expect(screen.getByRole("heading", { name: "Rulebook", level: 1 })).toBeTruthy();
expect(screen.getByRole("navigation", { name: "Rulebook sections" })).toBeTruthy();
expect(screen.getByRole("link", { name: "League Structure" }).getAttribute("href")).toBe("#league-structure");
expect(screen.getByRole("link", { name: /open source google doc/i }).getAttribute("href")).toBe("https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7");
expect(screen.getByRole("link", { name: /back to rulebook sections/i }).getAttribute("href")).toBe("#rulebook-sections");
```

- [ ] **Step 5: Run RED verification**

Run:

```bash
npm test -- src/components/SiteNavigation.test.tsx src/app/info/page.test.tsx src/app/league-links/page.test.tsx src/app/rulebook/page.test.tsx
```

Expected: tests fail because `/league-links` and `/rulebook` do not exist yet and nav still points to `/info` anchors.

### Task 2: Implement shared resource loading and standalone pages

**Files:**
- Create: `src/lib/info/resources.ts`
- Modify: `src/app/info/page.tsx`
- Create: `src/app/league-links/page.tsx`
- Create: `src/app/rulebook/page.tsx`
- Modify: `src/components/SiteNavigation.tsx`

**Interfaces:**
- Produces: `getInfoPageData(): Promise<{ resources: InfoResource[]; isAdmin: boolean }>`
- Produces: `getRulebookResource(resources: InfoResource[]): InfoResource`
- Produces: `rulebookSections: readonly (readonly [string, string])[]`

- [ ] **Step 1: Add `src/lib/info/resources.ts`**

Move `fallbackResources` and `rulebookSections` from `src/app/info/page.tsx` into this helper. Add `getInfoPageData()` using the same Supabase queries currently in `InfoPage`, and add `getRulebookResource(resources)` to find `slug === "rulebook"` with fallback.

- [ ] **Step 2: Build `/league-links`**

Render the existing page intro with `League Links`, show `resources.filter((resource) => resource.slug !== "rulebook")` inside the `id="league-resources"` region, and render `AdminInfoResources resources={resources}` only for admins.

- [ ] **Step 3: Build `/rulebook`**

Render the existing Rulebook document section as the full page, using `getRulebookResource(resources)` for the source Google Doc URL and `RulebookContent` for body content.

- [ ] **Step 4: Rebuild `/info` as a hub**

Render an Info heading with three internal `Link` destinations: `/league-links`, `/rulebook`, and `/signup`.

- [ ] **Step 5: Update header dropdown routes**

Change `DROPDOWN_LINKS.info` so League Links points to `/league-links` and Rulebook points to `/rulebook`.

- [ ] **Step 6: Run GREEN verification**

Run:

```bash
npm test -- src/components/SiteNavigation.test.tsx src/app/info/page.test.tsx src/app/league-links/page.test.tsx src/app/rulebook/page.test.tsx
```

Expected: all focused route and nav tests pass.

### Task 3: Verify, commit, and push

**Files:**
- Review all changed files.

**Interfaces:**
- Consumes: Completed implementation from Task 2.
- Produces: Pushed `main` commit with only intended files staged.

- [ ] **Step 1: Run scoped lint**

Run:

```bash
npx eslint src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/info/page.tsx src/app/info/page.test.tsx src/app/league-links/page.tsx src/app/league-links/page.test.tsx src/app/rulebook/page.tsx src/app/rulebook/page.test.tsx src/lib/info/resources.ts
```

Expected: exit code `0`.

- [ ] **Step 2: Check whitespace and diff**

Run:

```bash
git diff --check
git diff -- src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/info/page.tsx src/app/info/page.test.tsx src/app/league-links/page.tsx src/app/league-links/page.test.tsx src/app/rulebook/page.tsx src/app/rulebook/page.test.tsx src/lib/info/resources.ts
```

Expected: no whitespace errors and only route/nav/docs changes.

- [ ] **Step 3: Stage, commit, and push**

Stage only the files touched for this request. Commit with:

```bash
git commit -m "feat: split info resources into pages"
```

Push `main` to `origin/main`.
