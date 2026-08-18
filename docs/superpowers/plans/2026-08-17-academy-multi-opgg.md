# Academy Captain and Team Multi-OP.GG Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-roster multi-OP.GG link to the shared captain roster UI so Academy captains can use it, while preserving the existing Academy team-page behavior.

**Architecture:** Reuse the existing `opggMultiSearchUrlFromRosterPlayers` and `opggMultiSearchUrlFromRiotIds` helpers. Compute the active team’s URL in `CaptainPageView`, pass it into `MyRoster`, and render it conditionally next to the roster heading. The Academy team page remains unchanged because its route already delegates to the shared team page.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Do not add schema migrations or dependencies.
- Preserve the existing OP.GG account parsing and URL format.
- Keep the link hidden when no valid accounts are available.
- Keep existing uncommitted user changes intact.

---

### Task 1: Add the captain roster link contract and UI

**Files:**
- Modify: `src/components/captain/MyRoster.tsx`
- Test: `src/components/captain/MyRoster.test.tsx`

**Interfaces:**
- Consumes: `multiOpggUrl: string | null` passed alongside `draftPlayers` and `riotAccounts`.
- Produces: A conditional external link named `My Team OP.GG Multi` in the roster card.

- [ ] **Step 1: Write the failing component tests**

Add a minimal test fixture for an empty player/account list and verify that a supplied URL renders as a `_blank` external link; verify that `null` omits it.

```tsx
it("renders the team OP.GG multi-search link when supplied", () => {
  render(<MyRoster draftPlayers={[]} riotAccounts={[]} multiOpggUrl="https://op.gg/lol/multisearch/na?summoners=Player%23NA1" />);
  const link = screen.getByRole("link", { name: "My Team OP.GG Multi" });
  expect(link.getAttribute("href")).toBe("https://op.gg/lol/multisearch/na?summoners=Player%23NA1");
  expect(link.getAttribute("target")).toBe("_blank");
});

it("omits the team OP.GG multi-search link when no URL is supplied", () => {
  render(<MyRoster draftPlayers={[]} riotAccounts={[]} multiOpggUrl={null} />);
  expect(screen.queryByRole("link", { name: "My Team OP.GG Multi" })).toBeNull();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/components/captain/MyRoster.test.tsx`

Expected: FAIL because `MyRoster` does not yet accept or render `multiOpggUrl`.

- [ ] **Step 3: Implement the smallest UI change**

Add `multiOpggUrl: string | null` to the props, and place a conditional anchor beside the “My roster” heading. Use `target="_blank"`, `rel="noreferrer"`, and the existing coral pill styling used by `NextMatchCard`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/components/captain/MyRoster.test.tsx`

Expected: PASS.

### Task 2: Wire the active captain roster URL and verify integration

**Files:**
- Modify: `src/app/captain/page.tsx`
- Modify: `src/components/captain/MyRoster.tsx`
- Test: `src/lib/opgg/multiSearch.test.ts` (extend only if the existing helper coverage does not cover the fallback path)

**Interfaces:**
- Consumes: `roster.draftPlayers` and `roster.riotAccounts` returned by `fetchMyRoster`.
- Produces: `multiOpggUrl` passed to `<MyRoster />`, with draft-player OP.GG data preferred and Riot IDs as fallback.

- [ ] **Step 1: Add the fallback URL calculation**

Immediately after the existing opponent URL calculation in `src/app/captain/page.tsx`, add:

```ts
const myMultiOpggUrl =
  opggMultiSearchUrlFromRosterPlayers(roster.draftPlayers) ??
  opggMultiSearchUrlFromRiotIds(roster.riotAccounts);
```

- [ ] **Step 2: Pass the URL to the roster component**

Update the existing roster render to pass `multiOpggUrl={myMultiOpggUrl}` without changing the existing draft-player or Riot-account props.

- [ ] **Step 3: Run focused regression tests**

Run: `npx vitest run src/lib/opgg/multiSearch.test.ts src/components/captain/MyRoster.test.tsx src/components/captain/NextMatchCard.test.tsx`

Expected: PASS, including the existing opponent-link behavior.

- [ ] **Step 4: Run project verification**

Run: `npm test && npm run lint && npx tsc --noEmit`

Expected: all commands exit successfully. If the repository has pre-existing unrelated failures, report their exact paths and messages without modifying unrelated files.

- [ ] **Step 5: Review the final diff**

Run: `git diff -- src/app/captain/page.tsx src/components/captain/MyRoster.tsx src/components/captain/MyRoster.test.tsx src/lib/opgg/multiSearch.test.ts`

Confirm the diff contains only the requested captain link and its tests; do not stage or alter unrelated user changes.
