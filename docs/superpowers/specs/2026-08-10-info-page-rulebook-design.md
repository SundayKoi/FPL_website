# Info Page and Rulebook Design

## Goal

Replace the empty `/info` page with a useful league information hub containing the requested Payment, MasterDoc, and Rulebook links. Present the Rulebook directly on the page with the source document's wording preserved exactly and its existing hierarchy converted into a readable Markdown-style layout.

## User-facing design

The page will use the existing FPL visual language: dark navy background, hash texture, blue panels, steel secondary text, and gold accents.

The page structure is:

1. An info-page introduction.
2. Three responsive resource cards titled `Payment`, `MasterDoc`, and `Rulebook`.
3. A Rulebook table of contents linking to the major sections and subsections.
4. The full Rulebook content, rendered with semantic headings, paragraphs, and lists.

The three resource titles are the page's strongest gold accents. Internal Rulebook headings remain white/steel to preserve hierarchy. The Rulebook card and article both link to the Google Docs source. External links open in a new tab with `noopener noreferrer`.

## Content requirements

- Payment links to `https://www.paypal.com/paypalme/DraftFPL`.
- MasterDoc links to the supplied Google Sheets document.
- Rulebook links to the supplied Google Docs document.
- Rulebook wording remains unchanged, including current capitalization, punctuation, terminology, and typos.
- Existing Rulebook section structure is represented as headings and nested lists where the source uses list-like content.
- Major sections and subsections have stable anchors for table-of-contents navigation.

## Implementation

Use the existing App Router page at `src/app/info/page.tsx` and existing Tailwind utilities in `src/app/globals.css`. Keep the page server-rendered and avoid adding a Markdown parsing dependency; the page will use static typed data and semantic JSX to provide the Markdown-style presentation.

Add or update focused tests for the resource links, major Rulebook headings, and representative exact wording. Verify with the repository's lint, unit-test, and production-build commands.

## Out of scope

- Editing or synchronizing the Google Docs source automatically.
- Rewriting, summarizing, or correcting Rulebook content.
- Adding authentication, CMS functionality, search, or a new content-management dependency.
