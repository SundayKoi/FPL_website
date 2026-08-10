# Route-Based League Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each primary FPL tab a real route, move the draft directory to `/draft`, and leave the homepage focused on league identity and Twitch.

**Architecture:** `SiteNavigation` links to five real routes. A small server-safe `ComingSoonPage` component powers `/stats`, `/schedule`, and `/info`; `DraftDirectory` contains the presentational draft-list markup so the new server-rendered `/draft` page retains the existing Supabase query without coupling tests to Supabase. The root page becomes static and composes the simplified `LeagueHub`.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve existing draft-board behavior and `/draft/[id]` routes exactly.
- Keep the existing `drafts` query table, ordering, `Draft` cast, empty copy `No drafts yet.`, card status text, board href `/draft/${draft.id}`, and `VIEW BOARD →` text.
- Use real routes: `/`, `/stats`, `/schedule`, `/draft`, and `/info`; do not retain `/#draft-central` navigation or disabled tab UI.
- The homepage is static and makes no Supabase query; it contains only its hero and Twitch feature.
- Both Twitch links use `https://www.twitch.tv/franchisepremierleague`, `target="_blank"`, and `rel="noreferrer"`.
- Future pages use honest coming-soon content only; no fabricated stats, fixtures, rules, or data models.
- Reuse existing navy, panel, steel, gold, hash, typography, focus, and reduced-motion conventions. No client-side state or Twitch embed.

---

## File Structure

- Create: `src/components/ComingSoonPage.tsx` — reusable static page shell for future league destinations.
- Create: `src/components/ComingSoonPage.test.tsx` — asserts title, description, and coming-soon status rendering.
- Create: `src/app/stats/page.tsx`, `src/app/schedule/page.tsx`, `src/app/info/page.tsx` — route-specific uses of `ComingSoonPage`.
- Modify: `src/components/SiteNavigation.tsx` and `src/components/SiteNavigation.test.tsx` — convert all tabs to their exact route links.
- Modify: `src/components/home/LeagueHub.tsx` and `src/components/home/LeagueHub.test.tsx` — retain only hero/Twitch content.
- Modify: `src/app/page.tsx` — static homepage that renders `LeagueHub` with no Supabase imports/query.
- Create: `src/components/draft/DraftDirectory.tsx` and `src/components/draft/DraftDirectory.test.tsx` — accessible presentational Draft Central directory.
- Create: `src/app/draft/page.tsx` — existing server query moved from the homepage, passing results to `DraftDirectory`.

### Task 1: Create real navigation destinations and future-page shell

**Files:**

- Create: `src/components/ComingSoonPage.tsx`
- Create: `src/components/ComingSoonPage.test.tsx`
- Create: `src/app/stats/page.tsx`
- Create: `src/app/schedule/page.tsx`
- Create: `src/app/info/page.tsx`
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`

**Interfaces:**

- Produces: `ComingSoonPage({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }): JSX.Element`.
- Consumes: no data, client state, or route params.

- [ ] **Step 1: Write failing component and navigation tests**

```tsx
it("renders the supplied future destination", () => {
  render(<ComingSoonPage eyebrow="LEAGUE DATA" title="Stats" description="Records and form are on the way." />);

  expect(screen.getByRole("heading", { name: "Stats", level: 1 })).toBeTruthy();
  expect(screen.getByText("Records and form are on the way.")).toBeTruthy();
  expect(screen.getByText("Coming soon")).toBeTruthy();
});

