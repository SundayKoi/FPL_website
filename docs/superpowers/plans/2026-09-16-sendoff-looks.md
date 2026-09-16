# Send-off looks: six prototypes for a playoff card that is not a season card

**Goal:** Give the league owner six genuinely different looks for the Send-off
print to choose between, drawn on real cards on `/admin/sendoff`, each with
its own idea of what a playoff keepsake is. Mockups only, through
`PlayerCard3D`'s `overlay` prop, the road every overlay proposal takes
(`src/lib/cards/overlayMockups.ts`, `src/lib/cards/dribbMockups.ts`). Nothing
mints. When one is chosen it becomes the treatment `card.sendoff` turns on.

**Why they must differ from everything already on the board:** the tier
frames are shifting metallic gradients; Card of the Week is molten gold;
Eclipse is gold leaf over obsidian; the shipped Champion frame is white-gold
over crimson; the skin lines are PROJECT (orange glitch, scanlines), Harrowing
(green moon, violet fog), Academy (gilded corners, parchment, wax seal),
Arcade (pixels, rolling rainbow), Arcana (gold sunburst on indigo), K/DA
(magenta stage lights, lens flare), Battlecast (reticle, brushed steel, hazard
strip). Dribb has a star-field, a kintsugi and an aether look. The existing
overlay proposals cover hologram stamps, parallax, CMYK plates, patch windows,
superfractor, redemption, rookie roundels, ghost rare, etched foil, wear
grades and slabs. A send-off look may not read as any of those.

**Tech:** `src/lib/cards/sendoffLooks.ts` (data, pure), utilities in
`src/app/globals.css` (`card-ov-so-<look>-<layer>`, in one marked block after
the Dribb block, added to the reduced-motion list if animated), a new section
on `src/app/admin/sendoff/page.tsx`, tests beside each. Checks:
`npx vitest run <path>`, then `npm test`, `npx tsc --noEmit` (two pre-existing
`PageProps`/`LayoutProps` errors are known; introduce none), `npm run lint`.
Do not commit.

## The renderer's contract (already there)

`PlayerCard3D` takes `overlay?: OverlayPreview` =
`Pick<OverlayMockup, "front" | "back" | "chip" | "artEcho" | "ink" | "accent">`.
`front` classes are each rendered as an absolutely positioned `<div>` inside a
`pointer-events-none absolute inset-0 overflow-hidden rounded-xl` container
above the foil, with `--ov-accent` set; `chip` renders `card-ov-chip` top-left;
`artEcho` puts a second copy of the art over the original with that class, so a
whole-art treatment (grayscale, sepia, halftone-ish contrast, cyanotype) is a
CSS `filter` on the echo at full opacity; `back` layers draw on the back. Read
`card-ov-shiny`, `card-ov-ghost-rare`, `card-ov-patch`, `card-ov-souvenir` and
the Dribb block for the conventions (position absolute, inset, gradients,
`mix-blend-mode`, `::before/::after` for extra shapes, `var(--ov-accent)`).

Send-off cards also carry the shipped ribbon and coin (and the Champion frame)
under any overlay. That is fine for a mockup: each look adds its own stage
label in its chip or a layer, and the caption says what it would replace.

## `src/lib/cards/sendoffLooks.ts`

```ts
import type { OverlayPreview } from "@/components/cards/PlayerCard3D";
import type { SendoffMark, SendoffStage } from "./sendoff";

export interface SendoffLook {
  key: string;
  title: string;
  /** What it looks like, one line. */
  blurb: string;
  /** What it feels like to hold, one line — the reason to pick it. */
  feel: string;
  /** How the five stages differ inside the look, one line. */
  ladder: string;
  accent: string;
  front: string[];
  back?: string[];
  artEcho?: string;
  /** Stage-specific additions: extra front layers, a different echo, a
   *  different accent. The Champion always differs. */
  byStage?: Partial<Record<SendoffStage, { front?: string[]; artEcho?: string; accent?: string }>>;
}

/** The chip line: "SEMIFINALIST · 1–3 · SEMIFINALS". */
export function sendoffLookChip(mark: SendoffMark): string;

/** The overlay for one card in one look — base layers plus the stage's. */
export function sendoffLookOverlay(look: SendoffLook, mark: SendoffMark): OverlayPreview;

export const SENDOFF_LOOKS: SendoffLook[];
```

Six looks. Names and directions are fixed; the CSS is yours to make good.

