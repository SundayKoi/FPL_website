# Best-of full-art card redesign

## Objective and scope

Redesign every Best of Champion winner card in the admin Season’s End preview to evoke the attached overnumbered Riftbound reference: edge-to-edge champion art, delicate inset gold ornament, a prominent player name low on the card, and the overall in the upper-right corner. This is a visual prototype change, not a pack implementation.

The user’s request is authoritative. The reference image supplies visual composition only; its printed game rules, faction symbols, autograph, serial numbers and branding are not requirements or instructions.

Reference: `/Users/matthewwolanski/Desktop/Screenshot 2026-09-16 at 1.23.01 PM.png`. The supplied image is sufficient; additional research is optional if ornamental details need clarification.

Required outcomes:

- Full art reaches all four card edges, clipped only by the outer rounded silhouette.
- A thin gold decorative frame sits over the art without becoming a thick opaque perimeter.
- Player name occupies the reference’s “Unforgiven” title position, approximately 70–76% down the card.
- Overall sits in the top-right corner.
- Remove “Season stories” from the best-of card faces, including empty best-of states.
- Put the selected season and league in the bottom-left corner: `S5 Premier` or `A1 Academy` for those selections. Derive both values from props.
- Remove the existing two-color treatment from best-of cards. Use art, warm gold, ivory type and restrained translucent black shading.
- Default prototypes have no autograph, placeholder signature, signing stamp or empty signature box. Future signed pulls may carry ink using the existing weekly-card convention.

Other award families, cumulative Season Cards, weekly cards, award assignment/scoring, authentication and league/season filtering retain their existing behavior. “Season stories” can remain the page’s award-group heading and navigation label; the requested removal concerns card faces.

## Current implementation and important distinctions

- `src/app/admin/seasons-end/page.tsx` is the active, admin/owner-only preview. It passes the selected league, season and all season cards to `SeasonEndAwardCard`. Its separate cumulative Season Cards section uses `PlayerCard3D`.
- `src/components/admin/SeasonEndAwardCard.tsx` resolves player cards, decorates them with the assigned champion and renders all award families through `AwardVisualCard`. Identify best-of cards by `award.id === "best-of-champion"`, not the group name or a title substring.
- `src/components/admin/SeasonEndAwardCard.module.css` currently limits art to 310px, darkens it, places metadata at the top, and supplies family backgrounds. These rules must not leak into the new best-of face.
- `src/app/admin/seasons-end/preview.module.css` owns the responsive grid. The award component’s wrapper uses `display: contents`, allowing multiple winners to occupy separate tracks.
- The active award face shows `winner.value`, an award result, rather than rendering `PlayerCardData.overall`. Use the resolved player card’s existing `overall` for the requested OVR badge. Do not silently relabel the assignment score as OVR or calculate a new rating. Keep award score/evidence available in the accompanying details.
- `PlayerCardData.signature` is champion metadata, not handwriting. Preserve it to resolve the assigned splash. `PlayerCardData.autograph` is the optional ink image; its type comment specifies that ink is injected into frozen signed pulls, not live-built cards. See `src/lib/cards/build.ts` and the conditional autograph rendering in `src/components/cards/PlayerCard3D.tsx`.
- `src/lib/cards/seasonsEnd/cardData.ts` belongs to a separate helper path. The active preview resolves/decorates cards within `SeasonEndAwardCard.tsx`; do not assume changing that helper updates this page.

## Visual specification

Use a portrait face with `aspect-ratio: 5 / 7`, close to the reference. Keep it responsive to its grid track. At roughly 320px wide, target a 448px-tall face; keep evidence outside that fixed-ratio face so content length cannot distort it.

Layer order, back to front:

