# Broadcast Hub Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the root route into a polished Franchise Premier League broadcast hub that highlights Twitch, preserves draft access, and clearly marks the other future destinations as coming soon.

**Architecture:** Keep `src/app/page.tsx` as the asynchronous server-side draft query and compose its static marketing surface from a new presentational `LeagueHub` component. Extract shared header navigation to a focused component so its Draft anchor and coming-soon states are consistent across every route. The existing Tailwind v4 theme/utilities remain the only styling system.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the existing Supabase draft query, draft links, auth behavior, routes, and draft-board behavior.
- Keep the FPL navy hash backgrounds, panel-blue cards, steel text, gold accents, Chakra Petch display type, and Saira UI type.
- Twitch uses `https://www.twitch.tv/franchisepremierleague`, `target="_blank"`, and `rel="noreferrer"`.
- Stats, Schedule, and Info visibly show `Coming soon`; they are neither links nor fabricated league data.
- Draft uses `/#draft-central`; the root page owns `id="draft-central"` and applies `scroll-mt-24` for the sticky header.
- Do not add a Twitch player, stream-status API, new database tables, RPC calls, or client-side state.
- Preserve usability at mobile widths.

---

## File Structure

- Create: `src/components/home/LeagueHub.tsx` — static hero, Twitch feature, Explore grid, and wrapper for server-rendered Draft Central content.
- Create: `src/components/home/LeagueHub.test.tsx` — validates the Twitch external URL, active Draft anchor, coming-soon labels, and passed Draft Central content.
- Create: `src/components/SiteNavigation.tsx` — shared header navigation that receives the existing auth control as `ReactNode`.
- Create: `src/components/SiteNavigation.test.tsx` — validates Home/Draft destinations, coming-soon items, and auth-slot rendering.
- Modify: `src/app/page.tsx` — retain the current Supabase query and render the queried draft directory inside `LeagueHub`.
- Modify: `src/app/layout.tsx` — replace the inline header with `SiteNavigation` without changing the logo or `AuthButton` behavior.
- Modify: `src/app/globals.css` — provide smooth anchor scrolling and only small reusable navigation styles if plain Tailwind classes are insufficient.

### Task 1: Build and test the reusable league hub

**Files:**

- Create: `src/components/home/LeagueHub.tsx`
- Create: `src/components/home/LeagueHub.test.tsx`

**Interfaces:**

- Consumes: `children: ReactNode`, supplied by `src/app/page.tsx` as the Draft Central section.
- Produces: `LeagueHub({ children }: { children: ReactNode }): JSX.Element`, a server-safe wrapper with hero, Twitch feature, Explore grid, and supplied draft content.

- [ ] **Step 1: Write the failing component test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LeagueHub from "./LeagueHub";

