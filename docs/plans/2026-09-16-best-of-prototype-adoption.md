# Adopt the approved Best of Champions prototype

Date: 2026-09-16. Status: implemented in `ea19675` (`Update Season's End card collection`).

## Outcome and authoritative reference

Switch the Best of Champion faces in `/admin/seasons-end` to the latest conversation prototype: clean close-to-edge double outlines, manually face-centered artwork, no overall ratings, and small ornate Solari/Lunari emblems in the upper-right corner.

Reference fragment: `/Users/matthewwolanski/.codex/visualizations/2026/09/16/01a0abc9-3e38-72a2-9067-61ea3a1672bd/champion-card-study.html`.

The final revision uses emblems at **17% of card width**, reduced from 24%. Earlier screenshots and `2026-09-16-best-of-full-art-cards.md` describe superseded OVR and decorative-frame requirements. This plan supersedes those visual requirements only. The prototype's example division assignments are illustrative, not player data. Preserve a reference copy in this change's review materials before further prototype edits; do not ship its base64 artwork or design controls.

## Scope and existing behavior

The active path is `src/app/admin/seasons-end/page.tsx` → `src/lib/season-end/queries.ts` → `src/lib/season-end/derive.ts` → `src/components/admin/SeasonEndAwardCard.tsx` → `BestOfChampionCard.tsx` and its CSS Module.

Verified gaps:

- `Frame()` draws two rounded rectangles plus three sets of ornamental paths. Those paths are the stray lines.
- The frame is inset 4.5%, with width/height 91%; the prototype uses a 7px outer inset.
- Artwork uses `background-size: cover` and a shared center position. The existing focal-position custom property has no per-champion values.
- `BestOfChampionCard` renders `playerCard.overall`, an OVR label, and overall text in the article's accessible label.
- It already accepts `division`, but currently displays it in the footer. The league-wide Best of branch does not supply it.
- Best of candidates produced by the active derivation currently have no division metadata. `AwardWinner.division` and row/fixture division resolution already exist.
- The page owns responsive columns; `SeasonEndAwardCard` uses `display: contents`. Keep those integration contracts.

Change Best of faces and the metadata needed to render their correct emblems. Preserve other award families, cumulative/weekly cards, champion relic packs, scoring, eligibility, coverage-first assignment, champion/player uniqueness, selected league/season, access enforcement, and frozen-signature behavior. No database migration or production operation is expected.

## Visual specification

| Element | Implementation target |
| --- | --- |
| Silhouette | Full-bleed art; 5:7 aspect ratio; 16px outer radius; overflow clipped |
| Outer outline | Continuous rounded rectangle, 7px inset on every side, 1px warm gold `#dfbc71`, 11px radius |
| Inner outline | Continuous 1px line, 4px inside outer outline, subdued gold `#dfbc7159`, 7px radius |
| Decoration | Remove all detached frame ticks, arcs, corner steps, and crossbars |
| Division emblem | Upper-right, top 5.5%, right 6%, width 17% of card; circular seal with square aspect ratio |
| Solari | Gold `#edcd82`; central sun, twelve pointed rays, concentric fine rings, dotted engraving, top/bottom diamond details |
| Lunari | Silver-blue `#d0dcff`; crescent, three stars, matching fine rings and diamond details |
| Emblem text | SOLARI or LUNARI underneath, 9px gap, restrained tracking; no OVR or replacement number |
| Identity | Left/right inset 8%, bottom 15%; champion kicker above player name, matching prototype |
| Footer | Left 8%, bottom 6%; selected season and league; no duplicate division mark |
| Shade | Bottom-focused gradient: strong at bottom, approximately 72% black at 19%, clear by 53%, subtle top shading |
| Typography | Preserve the app's display/body fonts; match prototype scale and spacing using container-relative sizing |

Both divisions retain the same gold perimeter. Division color belongs to the emblem, not a new whole-card color scheme. Keep text readable over bright artwork. Preserve full player identity outside the face and in accessible text; permit two lines for long names without touching the footer. Keep evidence and assignment score in the existing details below the face; removing OVR does not remove the assignment score.

The prototype's two-column showcase is not a request to force two columns on the admin page. Verify individual faces at the widths produced by the existing page grid.

## Implementation sequence

### 1. Establish a reproducible reference

- Inspect `git status --short`; preserve unrelated changes and existing untracked plans/prototypes.
- Read `AGENTS.md`, `docs/testing.md`, and the visual/award contracts in `docs/season-end-cards.md`.
- Follow the installed Next.js CSS Modules and Server/Client Components guides under `node_modules/next/dist/docs/01-app/01-getting-started/` before writing code.
- Capture the final prototype at a known card width. Record its four crops and 17% emblem size.
- Keep the implementation server-renderable with CSS Modules; no client component, effect, image-analysis dependency, or hydration is needed for this design.