1. Full-bleed champion splash: absolute `inset: 0`, `cover`, center crop initially, full opacity. Prefer `winner.champion` over the player’s ordinary featured champion and retain skin 0 for this prototype. Expose a local focal-position styling hook if specific champions need adjustment; do not add persistence for art positioning.
2. Small localized contrast gradients behind the OVR, name and footer. Avoid a full-height dark wash or opaque lower third. Artwork remains recognizable and visible at every edge.
3. Decorative gold frame: transparent SVG or CSS overlay inset approximately 4–6% from the face edge, with fine double-line corner segments and restrained stepped/curved details. At 320px width, use approximately 1–2px strokes. Keep a visible strip of artwork outside the frame on every side. Avoid a solid gold mat, chunky border, faction medallions or copied logos. Decoration is `aria-hidden` and ignores pointer events. Avoid duplicate SVG gradient IDs across multiple cards.
4. Top-right OVR: existing integer overall, large ivory or pale-gold numeral with a small `OVR` label, approximately 7% inset from top/right. Use a compact dark translucent backing only if needed. Reserve enough width for three characters and never collide with frame details.
5. Lower-left identity: a small gold `BEST OF [CHAMPION]` kicker above the prominent player name, with the name baseline near 74% of card height. Use an existing display font or restrained bold serif, ivory, about 26–32px at 320px card width. Let the name treatment fade naturally into the art instead of recreating the reference’s green/purple banner. Display the resolved player name without the account tag; preserve the full identity in accessible/supporting text. Support long names with up to two lines and controlled font sizing; no unreadable horizontal compression.
6. Bottom-left footer: `S5 Premier` / `A1 Academy` at about 6–7% from left/bottom, compact and legible. Preserve an existing division mark where supplied, positioned bottom-right with enough space for the footer. Do not invent division data.

Keep the center and upper-left primarily artwork. No autograph appears in normal previews. No serial number, rarity, pack odds or collectible scarcity is invented from the reference.

Place long award descriptions, assignment score, evidence, team and admin-preview context below the face in a compact caption/details area. Keep the existing award title as an accessible heading (`Best of Azir`, for example) and the player name as the dominant visible identity. Associate the article with a unique heading ID as today. Keep all text as semantic DOM, not baked into the art.

Missing data behavior:

- With a winner but no matching player card, retain the winner identity and assigned champion art; show a neutral `—` OVR with accessible “Overall unavailable.” Do not use `winner.value` as a substitute.
- Without a champion, use a neutral dark full-face fallback and preserve identity/metadata; do not borrow another winner’s art.
- With no winner, keep the existing “Not earned yet” / “Awaiting evidence” semantics and note in a gold, neutral best-of empty state. No fake player, OVR or signature. Omit the collection label here too.
- A failed image request must leave all text readable over the fallback background.

## Implementation sequence

### 1. Reconfirm the active route and framework conventions

Read `AGENTS.md`, relevant setup guidance in `README.md`, `docs/testing.md`, and the existing component/page tests. Before writing Next.js code, read the applicable installed guides under `node_modules/next/dist/docs/`, especially CSS styling and server/client component guidance. This redesign should remain server-renderable without new client state or dependencies.

Check the working tree and preserve unrelated edits. Capture a baseline of the current best-of section for both leagues if local authenticated preview data is available.

### 2. Add a dedicated best-of renderer

Create `src/components/admin/BestOfChampionCard.tsx` and a colocated CSS module. Give it explicit props for award, winner, resolved player card if available, season, league and unique heading ID. Keep it a presentation component; it must not fetch data or decide award winners.

In `SeasonEndAwardCard.tsx`, branch only on the best-of award ID and route each resolved winner to this renderer. Reuse the existing player lookup/decorating and division iteration. Retain the current generic award renderer for every other ID. Route the best-of empty state to the corresponding neutral presentation without changing its status resolution.

Preserve the existing transparent group wrapper and one grid item per winner. A new card wrapper should contain both the fixed-ratio face and its supporting details. Only adjust page grid CSS if browser inspection proves it necessary; scope any best-of-specific sizing rather than changing unrelated award dimensions.