describe("LeagueHub", () => {
  it("links visitors to Twitch and keeps future destinations honest", () => {
    render(<LeagueHub><section id="draft-central">Current drafts</section></LeagueHub>);

    const twitch = screen.getAllByRole("link", { name: /twitch/i })[0];
    expect(twitch.getAttribute("href")).toBe("https://www.twitch.tv/franchisepremierleague");
    expect(twitch.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: /explore drafts/i }).getAttribute("href")).toBe("#draft-central");
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Current drafts")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/components/home/LeagueHub.test.tsx`

Expected: FAIL because `./LeagueHub` does not exist.

- [ ] **Step 3: Write the minimal presentational implementation**

Create a server-safe component; do not add `"use client"`. Use this exact structure, retaining the stated class names so the design uses the project’s existing utility system:

```tsx
import type { ReactNode } from "react";
import Link from "next/link";

const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";

export default function LeagueHub({ children }: { children: ReactNode }) {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-6 py-10 sm:py-16">
        <section aria-labelledby="league-title" className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-center py-5 sm:py-10">
            <span className="label-dash">FRANCHISE PREMIER LEAGUE</span>
            <h1 id="league-title" className="type-display mt-3 max-w-3xl text-5xl leading-[0.9] sm:text-7xl">
              The league never stops.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-steel sm:text-lg">
              Follow every draft, rivalry, and roster move in League of Legends&apos; competitive fantasy league.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={TWITCH_URL} target="_blank" rel="noreferrer" className="btn-pill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                Watch on Twitch ↗
              </a>
              <Link href="#draft-central" className="rounded-full border border-steel px-5 py-2 text-sm font-semibold text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                Explore drafts
              </Link>
            </div>
          </div>
          <article className="card-brand flex min-h-80 flex-col justify-between overflow-hidden p-6 sm:p-8">
            <div>
              <span className="inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-300">Live destination</span>
              <span className="label-dash mt-8 block">ON TWITCH</span>
              <h2 className="type-display mt-2 text-4xl">Franchise Premier League</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-steel">Watch the league unfold live, from draft night to every pivotal matchup.</p>
            </div>
            <a href={TWITCH_URL} target="_blank" rel="noreferrer" className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-gold hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
              Visit Twitch channel <span aria-hidden>→</span>
            </a>
          </article>
        </section>
        <section aria-labelledby="explore-title" className="mt-14">
          <div className="mb-5">
            <span className="label-dash">LEAGUE HUB</span>
            <h2 id="explore-title" className="type-display mt-2 text-3xl">Explore the league</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="card-brand min-h-44 p-5"><span className="label-dash">STATS</span><span className="mt-5 inline-flex rounded-full border border-line px-2.5 py-1 text-xs uppercase tracking-wide text-steel">Coming soon</span><p className="mt-3 text-sm text-steel">Leaderboards, records, and player form.</p></article>
            <article className="card-brand min-h-44 p-5"><span className="label-dash">SCHEDULE</span><span className="mt-5 inline-flex rounded-full border border-line px-2.5 py-1 text-xs uppercase tracking-wide text-steel">Coming soon</span><p className="mt-3 text-sm text-steel">Matchweeks, live fixtures, and results.</p></article>
            <Link href="#draft-central" className="card-brand min-h-44 p-5 transition hover:border-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><span className="label-dash">DRAFT</span><span className="mt-5 block type-display text-2xl text-white">Draft Central</span><p className="mt-3 text-sm text-steel">Review active drafts and follow every board.</p></Link>
            <article className="card-brand min-h-44 p-5"><span className="label-dash">INFO</span><span className="mt-5 inline-flex rounded-full border border-line px-2.5 py-1 text-xs uppercase tracking-wide text-steel">Coming soon</span><p className="mt-3 text-sm text-steel">League rules, formats, and updates.</p></article>
          </div>
        </section>
        {children}
      </div>
    </main>
  );
}
```

Use the exact labels `STATS`, `SCHEDULE`, `DRAFT`, `INFO`, and `Coming soon`. The primary Twitch CTA’s accessible name includes `Twitch`; the Draft CTA’s name is `Explore drafts`. Both Twitch controls use `TWITCH_URL`, `target="_blank"`, and `rel="noreferrer"`. Make the cards and controls visibly focusable with existing Tailwind focus utilities.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/components/home/LeagueHub.test.tsx`

Expected: PASS; Twitch uses the supplied URL and safe new-tab attributes, Draft targets its anchor, three destinations say `Coming soon`, and child Draft Central content renders.

- [ ] **Step 5: Commit the component**

```bash
git add src/components/home/LeagueHub.tsx src/components/home/LeagueHub.test.tsx
git commit -m "feat: add league broadcast hub"
```

### Task 2: Add and test shared site navigation

**Files:**

- Create: `src/components/SiteNavigation.tsx`
- Create: `src/components/SiteNavigation.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `authSlot: ReactNode` supplied as `<AuthButton />` by `RootLayout`.
- Produces: `SiteNavigation({ authSlot }: { authSlot: ReactNode }): JSX.Element`, a shared header with brand, nav, and authentication slot.

- [ ] **Step 1: Write the failing navigation test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SiteNavigation from "./SiteNavigation";

describe("SiteNavigation", () => {
  it("links to Home and Draft Central while marking unavailable areas", () => {
    render(<SiteNavigation authSlot={<span>Account</span>} />);

    expect(screen.getByRole("link", { name: "Home", exact: true }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Draft", exact: true }).getAttribute("href")).toBe("/#draft-central");
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Account")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npx vitest run src/components/SiteNavigation.test.tsx`

Expected: FAIL because `./SiteNavigation` does not exist.

- [ ] **Step 3: Implement the shared header and apply it**

Create a server-safe `SiteNavigation` component using `next/image` and `next/link`. Reuse `/fpl-logo.png` and the existing `FPL DRAFT` wordmark. Use this implementation so the nav has exact destinations and no dead links:

```tsx
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const comingSoonClass = "whitespace-nowrap text-xs font-medium uppercase tracking-wide text-steel";
const linkClass = "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold";

export default function SiteNavigation({ authSlot }: { authSlot: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line backdrop-blur" style={{ backgroundColor: "rgba(0,18,31,0.9)" }}>
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="FPL Draft home">
          <Image src="/fpl-logo.png" width={30} height={30} alt="" />
          <span className="type-display text-base">FPL <span className="font-body not-italic text-steel">DRAFT</span></span>
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto py-1 sm:gap-6">
          <Link href="/" className={linkClass}>Home</Link>
          <span className={comingSoonClass}>Stats <small className="ml-1 text-gold">Coming soon</small></span>
          <span className={comingSoonClass}>Schedule <small className="ml-1 text-gold">Coming soon</small></span>
          <Link href="/#draft-central" className={linkClass}>Draft</Link>
          <span className={comingSoonClass}>Info <small className="ml-1 text-gold">Coming soon</small></span>
        </nav>
        <div className="shrink-0">{authSlot}</div>
      </div>
    </header>
  );
}
```

In `src/app/layout.tsx`, replace the current inline `<header>` with:

```tsx
<SiteNavigation authSlot={<AuthButton />} />
```

Retain the existing font setup and body classes. Add this to `src/app/globals.css` without changing the established color tokens:

```css
html { scroll-behavior: smooth; scroll-padding-top: 5rem; }
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npx vitest run src/components/SiteNavigation.test.tsx`

Expected: PASS; Home/Draft have exact paths, three unavailable labels display, and the supplied auth slot renders.

- [ ] **Step 5: Commit the navigation change**

```bash
git add src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat: add league navigation"
```

### Task 3: Compose Draft Central into the new home and validate it

**Files:**

- Modify: `src/app/page.tsx`

**Interfaces:**

- Consumes: `LeagueHub` and the existing `Draft[]` response fetched via `createServerSupabase`.
- Produces: a root page where `id="draft-central"` wraps the current admin link, empty state, and draft-board links.

- [ ] **Step 1: Confirm the hub’s child-content test before integration**

Run: `npx vitest run src/components/home/LeagueHub.test.tsx`

Expected: PASS from Task 1, proving Draft Central content is not lost when the server page composes the hub.

- [ ] **Step 2: Integrate without modifying the draft query or directory behavior**

Keep the current Supabase setup/query/order and `Draft` cast. Replace the outer `<main>` with `<LeagueHub>`, then create this exact server-rendered Draft Central content inside it:

```tsx
<section id="draft-central" className="scroll-mt-24 pt-16" aria-labelledby="draft-central-title">
  <div className="mb-6 flex items-end justify-between gap-4">
    <div>
      <span className="label-dash">LEAGUE OPERATIONS</span>
      <h2 id="draft-central-title" className="type-display mt-2 text-4xl sm:text-5xl">Draft Central</h2>
    </div>
    <Link href="/admin" className="text-sm text-steel underline underline-offset-4 hover:text-white focus-visible:text-white">
      Admin
    </Link>
  </div>
  {drafts.length === 0 ? (
    <p className="text-sm text-steel">No drafts yet.</p>
  ) : (
    <ul className="grid gap-4 md:grid-cols-2">
      {drafts.map((draft) => (
        <li key={draft.id}>
          <Link href={`/draft/${draft.id}`} className="card-brand flex h-full flex-col gap-2 px-5 py-4 transition-colors hover:border-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            <span className="type-display text-xl">{draft.name}</span>
            <span className="text-sm uppercase tracking-wide text-steel">{draft.status}</span>
            <span className="label-dash">VIEW BOARD →</span>
          </Link>
        </li>
      ))}
    </ul>
  )}
</section>
```

Do not change individual draft `href` values, status text, or `VIEW BOARD →` copy. Only adjust layout classes around them if the new max-width needs a responsive grid.

- [ ] **Step 3: Run all automated checks**

Run: `npm test && npm run lint && npm run build`

Expected: every command exits 0; the existing suite and the two new component tests remain green.

- [ ] **Step 4: Visually verify desktop and mobile behavior**

Run: `npm run dev`

Inspect `/` at desktop and a narrow mobile viewport. Confirm the hero/Twitch feature stack correctly; both Twitch CTAs open the exact channel in a new tab; the Explore grid contains one active Draft card and three clear coming-soon cards; nav/auth remain usable; Draft Central anchors correctly; and each draft still opens `/draft/<id>`.

- [ ] **Step 5: Commit the integrated homepage**

```bash
git add src/app/page.tsx
git commit -m "feat: launch FPL broadcast homepage"
```
