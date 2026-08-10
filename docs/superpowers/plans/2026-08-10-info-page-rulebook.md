# Info Page and Rulebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty `/info` route with a branded resource hub and an exact-wording, navigable Rulebook article.

**Architecture:** Keep the route as a server-rendered App Router page. Extract the long Rulebook article into a focused `RulebookContent` component and use a reusable `InfoResourceCard` for the three external destinations. Render the source document's existing hierarchy with semantic headings, anchored sections, paragraphs, and lists using existing Tailwind utilities rather than adding a Markdown dependency.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the Rulebook wording exactly, including current capitalization, punctuation, terminology, and typos.
- Payment must link to `https://www.paypal.com/paypalme/DraftFPL`.
- MasterDoc must link to `https://docs.google.com/spreadsheets/d/187hoKxxeSpSPtDAmlrTOeuDrcz5kpdwv1qgQ5kipaHY/edit?usp=sharing`.
- Rulebook must link to `https://docs.google.com/document/d/1KXJWcEtrjz8icHzzmuXgyd8SBWXXR_x9Bb8Xh03QXRI/edit?usp=sharing`.
- External links must use `target="_blank"` and `rel="noopener noreferrer"`.
- Keep the page server-rendered and do not add a Markdown parsing dependency.
- Use the existing navy, panel, line, steel, gold, `bg-hash`, `card-brand`, `type-display`, and `label-dash` brand utilities.

---

### Task 1: Add the Rulebook article and its focused tests

**Files:**
- Create: `src/components/info/RulebookContent.tsx`
- Create: `src/components/info/RulebookContent.test.tsx`

**Interfaces:**
- Produces: `RulebookContent(): JSX.Element`, a static article with stable IDs for the table of contents.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RulebookContent from "./RulebookContent";

describe("RulebookContent", () => {
  it("renders the title and major section anchors", () => {
    render(<RulebookContent />);

    expect(screen.getByRole("heading", { name: /official rulebook/i, level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "1. League Structure", level: 2 }).getAttribute("id")).toBe("league-structure");
    expect(screen.getByRole("heading", { name: "12. Admin Discretion", level: 2 }).getAttribute("id")).toBe("admin-discretion");
  });

  it("preserves representative source wording", () => {
    render(<RulebookContent />);

    expect(screen.getByText(/The FPL is a franchise-based league featuring multiple established organizations\./i)).toBeTruthy();
    expect(screen.getByText(/Matches occur weekly on Mondays at 8:00 PM EST\./i)).toBeTruthy();
    expect(screen.getByText(/All decisions regarding conduct violations are final and binding\./i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --run src/components/info/RulebookContent.test.tsx`

Expected: FAIL because `RulebookContent.tsx` does not exist yet.

- [ ] **Step 3: Implement the static Rulebook article**

Create a server component with:

```tsx
export default function RulebookContent() {
  return (
    <article aria-labelledby="rulebook-title" className="...">
      <h1 id="rulebook-title">Franchise Premier League (FPL) Official Rulebook</h1>
      <section aria-labelledby="league-statement">The exact League Statement content.</section>
      <section aria-labelledby="league-structure">The exact Section 1 content.</section>
    </article>
  );
}
```

Use `h2` for the League Statement and numbered major sections, `h3` for numbered subsections, and `h4` for the nested playoff examples and admin subsections. Convert source paragraphs that are clearly enumerations into `<ul>`/`<ol>` while retaining each sentence's exact wording. Include all sections from the captured Rulebook: League Statement, 1–12, Lock-In Window phases, Admin Discretion subsections, staff list, and Changelog.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --run src/components/info/RulebookContent.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the article and tests**

```bash
git add src/components/info/RulebookContent.tsx src/components/info/RulebookContent.test.tsx
git commit -m "feat: add formatted rulebook content"
```

### Task 2: Build the branded info page and resource cards

**Files:**
- Create: `src/components/info/InfoResourceCard.tsx`
- Create: `src/components/info/InfoResourceCard.test.tsx`
- Modify: `src/app/info/page.tsx`
- Create: `src/app/info/page.test.tsx`

**Interfaces:**
- Consumes: `RulebookContent` from Task 1.
- Produces: `InfoResourceCard({ label, description, href }: { label: string; description: string; href: string })` and a populated `/info` route.

- [ ] **Step 1: Write the failing card and page tests**

```tsx
it("renders an external resource card safely", () => {
  render(<InfoResourceCard label="Payment" description="Pay league fees." href="https://example.com" />);

  expect(screen.getByRole("heading", { name: "Payment", level: 2 })).toBeTruthy();
  expect(screen.getByRole("link", { name: /open resource/i }).getAttribute("href")).toBe("https://example.com");
  expect(screen.getByRole("link", { name: /open resource/i }).getAttribute("target")).toBe("_blank");
  expect(screen.getByRole("link", { name: /open resource/i }).getAttribute("rel")).toBe("noopener noreferrer");
});

it("renders all requested resources and the Rulebook navigation", () => {
  render(<InfoPage />);

  expect(screen.getByRole("heading", { name: "Payment", level: 2 })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "MasterDoc", level: 2 })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Rulebook", level: 2 })).toBeTruthy();
  expect(screen.getByRole("link", { name: /1\. league structure/i }).getAttribute("href")).toBe("#league-structure");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- --run src/components/info/InfoResourceCard.test.tsx src/app/info/page.test.tsx`

Expected: FAIL because the card, page implementation, and page test imports do not exist yet.

- [ ] **Step 3: Implement the resource card**

Use a semantic `article` with a level-2 heading, steel description, and a safe external link. Make the label gold with the strongest page-level title treatment:

```tsx
<h2 className="type-display text-3xl text-gold">{label}</h2>
<a href={href} target="_blank" rel="noopener noreferrer">Open resource ↗</a>
```

- [ ] **Step 4: Replace the info placeholder with the page layout**

Render the three cards in a responsive grid, with `Payment`, `MasterDoc`, and `Rulebook` as the exact labels. Add a Rulebook table of contents containing links to `#league-statement`, `#league-structure`, `#auction-draft-format`, `#regular-season-structure`, `#playoff-season-structure`, `#relegation`, `#team-management`, `#match-setup`, `#player-conduct`, `#content-streaming`, `#rule-amendments`, `#lock-in-window`, and `#admin-discretion`, then render `<RulebookContent />` below it. Apply `bg-hash`, `card-brand`, and existing typography/spacing utilities; keep the page readable at mobile widths.

- [ ] **Step 5: Run focused tests to verify they pass**

Run: `npm test -- --run src/components/info/InfoResourceCard.test.tsx src/app/info/page.test.tsx src/components/info/RulebookContent.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the info page**

```bash
git add src/components/info/InfoResourceCard.tsx src/components/info/InfoResourceCard.test.tsx src/app/info/page.tsx src/app/info/page.test.tsx
git commit -m "feat: fill out league info page"
```

### Task 3: Verify the full change

**Files:**
- Modify only if verification exposes an issue: files from Tasks 1–2.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 2: Run the full unit test suite**

Run: `npm test`

Expected: all existing and new tests pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js production build completes successfully and includes the `/info` route.

- [ ] **Step 4: Review the final diff**

Run: `git diff HEAD~2..HEAD --check && git status --short`

Expected: no whitespace errors; only the design/plan docs and info-page implementation files are changed.
