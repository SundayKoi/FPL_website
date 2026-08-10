# Split 5 Info Page Rulebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace the stale embedded /info Rulebook article with the supplied Split 5 rulebook while preserving the existing branded layout and adding its gauntlet/playoff visual.

**Architecture:** Keep the server-rendered App Router page and existing resource-card/table-of-contents shell. Replace the static RulebookContent JSX with the copied Split 5 hierarchy and exact source wording, and render the source bracket as a local semantic figure so the page does not depend on Google Docs' canvas or remote image URLs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

## Global Constraints

- Preserve the supplied Split 5 Rulebook wording, including capitalization, punctuation, terminology, and typos.
- Rulebook source URL: https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7.
- Keep Payment at https://www.paypal.com/paypalme/DraftFPL.
- Keep MasterDoc at https://docs.google.com/spreadsheets/d/187hoKxxeSpSPtDAmlrTOeuDrcz5kpdwv1qgQ5kipaHY/edit?usp=sharing.
- Preserve external-link target="_blank" and rel="noopener noreferrer" behavior.
- Keep the page server-rendered and do not add a Markdown parser, CMS, or runtime document fetch.
- Keep existing FPL utilities: bg-hash, card-brand, label-dash, type-display, font-display, text-steel, text-gold, border-line.
- Do not stage or modify unrelated players_name_role.csv or the existing unrelated design changes.

---

### Task 1: Add failing coverage for the Split 5 snapshot

**Files:**
- Modify: src/app/info/page.test.tsx
- Modify: src/components/info/RulebookContent.test.tsx

**Interfaces:** Tests exercise InfoPage and RulebookContent through their public rendered output; no new production interface is introduced.

- [ ] Step 1: Update page tests to assert the new Rulebook source URL.

Add an assertion that the Rulebook resource card's Open resource link has href equal to https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7.

- [ ] Step 2: Add failing assertions for Split 5 content and the figure.

Extend RulebookContent.test.tsx with this focused test:

~~~tsx
it("renders the Split 5 rules and the playoff figure", () => {
  render(<RulebookContent />);

  expect(screen.getByRole("heading", { name: "League Overview", level: 2 })).toBeTruthy();
  expect(screen.getByText(/150 ranked games \(S15 \+ S16\)/i)).toBeTruthy();
  expect(screen.getByText(/Each captain will get bids that will be placed blindly/i)).toBeTruthy();
  expect(screen.getByText(/Players can be removed from the league under strenuous circumstances/i)).toBeTruthy();
  expect(screen.getByText(/Founders: Rutledge, Jake, JayDK, & Repped/i)).toBeTruthy();
  expect(screen.getByRole("figure", { name: /gauntlet and playoff format/i })).toBeTruthy();
  expect(screen.getByRole("img", { name: /gauntlet and playoff bracket/i })).toBeTruthy();
});
~~~

- [ ] Step 3: Run the focused tests and confirm the expected red failure.

Run:
~~~bash
npm test -- --run src/app/info/page.test.tsx src/components/info/RulebookContent.test.tsx
~~~
Expected: FAIL because the page still points to the old Rulebook URL and the article does not contain the Split 5 wording or figure.

### Task 2: Replace the article and source link

**Files:**
- Modify: src/app/info/page.tsx
- Modify: src/components/info/RulebookContent.tsx

**Interfaces:**
- InfoPage continues to render the existing page shell and passes the Split 5 source URL to the Rulebook resource card and source link.
- RulebookContent continues to render one server-side article with stable section IDs.

- [ ] Step 1: Update the Rulebook resource URL.

Replace the resources Rulebook href and leave Payment and MasterDoc unchanged. Update rulebookSections to these labels and IDs:
~~~tsx
const rulebookSections = [
  ["League Overview", "league-overview"],
  ["League Structure", "league-structure"],
  ["Auction Draft Begins", "auction-draft"],
  ["Nemesis Draft Begins", "nemesis-draft"],
  ["League Format", "league-format"],
  ["Game Rules/Penalties", "game-rules"],
  ["Gauntlet", "gauntlet"],
  ["Playoffs", "playoffs"],
  ["Additional Rules & Aspects", "additional-rules"],
  ["FPL Staff", "staff"],
] as const;
~~~

- [ ] Step 2: Replace stale RulebookContent JSX with the Split 5 hierarchy.

Keep the existing article class constants and rewrite the article into semantic sections for the exact source headings and wording: title; League Overview (Welcome Message, Entry Fees & Prizes, Player/Captain Registration, Player Eligibility); League Structure (Beginning of a New Split, Phase 1, Phase 2, Auction Draft Begins, Nemesis Draft Begins, League Format, Game Rules/Penalties, Gauntlet, Playoffs); Additional Rules & Aspects (Trades, Subs/Esubs/Replacements, Mid Series Subs, Conduct & Integrity, Unprofessional Conduct, Streaming & Content, Rule Amendments, FPL Staff); and the closing authorship/staff text.

Use ul/ol only where the copied source is list-like, keep each source sentence verbatim, and give the top-level headings these IDs: league-overview, league-structure, auction-draft, nemesis-draft, league-format, game-rules, gauntlet, playoffs, additional-rules, staff.

- [ ] Step 3: Add the local gauntlet/playoff figure.

Inside the Playoffs section add a responsive figure with a div role="img" aria-label="Gauntlet and playoff bracket showing quarterfinals, semifinals, and grand finals", plus a visible figcaption "Gauntlet and playoff format and flow." Represent the source matchups in three responsive columns: quarterfinals (SOLARI #1–SOLARI #5, LUNARI #1–SOLARI #4, SOLARI #2–LUNARI #3, LUNARI #2–SOLARI #3), semifinals (SOLARI #1–LUNARI #2, LUNARI #1–SOLARI #2), and grand finals (SOLARI #1–LUNARI #1). Style each match as a panel using existing brand colors and keep text readable at mobile widths.

- [ ] Step 4: Run focused tests and confirm green.

Run:
~~~bash
npm test -- --run src/app/info/page.test.tsx src/components/info/RulebookContent.test.tsx src/components/info/InfoResourceCard.test.tsx
~~~
Expected: all focused tests pass with no test failures.

### Task 3: Verify the complete implementation

**Files:** Modify only Task 1–2 files if verification finds a defect.

- [ ] Step 1: Run lint. Run npm run lint. Expected: exit code 0.
- [ ] Step 2: Run the full unit suite. Run npm test. Expected: all test files and tests pass.
- [ ] Step 3: Run the production build. Run npm run build. Expected: the Next.js build completes successfully and includes /info.
- [ ] Step 4: Review the final diff and status.

Run:
~~~bash
git diff --check
git diff -- src/app/info/page.tsx src/components/info/RulebookContent.tsx src/app/info/page.test.tsx src/components/info/RulebookContent.test.tsx docs/superpowers/plans/2026-08-10-info-page-rulebook.md
git status --short
~~~
Expected: no whitespace errors; unrelated files remain unstaged and untouched.