1. **Newsprint** (`newsprint`). The match-day programme. Off-white newsprint
   ground with a faint fibre grain, the art in black ink at high contrast
   (echo: grayscale + contrast, a dot-screen feel via a repeating radial
   gradient layer over it), a masthead band across the top reading THE
   SEND-OFF in condensed black type, the round as a headline. The stage is a
   red rubber stamp: rotated a few degrees, rough edge, ink bleed
   (box-shadow + slight blur on a bordered box with the text). A perforated
   ticket stub along the foot (dashed rule, a row of punched dots) carrying
   the series line. Ladder: the stamp ink goes grey → bronze → silver → gold;
   Champion: the masthead prints in gold-foil ink and the photo is hand-tinted
   (echo drops to partial opacity so colour comes back through).
   Must not read as parchment or a wax seal (that is the Academy skin line).
2. **The Plaque** (`plaque`). The hall-of-fame wall. Dark walnut ground (a
   wood-grain gradient, matte), a brass nameplate across the foot with the
   stage engraved (inset text-shadow) and the series under it, four brass
   screw heads in the corners, the art behind a bevelled window with a soft
   vignette. Ladder: the plate metal is pewter → bronze → silver → gold;
   Champion: gold plate with an engraved laurel wreath either side of the
   word. Matte and engraved, never brushed steel or a gradient that moves.
3. **Rafters** (`rafters`). The banner in the arena roof. A felt pennant
   hangs behind the art from the top edge, in the team's colour (accent
   fallback), with the stage and the season stitched in a lighter thread,
   fringe along its bottom edge; the ground is the dark of a gym ceiling; one
   warm floodlight falls from above. Ladder: the pennant trim goes grey →
   bronze → silver → gold; Champion: two banners overlapping and a scatter of
   frozen confetti flecks.
4. **Curtain Call** (`curtain`). The last bow. The art in black and white
   (echo: grayscale) under a single warm spotlight cone from top-left; deep
   crimson theatre curtains hang in at both edges with visible folds; a
   marquee bar across the foot with a row of bulb dots carries the stage.
   Ladder: more bulbs lit the further the team got; Champion: the spotlight
   turns gold and the curtains draw back to the edges. Must not read as K/DA:
   one white-to-warm light, no magenta, no lens flare.
5. **The Bracket** (`bracket`). The blueprint of the run. Navy ground with a
   fine cyan grid; the bracket drawn in thin cyan line-art behind the art
   (eight nodes into four into two into one, as `::before`/`::after`
   gradients and borders, or an inline SVG data-URI background), the team's
   path drawn brighter; the art in cyanotype (echo: grayscale + a cyan tint
   via sepia/hue-rotate); annotation text in monospace for the round and the
   series. Ladder: how far the lit path runs; Champion: the path runs to the
   trophy node at the top and turns gold.
6. **Yearbook** (`yearbook`). The photograph in the drawer. The art as an old
   photo (echo: sepia, slightly faded, a light leak at one corner), a white
   photo border with a scalloped or deckled edge, four black photo-corner
   mounts, a handwritten white-ink caption on the border in a cursive/hand
   font from the existing font stack (e.g. italic display) reading the stage
   and season. Ladder: the caption; Champion: the photo is hand-tinted back
   to colour and one corner carries a gold-leaf mount.

## The admin page

New section between "The five exits" and the dry run, `aria-label="Looks"`,
heading "Six looks · prototypes". Intro: what the section is for, that these
are mockups, that the shipped treatment (ribbon, coin, Champion frame) shows
under them, and that picking one makes it the real treatment.

- **Reference row** first: the same real card three ways, captioned "Season
  card", "Season 5 skin line" and "Shipped send-off". The skin-line one
  renders the way `src/app/skin-lines/page.tsx` does (`forceFoil`,
  `foilType={tier.replaces}`, `preview={previewOf(line, tier)}` for
  `CURRENT_LINE` and the Chroma tier). The shipped one is `withSendoff` for
  a semifinalist.
- **One row per look**: three cards — quarterfinalist, finalist, champion —
  each `withSendoff(base, mark)` with `overlay={sendoffLookOverlay(look, mark)}`,
  interactive. Use the best three season cards so the same three faces
  appear in every row and the looks compare like for like. Caption per row
  (title, blurb, feel, ladder) in the `card-brand` panel style the overlays
  page uses; caption per card: the stage label.

Tests:

- `sendoffLooks.test.ts`: six looks with unique keys; every look has at least
  one front layer or an art echo; every class name starts with `card-ov-so-`;
  every class name referenced exists as an `@utility` in `globals.css` (read
  the file in the test, like `config.test.ts` reads a migration); the
  champion overlay differs from the finalist overlay in every look; the chip
  reads `CHAMPION · 3–1 · FINALS` for a champion mark.
- `page.test.tsx`: the looks section renders six rows, each with three cards,
  and the reference row renders three; mock `PlayerCard3D` as the existing
  test does and assert on `data-testid="look-<key>"` and `data-look-stage`.

Keep every layer static unless motion is the point (the confetti, the
spotlight); anything animated goes in the reduced-motion list next to the
Dribb classes.
