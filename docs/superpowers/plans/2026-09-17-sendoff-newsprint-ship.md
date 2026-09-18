# Ship Newsprint as the Send-off treatment

**Goal:** The league picked **Newsprint** from the six prototypes on
`/admin/sendoff`. Build it into `PlayerCard3D` as the real treatment every
send-off print wears (driven by `card.sendoff`, frozen on the edition row and
on every pulled copy), and fix what the overlay could not: the masthead
overlapping the OVR ring, and the print number (`#001/99`) landing on the
masthead's rules where it could not be read.

**Why a real layout and not the overlay:** an overlay draws above the card and
cannot move anything. As part of the face, the masthead is a band the rest of
the layout flows under: the tier pill, the OVR ring and the serial sit below
it on the photo block, the stamp is real text placed clear of the name, and
the stub prints the series and the record in ink instead of a fixed legend.

**Tech:** `src/components/cards/PlayerCard3D.tsx`, `src/app/globals.css`,
`src/lib/cards/sendoffLooks.ts`, `src/app/admin/sendoff/page.tsx`, tests
beside each, `docs/backend.md`. Checks: `npx vitest run <path>`, then
`npm test`, `npx tsc --noEmit` (two pre-existing `PageProps`/`LayoutProps`
errors are known), `npm run lint`. Do not commit.

**See it:** a temporary harness renders the treatment through the real
component so you can look at it in Chromium (stand-in art; the Riot CDN is
blocked here). `src/lib/cards/zz_sendoff_harness.test.tsx` is that harness —
temporary, never committed, never edited into the real tests.

```
S=/tmp/claude-0/-home-user-FPL-website/c8504eab-4faa-5e0f-bde4-ae130c1ae6a3/scratchpad
HARNESS_OUT=$S/harness.html npx vitest run src/lib/cards/zz_sendoff_harness.test.tsx --reporter=dot
node $S/shot.mjs            # recompiles globals.css, paints, writes $S/look-*.png and $S/sendoff-looks-all.png
```

Then Read `$S/look-shipped.png` (the five stages, shipped treatment) and
`$S/look-reference.png`. Re-run both after every change to the renderer or
the CSS. Iterate until nothing overlaps and every piece of type is legible at
the card's real size (320×448 on the page).

## The treatment, as the renderer draws it

Applies when `card.sendoff` is set on a player card (not a moment, roster
plate or champions relic — those branch before any of this). Everything
below is real JSX in `PlayerCardFace`, with utilities in `globals.css` named
`card-sendoff-<layer>` in one marked block "The Send-off (shipped)" next to
`card-frame-champion`. The mockup's `card-ov-so-newsprint-*` utilities are
the starting point for each layer's CSS: port them, then delete them (the
mockup entry will reuse the shipped classes — see below).

1. **Frame and halo.** Unchanged: the tier frame, Card of the Week, the
   Champion's `card-frame-champion`, Eclipse. The paper is inside the frame.
2. **Paper.** A cream page gutter (~7px) inside the frame, a fibre grain, a
   faint (~10%) paper tint over the whole face. Nothing else on the card's
   dark ground changes, so the stat block stays white-on-dark.
3. **Masthead.** A full-width cream band at the top of the face, ~44px:
   "THE SEND-OFF" in condensed black italic display type, a subline
   "PLAYOFF EDITION · {EXIT_LABELS[exit].toUpperCase()}{series ? ` · ${series}` : ""}",
   a black rule and a red press rule painted along its bottom edge. Champion:
   the title in gold-foil ink (the mockup's `newsprint-foil` treatment).
4. **The row below it.** The tier banner row (tier pill, OVR ring, serial) is
   pushed below the masthead — `pt-3` becomes a larger top padding when
   `card.sendoff` is set — so the ring and `#001/99` sit on the photo block,
   white on dark halftone, never on the masthead. Nothing in that row is
   restyled; it just moves. Check the ring is whole and the serial legible
   in the render.
5. **Photo block.** From under the masthead to the top of the archetype
   band, the art is screened: the art `<img>` gets a class that applies
   `filter: grayscale(1) contrast(1.6) brightness(1.02)` for every stage but
   the Champion (the Champion keeps colour, at most `contrast(1.08)`), and a
   halftone dot-screen layer with a paper wash that peaks near the top and
   fades to nothing before the name (the mockup's `newsprint-screen`). The
   name, role and team over the art stay white and legible.
6. **The stamp.** A real element, not `content:`. A double-ruled box rotated
   about −7°, the stage word (`SENDOFF_META[stage].stamp`) in the stage's
   accent as rubber-stamp ink with a slight bleed (blur + shadow), sitting in
   the lower-right of the photo block, above the archetype band and clear of
   the name/role at the left. `data-testid="sendoff-stamp-ink"`. The shipped
   ribbon (`sendoff-ribbon`) is NOT rendered in this treatment — the stamp is
   the stage. The send-off coin in the strip stays; Card of the Week's pill
   still renders under the stamp row when the card is crowned (check they do
   not collide; move the pill if needed).
7. **The stub.** The foot of the card becomes a perforated ticket stub: a
   dashed rule with punched holes along its top edge, cream ground, and two
   rows of ink: row one, small, "THE SEND-OFF · PLAYOFF STUB" left and a
   boxed "ADMIT ONE" right; row two, the card's own footer facts in dark ink
   — `{wins}–{losses} · {winratePct}% WR`, `PENTA ×{pentas}`, `LVL {level}` —
   replacing the dark footer row that normally prints them (do not print
   them twice). Keep the IMPACT row above it fully visible.
8. **Back.** Unchanged (the ledger already lists the send-off coin).

Stage ladder: the stamp ink runs the accents (pewter → bronze → silver → gold
→ gold), and only the Champion gets the gold masthead and the colour photo.
Read the accents from `SENDOFF_META`, never a second table.

## The mockup entry and the admin page

`src/lib/cards/sendoffLooks.ts`: the `newsprint` entry gains `shipped: true`
(add the optional field to `SendoffLook`) and drops its layers to `front: []`,
no `artEcho`, no `byStage` — the renderer now draws it off `card.sendoff`.
Its blurb says it shipped. Keep the other five exactly as they are; they
remain alternatives, drawn over the shipped treatment as before.

`src/app/admin/sendoff/page.tsx`: in the looks section a shipped look's row
renders its three cards with NO overlay and a "Shipped" tag on the caption;
the intro says Newsprint is the shipped treatment and the other five are
alternatives drawn over it. The five-exits section needs no change (it
renders the real treatment now). Update `page.test.tsx` accordingly.

## Tests

- `PlayerCard3D.test.tsx`, in the send-off block: masthead title and subline
  (round and series) render; the stamp element carries the stage word; no
  `sendoff-ribbon` on a send-off card; the stub shows "ADMIT ONE" and the
  record line; the art carries the ink class for a finalist and not for a
  champion; the banner row carries the pushed-down class; the coin and the
  champion frame tests still pass; an ordinary card renders none of it.
- `sendoffLooks.test.ts`: newsprint is `shipped` and has no layers; the
  other five still reference only existing `card-ov-so-` utilities; the
  shipped `card-sendoff-*` utilities exist in `globals.css`.
- Admin page test: six rows still render; the shipped row's cards have no
  overlay.

## Docs

`docs/backend.md`, "The Send-off": one paragraph on the Newsprint treatment
(masthead, screened photo, stamp, stub; the Champion's gold masthead and
colour photo), and that `/admin/sendoff` keeps the other five as alternatives.