### 2. Resolve truthful division metadata without changing assignment

Files: `src/lib/season-end/derive.ts`, `derive.test.ts`, `SeasonEndAwardCard.tsx`, `SeasonEndAwardCard.test.tsx`.

- Build a player-to-division lookup from the same validated, selected-season regular-season rows used for awards. Reuse `rowDivision()` and its fixture inference; do not parse the display team string, which can contain multiple teams.
- Resolve each player's division across their season appearances, rather than only the champion-specific subset. Use the existing normalized player key.
- Conservative rule: if every relevant row resolves and the distinct set contains exactly one division, attach that division to the assigned winner. If rows conflict or remain unresolved, leave it absent. Team changes within one division remain resolvable; cross-division changes do not get an arbitrary badge.
- Annotate assigned winners after `assignChampions()` so this work cannot alter candidate scoring or tie behavior. Keep `partition: "league"`; do not add `divisionStatuses`, run separate assignments, regroup the winners, or grant the same champion once per division.
- In `SeasonEndAwardCard`, pass the winner's division for league-wide cards. Retain explicit divisional context where already supported. An absent division stays absent.
- Where applicable, add a single aggregated mapping note to existing diagnostics for unassigned badges. Do not turn missing division metadata into a missing award or invent a sun/moon default.
- Use the existing selected-season query results. No new query, service-role client, schema field, or migration is necessary.

Acceptance: two winners can display different emblems in the same league-wide result while their champions, order, scores, and assignments remain identical to the pre-change result. Unknown division cards remain valid and have no emblem.

### 3. Replace the face frame and overall badge

Files: `BestOfChampionCard.tsx`, `BestOfChampionCard.module.css`; optional focused `BestOfDivisionEmblem.tsx` and accompanying CSS Module.

- Replace the existing frame SVG with an absolutely positioned decorative CSS element and inner pseudo-element matching the table. Use `pointer-events: none` and `aria-hidden`.
- Remove overall calculation, rating markup, OVR CSS, and overall wording in the article accessible label. Remove `formatInteger` only if no remaining use exists in this file; retain `playerCard` for identity and champion fallbacks.
- Port the prototype's CSS seal construction into a small typed, server-compatible emblem component. Preserve ray tips, rings, dotted engraving, crescent masking, star shapes, and diamond details. Keep all ornament inside the emblem region so it cannot reintroduce stray frame marks.
- Set a single accessible division label on its wrapper and hide decorative children from assistive technology. Render visible SOLARI/LUNARI text once. Do not add interaction or tab stops.
- Render the emblem only for an actual winner with a resolved division. Empty states and unknown mappings get no decorative claim of membership.
- Remove the old Best of footer division mark. Do not change division marks for other award renderers.
- Port identity positioning and bottom gradient. Preserve neutral empty/missing-art states, heading IDs, external details, selected league/season, and explicitly supplied frozen autograph support.
- Preserve layer order: artwork → shading → frame → emblem/identity/footer/autograph. Confirm optional ink does not intersect the lowered identity region; adjust its position only as needed to avoid overlap.

### 4. Introduce curated champion crop metadata

Suggested new files: `src/lib/season-end/championArt.ts` and `championArt.test.ts`.

Use a small typed map keyed by canonical champion ID plus skin number. Current Best of cards use base skin 0. Resolve aliases with `championByName()`; missing/new champions receive a safe center fallback. Do not change shared champion URL helpers or crops for other card families.

For exact parity with the approved prototype, store CSS background-position percentages, explicitly named as crop positions rather than raw face coordinates:

| Base artwork | Horizontal crop | Vertical crop | Zoom |
| --- | --- | --- | --- |
| Milio | 48% | 50% | 1 |
| Senna | 53% | 50% | 1 |
| Maokai | 70% | 50% | 1 |
| Jhin | 64% | 50% | 1 |

Apply these values through typed inline CSS properties on the existing artwork element. Start with `cover`, fixed 5:7 card geometry, and no extra zoom. A constant card aspect ratio makes these crops stable as the card resizes.

These percentages are **not** source-image face coordinates: CSS background-position applies to the overflow after cover scaling. Do not directly substitute a detected face percentage. If future tooling stores raw source coordinates, it must convert the focal point through rendered image dimensions and clamp offsets to avoid empty edges.

Normalization means horizontally centering the face in a pleasing upper composition, not placing every face at the geometric center of the card. The four prototype crops do not normalize eye height or head size. With cover and no vertical overflow, vertical background-position cannot move the artwork; use separately reviewed zoom/translation only where needed, ensuring full coverage.

### 5. Complete artwork coverage and visual calibration

