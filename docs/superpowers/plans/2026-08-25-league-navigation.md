# League Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Premier/Academy header dropdowns and page toggles with a league-aware FPL/FPL Academy brand chooser, direct league navigation, organized shared menus, and staff links inside Info.

**Architecture:** Keep one shared client navigation component, derive `premier | academy` from the current pathname, and centralize paired-path switching in pure league-link helpers. The brand chooser owns league switching; every paired page renders without its old Premier/Academy toggle.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Next `<Link>`/`<Image>`, Tailwind CSS v4, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-25-league-navigation-and-my-team-design.md`

## Global Constraints

- Execute after `docs/superpowers/plans/2026-08-25-my-team-player-identity.md`, so canonical My Team routes already exist.
- Read `README.md` and `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` before editing navigation.
- Preserve the existing `SiteNavigation` accessibility behavior: keyboard focus, Escape dismissal, outside-click dismissal, route-change closing, `aria-current`, and mobile hamburger behavior.
- Use the existing FPL image for Premier and a distinct composed Academy treatment in code; do not introduce an unreviewed external asset dependency.
- Direct league links are Players, Teams, Schedule, Stats, and My Team. Home is the active choice in the brand chooser.
- Shared groups are Play, Premium, and Info. Admin and Broadcaster are never standalone top-level links.
- Preserve current staff-tier visibility and server-side route gates exactly.
- Remove every rendered `LeaguePageToggle`; league switching belongs only to the brand chooser.
- Preserve unrelated working-tree changes.

---

### Task 1: Pure league-path and active-league helpers

**Files:**
- Modify: `src/lib/league/links.ts`
- Modify: `src/lib/league/links.test.ts`
- Create: `src/lib/league/navigation.ts`
- Create: `src/lib/league/navigation.test.ts`

**Interfaces:**
- Consumes canonical My Team paths created by the prerequisite plan.
- Produces `resolveLeagueFromPath(pathname: string): LeagueView`.
- Produces `pairedLeagueHref(pathname: string, target: LeagueView, search?: string): string`.
- Produces `leagueNavigationLinks(view: LeagueView)` for direct header links.

- [ ] **Step 1: Write failing helper tests**

Cover root, nested team/player pages, My Team/scouting, unknown shared routes, and query preservation:

```ts
expect(resolveLeagueFromPath("/academy/stats")).toBe("academy");
expect(resolveLeagueFromPath("/betting")).toBe("premier");
expect(pairedLeagueHref("/stats", "academy", "tab=Teams&season=S5"))
  .toBe("/academy/stats?tab=Teams&season=S5");
expect(pairedLeagueHref("/academy/my-team/scouting", "premier"))
  .toBe("/my-team/scouting");
expect(pairedLeagueHref("/betting", "academy"))
  .toBe("/academy");
```

Also assert that `leagueNavigationLinks("academy")` returns Players, Teams, Schedule, Stats, and My Team with `/academy/...` destinations.

- [ ] **Step 2: Run helper tests and verify failure**

Run: `npm test -- src/lib/league/links.test.ts src/lib/league/navigation.test.ts`

Expected: FAIL because the navigation helpers do not exist.

- [ ] **Step 3: Implement the helpers with explicit paired prefixes**

Define a finite map rather than string-replacing arbitrary paths:

```ts
const PAIRED_PREFIXES = [
  ["/my-team/scouting", "/academy/my-team/scouting"],
  ["/my-team", "/academy/my-team"],
  ["/players", "/academy/players"],
  ["/teams", "/academy/teams"],
  ["/schedule", "/academy/schedule"],
  ["/stats", "/academy/stats"],
  ["/", "/academy"],
] as const;
```

Match longest prefixes first so nested routes retain their suffix, such as a team slug. Preserve the provided query string only for paired pages. Unknown shared routes fall back to the target league home.

- [ ] **Step 4: Run helper tests**

Run: `npm test -- src/lib/league/links.test.ts src/lib/league/navigation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure navigation contract**

```bash
git add src/lib/league/links.ts src/lib/league/links.test.ts src/lib/league/navigation.ts src/lib/league/navigation.test.ts
git commit -m "feat: add paired league navigation helpers"
```

### Task 2: FPL and FPL Academy brand chooser

**Files:**
- Create: `src/components/LeagueBrandChooser.tsx`
- Create: `src/components/LeagueBrandChooser.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes `resolveLeagueFromPath` and `pairedLeagueHref` from Task 1.
- Produces props `{ pathname: string; search: string; onNavigate: () => void }`.
- Renders active labels `FPL` and `FPL Academy` with accessible menu name `League chooser`.

- [ ] **Step 1: Write failing chooser tests**

Test both brand states, the distinct Academy mark, chooser open/close, current-league home behavior, paired-league behavior, Escape, outside click, and callback after selection.

```tsx
render(<LeagueBrandChooser pathname="/academy/stats" search="tab=Players" onNavigate={onNavigate} />);
expect(screen.getByRole("button", { name: /fpl academy, choose league/i })).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: /choose league/i }));
expect(screen.getByRole("menuitem", { name: /^FPL$/ }).getAttribute("href"))
  .toBe("/stats?tab=Players");