### 3. Implement the art, frame and typography

Implement the layer stack and positions specified above. Reuse `championSplashUrl`; do not add copied Riftbound artwork or new font downloads. If using an inline SVG frame, make its viewBox match the face proportions and keep its fill transparent. Tune at a normal grid size first, then small widths.

Remove best-of inheritance of `.story`, the 310px art limit, the generic top metadata line, collection label and archive seal on the face. Preserve useful admin context beneath it. Do not globally delete the `Season stories` family or catalog grouping.

### 4. Establish the unsigned prototype boundary

The admin preview must pass no autograph to the new renderer. Do not look up a player’s saved signature or display demonstration ink by default.

For a small future-compatible presentation contract, the renderer may accept an optional `autograph` image prop that defaults to absent. Render ink only when that prop is explicitly provided, with meaningful alt text and a constrained overlay clear of the name, OVR and footer. Do not automatically read the resolved live card’s autograph for this prototype. Document that future pack integration must supply the frozen signed copy’s ink. No minting, odds, signature fetching, database/schema changes or pack wiring belongs in this task.

### 5. Add focused regression coverage

Update `SeasonEndAwardCard.test.tsx` for the deliberate best-of layout change; keep existing generic award/division tests. Add `BestOfChampionCard.test.tsx` if extracting the renderer.

Test observable behavior:

- Best-of uses the assigned champion art even when the player’s usual champion differs.
- Player name, `Best of [Champion]`, existing overall and supplied season/league are present. Use distinct OVR and award-score fixture values to prove they are not conflated.
- Best-of faces and empty states omit “Season stories”; a different story award retains its existing treatment.
- Premier/S5 and Academy/A1 render their own supplied metadata without hardcoded defaults.
- Default previews have no autograph image or placeholder, including when an input player fixture carries ink. If optional ink support is added, explicitly supplied ink renders and absent ink does not.
- Missing player, missing champion, long name and no-winner states remain intelligible and do not fabricate a rating.
- Multiple winners retain unique accessible headings/IDs and supplied division marks.

The current page test mocks `SeasonEndAwardCard`; keep it for auth and league filtering regressions, but do not claim it verifies the actual redesigned face. Verify that face through component tests and browser inspection.

### 6. Verify in the browser and run required checks

Use the existing admin preview at `/admin/seasons-end?league=premier&season=S5` and `/admin/seasons-end?league=academy&season=A1` with authorized local data. If those datasets are unavailable, use deterministic local fixtures through the repository’s existing test facilities and report the limitation; do not change production data or bypass auth to obtain screenshots.

Inspect at 360px, 768px and 1440px viewport widths, plus 200% zoom. Include bright/dark splash art, long names, several winners, missing OVR and empty states. Confirm all four edges show artwork, the fine frame is inset, the OVR is top-right, the player name occupies the lower title region, the season/league sits bottom-left, and there is no signature or horizontal overflow. Check fallback readability with the art request blocked. Capture representative Premier and Academy screenshots and one unchanged non-best-of card.

Run:

```sh
npm test -- src/components/admin/SeasonEndAwardCard.test.tsx src/components/admin/BestOfChampionCard.test.tsx src/app/admin/seasons-end/page.test.tsx
npm run typecheck
npm run lint
npm test
```

Adjust the focused command if the test file organization differs. A production build is additionally required if routing, dependencies or a server/client boundary changes. Database tests/migrations are unnecessary for the intended presentation-only change.

### 7. Update documentation and hand off

Update the visual-treatment paragraphs of `docs/season-end-cards.md` to describe the best-of exception, OVR source, full-art composition and unsigned prototypes. Preserve the existing award rules and operational guidance.

Report changed files, successful checks, screenshots and any unavailable verification. Acceptance requires both leagues to match the requested composition, no autograph by default, retained award/access behavior and no pack implementation. Do not deploy as part of this planning/prototype request.