- Build a temporary local contact sheet using the real `BestOfChampionCard` component and deterministic fixtures. Include the four references, long names, bright/dark art, humanoids, monsters, and multi-character artwork.
- Enumerate the bundled champion roster and review each base splash for this treatment. Populate missing entries or explicitly mark a reviewed center crop; do not claim all champions are normalized from four overrides.
- Prioritize champions present in available Premier and Academy Best of results, then complete the base-art roster before calling the centering work complete.
- Choose the main champion's face or recognizable head for monsters; do not center pets, weapons, or foreground effects. Record short comments for unusual choices.
- Review cropped faces against the emblem region and player-name region, not in an art-only view. Keep enough headroom for horns/hair where feasible.
- Use authorized local datasets if available. If not, use deterministic presentation fixtures and report that live-season mapping has not been visually checked. Do not bypass the admin gate or publish a debug route.
- Skin-specific tuning beyond skin 0 is not part of this change. Never apply a base-skin crop to an unrelated skin by accident.

### 6. Regression tests

Update existing tests that intentionally require OVR. Keep unrelated assertions intact.

**BestOfChampionCard tests**

- No visible OVR/rating and no overall wording in the accessible label, even with `playerCard.overall` present.
- Correct Solari/Lunari emblem and readable division label; no duplicate footer mark; absent division renders neither emblem.
- Assigned champion controls art and crop even when `playerCard.signature` names another champion.
- Player/heading identity, evidence score, season/league, and missing-player behavior remain correct.
- Missing champion, empty/unavailable states, long names, unique heading IDs, and optional frozen autograph still work.

**Award integration and derivation tests**

- League-wide Best of winners receive their own resolved divisions without becoming a divisional award.
- Explicit row division, fixture-inferred division, unresolved rows, conflicting divisions, and same-division team changes follow the documented policy.
- Same champion contested across divisions remains assigned at most once within the league; each player still receives at most one champion.
- Premier and Academy season isolation remains intact, including colliding player/team names.
- Attaching division metadata does not alter winner names/champions, scores, ordering, floor eligibility, or maximum coverage.
- Generic Season stories/Teamwork faces keep their current behavior.

**Crop helper tests**

- Canonical aliases resolve to the same entry; base-skin coordinates match the reviewed registry.
- Unknown champion/skin uses the documented fallback without throwing.
- Entries contain finite positions in 0–100 and valid zoom if zoom is introduced.

Avoid assertions on ornamental node counts or giant markup snapshots. Unit tests prove data/rendering contracts; browser inspection proves appearance.

### 7. Browser verification and required checks

Inspect the actual React cards at viewport widths 360, 768, and 1440px, plus 200% zoom. Include multiple cards on the existing grid, both divisions and leagues, one unknown division, empty states, long names, missing player data, failed art loading, and explicitly supplied ink.

Verify:

- Both continuous outlines sit near every edge with even inset and no detached marks.
- Emblems are 17% of card width and remain legible without overlapping faces or the perimeter.
- Neither numeric OVR nor an empty rating placeholder remains.
- Reference faces match the prototype crops; all reviewed roster entries avoid accidental subject clipping.
- Player names and footer stay legible and separated; no horizontal overflow or clipped emblem labels.
- Page access remains admin/owner-only; changing league/season displays only that selection's data.
- CSS mask rendering is correct in Chromium and WebKit where available; inspect the crescent at small sizes.
- Capture before/after screenshots at matching card widths plus a non-Best-of card for regression comparison.

Run these commands from the repository root:

```sh
npm test -- src/components/admin/BestOfChampionCard.test.tsx src/components/admin/SeasonEndAwardCard.test.tsx src/lib/season-end/derive.test.ts src/lib/season-end/championArt.test.ts src/app/admin/seasons-end/page.test.tsx
npm run typecheck
npm run lint
npm test
```

Adjust paths if the final helper organization differs. Per `docs/testing.md`, run `npm run build` if implementation changes routing, dependencies, build configuration, or a server/client boundary. No database tests are required unless actual database or authorization behavior changes. Any unavailable browser/data environment is a reported verification gap, not a pass.

### 8. Documentation and completion

Update the Best of visual treatment in `docs/season-end-cards.md`: no OVR, small division seals, clean edge frame, curated crops, unknown-division fallback, and unchanged league-wide award rules. Retain existing scoring and operational documentation. Reference this plan as the new design decision; preserve earlier plan history rather than rewriting unrelated files.

Implementation is complete when all Best of faces use the new renderer, truthful division metadata reaches them, base-art crop review is complete (with any unavailable assets explicitly identified), the four references match the approved prototype, and relevant checks pass. Report changed files, screenshots, test results, crop coverage, and remaining limitations. This plan does not authorize deployment or production data changes.