expect(screen.getByRole("menuitem", { name: /^FPL Academy$/ }).getAttribute("href"))
  .toBe("/academy");
```

- [ ] **Step 2: Run the chooser test and verify failure**

Run: `npm test -- src/components/LeagueBrandChooser.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the composed brand treatments**

Use `/fpl-logo.png` in both states. Premier renders the existing logo plus `FPL`. Academy adds a small cyan `A` badge and renders `FPL Academy`; the badge is decorative and the complete accessible label comes from the button. Selecting the active league links to its home. Selecting the other league uses `pairedLeagueHref`.

Keep the popover opaque, above page content, keyboard reachable, and wide enough for `FPL Academy` without truncation. Use the existing navy/gold/coral palette plus the site's existing cyan token for Academy differentiation.

- [ ] **Step 4: Run the chooser tests**

Run: `npm test -- src/components/LeagueBrandChooser.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the chooser**

```bash
git add src/components/LeagueBrandChooser.tsx src/components/LeagueBrandChooser.test.tsx src/app/globals.css
git commit -m "feat: add FPL Academy league chooser"
```

### Task 3: Player-first desktop and mobile header

**Files:**
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/layout.test.tsx`

**Interfaces:**
- Consumes `LeagueBrandChooser` and `leagueNavigationLinks`.
- Preserves `SiteNavigation` props `authSlot`, `showAdmin`, and `showBroadcaster`.
- Produces direct links Players, Teams, Schedule, Stats, My Team and dropdowns Play, Premium, Info.

- [ ] **Step 1: Replace old assertions with failing information-architecture tests**

Assert:

```ts
expect(screen.queryByRole("button", { name: /premier menu/i })).toBeNull();
expect(screen.queryByRole("button", { name: /academy menu/i })).toBeNull();
for (const name of ["Players", "Teams", "Schedule", "Stats", "My Team"]) {
  expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name })).toBeTruthy();
}
expect(screen.getByRole("button", { name: /play menu/i })).toBeTruthy();
expect(screen.getByRole("button", { name: /premium menu/i })).toBeTruthy();
expect(screen.getByRole("button", { name: /info menu/i })).toBeTruthy();
```

Open Play and assert Auction Draft `/draft` and Match Drafter `/drafter`. Open Premium and assert Betting, Banger Board, Player Cards, and external Draft League. Open Info and assert Info `/info`, Sign Up, League Links, Rulebook, and Support.

Render staff combinations and assert Admin/Broadcaster are inside the Info menu only, using the exact existing `showAdmin`/`showBroadcaster` flags.

- [ ] **Step 2: Run the header tests and verify failure**

Run: `npm test -- src/components/SiteNavigation.test.tsx src/app/layout.test.tsx`

Expected: FAIL because the old Premier/Academy structure still renders.

- [ ] **Step 3: Refactor navigation configuration**

Replace `PRIMARY_LINKS`, `LEAGUE_PAGES`, and the Premier/Academy dropdown entries with:

```ts
const SHARED_DROPDOWNS = {
  play: [
    { href: "/draft", label: "Auction Draft" },
    { href: "/drafter", label: "Match Drafter" },
  ],
  premium: [
    { href: "/betting", label: "Betting" },
    { href: "/bangers", label: "Banger Board" },
    { href: "/cards", label: "Player Cards" },
    { href: "https://www.draftleague.lol/", label: "Draft League", target: "_blank", rel: "noopener noreferrer" },
  ],
  info: [
    { href: "/info", label: "Info" },
    { href: "/signup", label: "Sign Up" },
    { href: "/league-links", label: "League Links" },
    { href: "/rulebook", label: "Rulebook" },
    { href: "/support-devs", label: "Support the Devs" },
  ],
} as const;
```

Append a separated Staff group inside the open Info menu based on the existing props. Keep all menu closing and accessibility behavior from the current implementation.

- [ ] **Step 4: Integrate the brand chooser and active league**

Read `usePathname()` and `useSearchParams()` in `SiteNavigation`, pass them to `LeagueBrandChooser`, and derive direct league links. Ensure the current league link receives `aria-current="page"`; shared route activity continues to use exact/prefix matching.

- [ ] **Step 5: Preserve responsive behavior**

Desktop displays the five direct links plus three grouped menus without overlap at existing breakpoints. Mobile keeps the hamburger, shows direct links first, and expands groups vertically. The brand remains visible while the mobile menu is open.

- [ ] **Step 6: Run header tests**

