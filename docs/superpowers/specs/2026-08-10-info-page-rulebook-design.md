# Info Page and Split 5 Rulebook Design

## Goal

Keep the existing `/info` page layout while replacing its stale embedded article with the contents of the supplied Split 5 rulebook. The page must retain the source document's wording, section hierarchy, and gauntlet/playoff visual in a responsive, branded presentation.

## User-facing design

The existing page shell remains unchanged:

1. Info-page introduction.
2. Responsive Payment, MasterDoc, and Rulebook resource cards.
3. Rulebook table of contents with stable hash anchors.
4. Full Split 5 rulebook article.

The article uses the current FPL visual language: dark navy background, hash texture, panel cards, steel body text, white headings, and gold accents. External resource links continue to open in a new tab with `noopener noreferrer`. The Rulebook resource card and “Open source Google Doc” link both point to the user-supplied Split 5 document.

The source's gauntlet/playoff diagram is reproduced as a local semantic responsive bracket component. This keeps the visual available even when Google Docs is unavailable and avoids depending on Google Docs' canvas or temporary image URLs. It shows the source's quarterfinal, semifinal, and grand-final matchups and is labeled as a Rulebook figure.

## Content requirements

- Preserve the Split 5 rulebook wording exactly, including capitalization, punctuation, terminology, and typos.
- Include the document's League Overview, League Structure, auction/free-agency phases, Nemesis Draft, League Format, Game Rules/Penalties, Gauntlet, Playoffs, Additional Rules & Aspects, Trades, Subs/Esubs/Replacements, Mid Series Subs, Conduct & Integrity, Unprofessional Conduct, Streaming & Content, Rule Amendments, and FPL Staff sections.
- Update the Rulebook source link to `https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7`.
- Keep Payment and MasterDoc destinations unchanged.
- Represent source headings with semantic `h1`–`h4` elements and list-like source content with semantic lists where doing so does not change the wording.
- Give every table-of-contents target a stable, unique ID.
- Include accessible alternative text and a visible caption for the reproduced bracket figure.

## Implementation

Use the existing App Router page at `src/app/info/page.tsx`, `InfoResourceCard`, and Tailwind utilities in `src/app/globals.css`. Keep the route server-rendered and avoid adding a Markdown parser or CMS dependency. Replace the stale static `RulebookContent` JSX with the Split 5 content and add a focused local bracket component only if it keeps the article readable and testable.

Update focused tests before implementation to cover:

- the new Split 5 source URL;
- preserved exact wording from the supplied document;
- the new source section anchors and staff text;
- the rendered gauntlet/playoff figure and accessible caption;
- the existing resource-card and table-of-contents behavior.

Verify with the repository's lint, unit-test, production-build, and final diff checks.

## Error handling and maintenance

The page is static and has no runtime source-fetching path, so it has no document-load failure state. The source link remains available for future rulebook revisions, while the embedded article is intentionally a versioned snapshot of Split 5. If a future rulebook changes, its article text, table of contents, visual figure, and focused tests should be updated together.

## Out of scope

- Editing or synchronizing the Google Docs source automatically.
- Rewriting, summarizing, or correcting Split 5 rulebook content.
- Adding authentication, CMS functionality, search, or a new content-management dependency.
