# On Air: a production slate where the stat bars were

**Goal:** The On Air card shipped with five stat bars (Mic, Hype, Reads,
Calls, Signal, all 100) and the ordinary record footer (`100–0 · 100% WR ·
PENTA ×100 · LVL 100`). The league wants those gone and something unique in
their place. Replace the whole lower block of an On Air card, the signature
row, the five bars and the footer, with a **production slate**: a
clapperboard, chalk on black, whose fields are the copy's own facts. Nothing
else on the board has one, and every line on it is true of that print.

**Tech and checks:** as `docs/superpowers/plans/2026-09-18-on-air-caster-card.md`
(read it first, and read `src/lib/cards/onAir.ts`, the On Air parts of
`src/components/cards/PlayerCard3D.tsx`, the "The On Air card" block in
`src/app/globals.css`, and `src/lib/cards/onAir.test.tsx`). `npx vitest run
<path>` while working, then `npm test`, `npx tsc --noEmit` (two known
`PageProps`/`LayoutProps` errors; introduce none), `npm run lint`. **Do not
commit.** Never edit `supabase/migrations/20261020000001_on_air_card.sql`:
it is applied to the production database.

## The slate

Rendered by the front face in the exact place the signature row, the stat
rows and the footer sit today (the `flex flex-col` column under the
archetype band), and only when `card.onAir` is set. It must take up the same
vertical room those three took, so the card's height and everything above it
(the waveform, the archetype band) do not move. `data-testid="onair-slate"`.

1. **The sticks.** A band across the top of the slate, ~9px tall, of
   diagonal black-and-white stripes (a `repeating-linear-gradient(-45deg, …)`
   with hard stops), with a tiny label `FPL LIVE` sitting on a small black
   tab at the left so it stays legible over the stripes.
2. **The board.** Near-black ground (`rgb(8 10 14 / 0.88)`), a 1px chalk-grey
   rule under the sticks, faint chalk-dust texture (a couple of low-opacity
   radial gradients), rounded to match the archetype band. Fields are
   "label over value": the label in 8px caps at 55% white with wide
   tracking, the value in white. Values use the display font. Layout:
   - Row 1, two columns: `PROD` → `FPL LIVE` · `SEASON` → `{card.season}`
   - Row 2, two columns: `ROLE` → `{card.role}` · `TAKE` → the hero of the
     slate: `{card.onAir.number}` in ~22px display type with `/ {card.onAir.of}`
     small and at 60% beside it. `data-testid="onair-slate-take"`.
   - Row 3, full width: `SCENE` → `{card.onAir.window}` (the Live Drops
     label the copy was pulled in), one line, truncated.
   - Row 4, full width: `NOTES` → `“{card.motto}”` in italics, one line,
     truncated. The tagline finally prints on the front.
3. **The foot.** One line in 8px caps at 50% white, between the board and
   the frame: `ROLL · SOUND · SPEED` at the left, `● MARK` at the right (the
   dot in the On Air accent). No numbers, no bars.

CSS utilities in the existing "The On Air card" block of `globals.css`,
named `card-onair-slate`, `card-onair-slate-sticks`, `card-onair-slate-tab`,
`card-onair-slate-label`, `card-onair-slate-value`, `card-onair-slate-take`,
`card-onair-slate-foot` (real layout classes like the Send-off's
`card-sendoff-*`, not overlay layers, so no `card-ov-` prefix). Static; no
animation.

## Renderer

`PlayerCardFace`: `const onAir = card.onAir ?? null;`. When set: do not
render the signature row; render the slate where the stat rows are; do not
render the record footer (the same `sendoff ? null : …` shape the Send-off
already uses, extended). The back is unchanged. Nothing changes for any
other card.

## Data and types

- `onAirCard` (`src/lib/cards/onAir.ts`): `subStats: []` (an empty list is
  an established shape: champions relics, roster plates and moments all
  carry one). Keep `overall: 100`, the signature (it drives the art), and
  the rest. Update the header comment: "100 overall, and a production slate
  where the stats would be" instead of "a 100 in every column".
- `src/lib/cards/build.ts`: remove `"mic" | "hype" | "reads" | "calls" |
  "signal"` from `CardSubStat["key"]` and the sentence about them; nothing
  prints them any more.
- `src/lib/gauntlet/queries.ts`: `buildGauntletOptions` skips an On Air copy
  the way it skips a moment, a relic and a plate (a caster has no role and
  no stats to fight with). Test beside it if the file has one.
- Wording, same phrase swap as above: `src/app/admin/on-air/page.tsx`
  header, `src/lib/cards/rarityGuide.ts` `look` for `onair` ("… with the ON
  AIR lamp lit and a production slate where the stats would be. 100
  overall."), the comment block above `ON_AIR_CHANCE` in
  `src/lib/packs/config.ts`, and the On Air paragraph in `docs/backend.md`
  (add one sentence on the slate: sticks, PROD/SEASON/ROLE/TAKE/SCENE/NOTES,
  replaces the signature row, the bars and the footer).

## Tests

`onAir.test.tsx`: `onAirCard` has no sub-stats; an On Air card renders the
slate with the take number, the window, the tagline, the season and the
role; it renders no stat rows and no record footer (assert the `WR` footer
text is absent and no `onair-slate` on an ordinary card); every
`card-onair-slate-*` class referenced exists as an `@utility` in
`globals.css`. Fix the rarity guide / samples / admin page tests the
wording change touches.

## See it

Same harness as the previous plan (`src/lib/cards/zz_onair_harness.test.tsx`,
temporary, never committed; three cards in `<section data-row="onair">`:
Bard #1/25, no signal #12/25, Ahri skin 7 #25/25; then
`HARNESS_OUT=$S/harness.html npx vitest run … && node $S/shot.mjs`; read
`$S/look-onair.png`). Iterate until: the sticks read as a clapperboard, the
TAKE number is the loudest thing on the slate, every field is legible on
all three cards including the no-signal one, the tagline fits on one line,
and the card is exactly as tall as before (compare against the previous
`look-onair.png` in the scratchpad before you overwrite it: copy it to
`look-onair-before.png` first). Delete the harness when done.