Run: `npm test -- src/components/SiteNavigation.test.tsx src/components/LeagueBrandChooser.test.tsx src/app/layout.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the new header**

```bash
git add src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/layout.tsx src/app/layout.test.tsx
git commit -m "feat: simplify league header navigation"
```

### Task 4: Remove page-level league toggles

**Files:**
- Delete: `src/components/LeaguePageToggle.tsx`
- Modify: `src/components/home/PreseasonHomePage.tsx`
- Modify: `src/components/home/HomeDashboard.tsx`
- Modify: `src/components/home/FeaturedHomepageCopy.test.tsx`
- Modify: `src/components/players/PlayersDirectory.tsx`
- Modify: `src/components/players/PlayersDirectory.test.tsx`
- Modify: `src/components/teams/TeamsDirectory.tsx`
- Modify: `src/components/teams/TeamsDirectory.test.tsx`
- Modify: `src/app/stats/page.tsx`
- Modify: `src/app/academy/stats/page.tsx`
- Modify: `src/app/schedule/page.tsx`
- Modify: `src/app/academy/schedule/page.tsx`
- Modify: `src/app/my-team/page.tsx`
- Modify: `src/app/my-team/scouting/page.tsx`
- Modify: `src/app/captain/scouting/page.test.tsx`
- Create: `src/lib/league/noPageToggle.test.ts`

**Interfaces:**
- Consumes the brand chooser as the only league switcher.
- Removes every `LeaguePageToggle` render and import.

- [ ] **Step 1: Add failing absence assertions to representative page tests**

Assert the toggle is absent from Premier home/stats/schedule/players/teams/My Team and their Academy counterparts. Add `noPageToggle.test.ts`, which reads the routed source files and asserts none imports `@/components/LeaguePageToggle`.

- [ ] **Step 2: Run representative tests and verify failure**

Run: `npm test -- src/components/home/FeaturedHomepageCopy.test.tsx src/components/players/PlayersDirectory.test.tsx src/components/teams/TeamsDirectory.test.tsx src/app/captain/scouting/page.test.tsx src/lib/league/noPageToggle.test.ts`

Expected: FAIL while pages still render or mock the toggle.

- [ ] **Step 3: Remove toggle imports, props, and layout gaps**

Delete each import/render and simplify page-header flex layouts that existed only to place the toggle at the right edge. Preserve page titles, labels, filters, and query behavior. Delete `LeaguePageToggle.tsx` after `rg -n "LeaguePageToggle" src` returns only test text intended to assert absence.

- [ ] **Step 4: Run toggle and page tests**

Run: `npm test -- src/components/home/FeaturedHomepageCopy.test.tsx src/components/players/PlayersDirectory.test.tsx src/components/teams/TeamsDirectory.test.tsx src/app/captain/scouting/page.test.tsx src/lib/league/navigation.test.ts src/lib/league/noPageToggle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit toggle removal**

```bash
git add src/components/LeaguePageToggle.tsx src/components/home/PreseasonHomePage.tsx src/components/home/HomeDashboard.tsx src/components/home/FeaturedHomepageCopy.test.tsx src/components/players/PlayersDirectory.tsx src/components/players/PlayersDirectory.test.tsx src/components/teams/TeamsDirectory.tsx src/components/teams/TeamsDirectory.test.tsx src/app/stats/page.tsx src/app/academy/stats/page.tsx src/app/schedule/page.tsx src/app/academy/schedule/page.tsx src/app/my-team/page.tsx src/app/my-team/scouting/page.tsx src/app/captain/scouting/page.test.tsx src/lib/league/noPageToggle.test.ts
git commit -m "refactor: remove duplicate league page toggles"
```

### Task 5: Navigation documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/backend.md`

**Interfaces:**
- Documents the league chooser, direct league links, My Team placement, and Staff entries inside Info.

- [ ] **Step 1: Update navigation documentation**

Describe FPL/FPL Academy as paired experiences, list the header groups, state that the brand chooser owns league switching, and note that Admin/Broadcaster routes keep their current server gates despite moving under Info.

- [ ] **Step 2: Run navigation-focused checks**

```bash
npm test -- src/lib/league/links.test.ts src/lib/league/navigation.test.ts src/components/LeagueBrandChooser.test.tsx src/components/SiteNavigation.test.tsx src/app/layout.test.tsx
rg -n "LeaguePageToggle|Premier menu|Academy menu" src
```

Expected: tests pass. The search returns no production imports/renders or obsolete menu configuration.

- [ ] **Step 3: Run repository-wide checks**

```bash
npm run lint
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 4: Perform a responsive browser verification**

Start `npm run dev`, then verify at desktop and mobile widths:

- FPL and FPL Academy chooser labels/marks;
- paired Stats and team-detail switching;
- current-league selection returning home;
- five direct league links;
- Play, Premium, and Info contents;
- conditional Staff entries;
- keyboard focus, Escape, outside click, and hamburger close after navigation; and
- no horizontal overlap or clipped Academy brand.

Use the repository's browser-verification skill when execution reaches this step. Record any actual defects as focused tests before fixing them.

- [ ] **Step 5: Commit documentation and verification fixes**

```bash
git add README.md
git add -p docs/backend.md
git commit -m "docs: describe paired league navigation"
```
