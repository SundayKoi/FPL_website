# Best of Champions: centering and ornate frame plan

Status: proposed; standalone visual prototypes only. No application behavior changed.

## Intended result

Keep the current 5:7 full-art cards, Chakra Petch/Saira typography, player-name hierarchy, season/league footer, and Solari/Lunari identity. Improve champion composition across the entire supported roster and add restrained collectible detailing inspired by Riftbound overnumbered cards.

Prototype: `prototypes/best-of-ornate-cards.html`. Compare A (Engraved), B (Celestial, recommended), C (Prismatic), and the existing frame. Toggle proposed crops and foil independently. Reference champions/names match the supplied screenshot. These are four visual samples, not a completed roster audit.

Riot reference: https://playriftbound.com/en-us/news/announcements/collectability-in-riftbound-origins/ — art-forward frames, foiling, UV treatment, and texture inspire the proposed visual treatment. Do not add fictitious serial numbers, rarity claims, or autographs.

## Diagnosis

`src/components/admin/BestOfChampionCard.tsx` renders landscape splash images as portrait background covers. `src/lib/season-end/championArt.ts` has explicit crops for only Milio, Senna, Maokai, and Jhin. All other champions fall back to 50% / 50%, which centers the source image rather than its subject. Diana shows the strongest failure in the reference screenshot.

Keep the existing canonical champion/skin resolver. A universal position change cannot fix differing splash compositions. CSS background-position percentages describe alignment of the image and viewport, not coordinates of the champion's face. At cover scale, an axis with no overflow cannot be repositioned meaningfully.

## Implementation sequence

1. **Build the audit surface.** Enumerate every champion from the existing supported roster, use the exact base-skin splash URL resolver and actual BestOfChampionCard renderer. Provide champion search, review status, x/y controls, and exportable crop values. Keep this developer-only; do not create a public admin bypass. Test render widths around 180, 280, 360, and 480px while retaining 5:7.
2. **Review every base skin.** Start with currently awarded champions, then complete the entire roster. Place faces/primary silhouettes near the horizontal center of the upper art area; allow composition exceptions for creatures, pairs, and unusually wide poses. Keep eyes and identifying details clear of the top-right division seal and lower identity gradient. Preserve intentional weapon/body context. Record explicit reviewed entries even when 50/50 is correct, so missing coverage is distinguishable from approved defaults.
3. **Handle exceptional art correctly.** Prefer simple cover crops with zoom 1. If zoom is needed, apply it relative to a cover-sized art layer; the current `auto zoom*100%` sizing assumes height controls cover. Avoid distortion and empty edges. For subjects touching the source's top edge, horizontal positioning cannot create headroom; move/simplify ornament near that region or deliberately choose an alternate portrait asset after reviewing fidelity. Do not silently swap artwork.
4. **Apply the selected frame.** A: fine corner engraving plus small bottom jewel. B: additional celestial top/bottom details, etched side accents, gold Solari and cool-silver Lunari details. C: geometric engraving plus restrained edge foil. Use one decorative SVG/frame layer and a lightweight CSS foil layer. Keep the center clear, decorative layers aria-hidden and pointer-transparent, and all real identity text in HTML. Avoid looping animation; any optional interaction must respect reduced motion and work without hover. Preserve unspecific division states and empty cards without inventing an emblem.
5. **Verify composition and behavior.** Inspect a contact sheet of every supported champion, plus actual cards at narrow/mobile and desktop widths. Require no accidental face clipping, no emblem/ornament across eyes, legible names/footer, no blank art edges, and no horizontal page overflow. Include both leagues, both divisions, unknown champions, unavailable awards, long names, and the existing explicit autograph case. Retain league/season data isolation; no data or authorization changes are needed.

## Prototype crop candidates

All use y=50, zoom=1. These are visual starting values for base skins only, not source-image focal coordinates.

| Champion | Current x | Proposed x |
| --- | ---: | ---: |
| Senna | 53 | 53 (already close) |
| Illaoi | 50 | 68 |
| Diana | 50 | 80 |
| Sivir | 50 | 64 |

## Code and verification scope

Likely files: `src/lib/season-end/championArt.ts`, its focused test, `src/components/admin/BestOfChampionCard.tsx`, its CSS module and tests; division emblem CSS only if needed by the selected treatment.

Add meaningful coverage for canonical-name aliases, base-skin-only overrides, unknown/future champion fallback, complete reviewed roster coverage, and finite/range-valid crop values. Keep current rendering/accessibility/identity tests. Do not freeze every decorative SVG path in tests.

After implementation: focused championArt and BestOfChampionCard/SeasonEndAwardCard tests, then `npm run typecheck`, `npm run lint`, and `npm test`, following `docs/testing.md`. Browser review remains necessary: unit tests cannot assess face placement. Read the relevant installed Next.js docs before changing app components.

## Decision

Choose A, B, or C (or combine B's frame with C's restrained foil). Recommended: B, keeping ornament within the edges and simplifying the top crown when it conflicts with a champion's face. Finish the full-roster crop review before claiming centering is fixed for all champions.