it("links every primary tab to its own route", () => {
  render(<SiteNavigation authSlot={<span>Account</span>} />);

  expect(screen.getByRole("link", { name: /^Stats$/ }).getAttribute("href")).toBe("/stats");
  expect(screen.getByRole("link", { name: /^Schedule$/ }).getAttribute("href")).toBe("/schedule");
  expect(screen.getByRole("link", { name: /^Draft$/ }).getAttribute("href")).toBe("/draft");
  expect(screen.getByRole("link", { name: /^Info$/ }).getAttribute("href")).toBe("/info");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx vitest run src/components/ComingSoonPage.test.tsx src/components/SiteNavigation.test.tsx`

Expected: FAIL because `ComingSoonPage` and the new route destinations do not yet exist.

- [ ] **Step 3: Implement the reusable shell, routes, and link navigation**

Create `ComingSoonPage` with this server-safe structure:

```tsx
export default function ComingSoonPage({ eyebrow, title, description }: Props) {
  return (
    <main className="bg-hash flex-1">
      <section className="mx-auto flex min-h-[calc(100vh-57px)] w-full max-w-5xl items-center px-6 py-16">
        <div className="card-brand w-full p-8 sm:p-12">
          <span className="label-dash">{eyebrow}</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">{title}</h1>
          <p className="mt-4 max-w-xl text-steel">{description}</p>
          <span className="mt-8 inline-flex rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold">Coming soon</span>
        </div>
      </section>
    </main>
  );
}
```

Use it from the three route files with these exact props:

```tsx
// /stats
<ComingSoonPage eyebrow="LEAGUE DATA" title="Stats" description="League records, player form, and standings are on the way." />
// /schedule
<ComingSoonPage eyebrow="LEAGUE CALENDAR" title="Schedule" description="Matchweeks, fixtures, and results will live here." />
// /info
<ComingSoonPage eyebrow="THE LEAGUE" title="Info" description="League formats, rules, and updates are coming soon." />
```

Change all five `SiteNavigation` items to `Link`s with `/`, `/stats`, `/schedule`, `/draft`, and `/info` respectively. Preserve its mobile overflow, focus classes, logo, and auth slot.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npx vitest run src/components/ComingSoonPage.test.tsx src/components/SiteNavigation.test.tsx`

Expected: PASS; future shell content renders and all tabs have their exact routes.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/components/ComingSoonPage.tsx src/components/ComingSoonPage.test.tsx src/app/stats/page.tsx src/app/schedule/page.tsx src/app/info/page.tsx src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx
git commit -m "feat: add route-based league pages"
```

### Task 2: Make the homepage a static league-and-Twitch surface

**Files:**

- Modify: `src/components/home/LeagueHub.tsx`
- Modify: `src/components/home/LeagueHub.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**

- Produces: `LeagueHub(): JSX.Element`, no `children` prop.
- Consumes: no Supabase client or `Draft` data.

- [ ] **Step 1: Update the homepage component test before changing production code**

```tsx
it("keeps the broadcast hero focused on Twitch rather than draft navigation", () => {
  render(<LeagueHub />);

  const twitchLinks = screen.getAllByRole("link", { name: /twitch/i });
  expect(twitchLinks).toHaveLength(2);
  expect(screen.queryByRole("heading", { name: /draft central/i })).toBeNull();
  expect(screen.queryByRole("heading", { name: /explore the league/i })).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/components/home/LeagueHub.test.tsx`

Expected: FAIL because `LeagueHub` currently requires children and renders the Explore/Draft sections.

- [ ] **Step 3: Simplify `LeagueHub` and root page**

Remove the `ReactNode` import and `children` prop from `LeagueHub`; remove its entire Explore grid and `{children}` output. Keep the existing hero and Twitch feature markup, including both safe Twitch links. Change `src/app/page.tsx` to:

```tsx
import LeagueHub from "@/components/home/LeagueHub";

export default function Home() {
  return <LeagueHub />;
}
```

Do not import `Link`, `createServerSupabase`, or `Draft` in the root page after this task.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/components/home/LeagueHub.test.tsx`

Expected: PASS; both Twitch links remain, and no Draft Central/Explore section remains on the homepage.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/components/home/LeagueHub.tsx src/components/home/LeagueHub.test.tsx src/app/page.tsx
git commit -m "feat: focus home on league broadcasts"
```

### Task 3: Move the draft directory to `/draft`

**Files:**

- Create: `src/components/draft/DraftDirectory.tsx`
- Create: `src/components/draft/DraftDirectory.test.tsx`
- Create: `src/app/draft/page.tsx`

**Interfaces:**

- Consumes: `drafts: Draft[]`.
- Produces: `DraftDirectory({ drafts }: { drafts: Draft[] }): JSX.Element`; it contains display-only Draft Central markup and links, not the Supabase query.

- [ ] **Step 1: Write the failing directory test**

```tsx
const draft = { id: "draft-1", name: "Summer Auction", status: "live" } as Draft;

it("links each draft card to its existing board route", () => {
  render(<DraftDirectory drafts={[draft]} />);

  expect(screen.getByRole("heading", { name: "Draft Central" })).toBeTruthy();
  expect(screen.getByRole("link", { name: /summer auction/i }).getAttribute("href")).toBe("/draft/draft-1");
  expect(screen.getByText("live")).toBeTruthy();
  expect(screen.getByText("VIEW BOARD →")).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/components/draft/DraftDirectory.test.tsx`

Expected: FAIL because `DraftDirectory` does not exist.

- [ ] **Step 3: Implement the presentational directory and server route**

`DraftDirectory` renders the current `DRAFT CENTRAL` micro-label, `Draft Central` heading, `/admin` link, and the current empty/list branches. Its nonempty card markup preserves the exact existing href, status, and `VIEW BOARD →` text. `src/app/draft/page.tsx` contains the moved query:

```tsx
const supabase = await createServerSupabase();
const { data } = await supabase.from("drafts").select("*").order("created_at", { ascending: false });
const drafts = (data as Draft[]) ?? [];

return <DraftDirectory drafts={drafts} />;
```

Wrap the component in the same `bg-hash` page/container treatment used by other server pages. Do not modify `src/app/draft/[id]/page.tsx`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run src/components/draft/DraftDirectory.test.tsx`

Expected: PASS; the directory retains the existing board route and visible card contract.

- [ ] **Step 5: Run full verification and visually inspect all routes**

Run: `npm test && npm run lint && npm run build -- --webpack`

Expected: all tests pass, lint has no errors, and the Webpack production build exits 0.

Inspect `/`, `/draft`, `/stats`, `/schedule`, and `/info` at desktop and mobile widths. Confirm only `/draft` queries/lists drafts, each navigation link loads its matching route, and `/draft/[id]` remains accessible.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/draft/DraftDirectory.tsx src/components/draft/DraftDirectory.test.tsx src/app/draft/page.tsx
git commit -m "feat: move draft directory to its own page"
```
