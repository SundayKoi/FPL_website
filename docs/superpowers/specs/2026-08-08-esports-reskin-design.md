# Esports Reskin — FPL Exchange Branding

**Date:** 2026-08-08
**Status:** Approved design, pending implementation plan
**Scope:** Visual restyle of the entire app (draft board, home, login, admin) to match the league's existing brand at fplexchange.com. No logic, prop, route, or user-visible copy changes.

## Brand reference (extracted from fplexchange.com)

- **Logo:** circular crowned-lion crest, "FPL" wordmark — `https://fplexchange.com/fpl-logo.png` (512×512). Copy into `public/fpl-logo.png`.
- **Palette:**
  - Background: `#001F34` (deep navy)
  - Panel/card: `#0A2A47`
  - Header: `rgba(0, 18, 31, 0.9)` (near-black navy, translucent)
  - Border: `#1B4263`
  - Text primary: `#FFFFFF`; text muted: `#A7C0D8` (steel blue)
  - **Gold accent `#F5B62E`** (site's amber, promoted to the money/urgency color): prices, bids, budgets, countdown, nominator indicator
  - Danger red `#EF4444`: countdown ≤ 5s (existing behavior, branded treatment), destructive admin actions
  - Success green (Tailwind emerald-500): unchanged semantics, used sparingly
- **Typography:** Chakra Petch 600/700 italic, uppercase, for display (headings, countdown, prices, team names); Saira for body/UI. Both via `next/font/google` with `Segoe UI, sans-serif` fallbacks.
- **Signature details:**
  - Subtle diagonal-hash texture on page backgrounds (pure CSS, repeating-linear-gradient, ~3% white)
  - Dash-prefixed letterspaced uppercase micro-labels: `— PLAYER POOL`
  - Dashed `#1B4263` borders for empty states (empty role slots, no-lot waiting card)
  - White pill buttons for primary CTAs (like their "Login with Discord")
  - Cards: `#0A2A47` bg, 1px `#1B4263` border, soft dark shadow

## Implementation shape

1. **Tokens once, in `src/app/globals.css`** (Tailwind v4 `@theme`): color tokens (`--color-navy-*`, `--color-steel`, `--color-gold`, etc.) and font-family tokens wired to `next/font` CSS variables set in `layout.tsx`. Utility classes for the hash texture (`bg-hash`), micro-label (`.label-dash`), and display type (`.type-display`).
2. **Layout/header:** crest logo + "FPL EXCHANGE — DRAFT" wordmark (Chakra Petch italic), nav styled like the reference header; AuthButton restyled.
3. **Component sweep** (styling only; class attributes and small non-semantic markup wrappers may change, nothing else):
   - Board: `DraftBoard`, `DraftHeader` (round/status badges), `CenterStage` (broadcast treatment: huge italic gold countdown, red+pulse ≤5s, gold current bid; PAUSED amber; dashed waiting card), `TeamColumn` (nominator gold left edge, gold prices, dashed empty slots, C/FA badges in steel), `PlayerPool` (label-dash header, chips as navy pills with gold active state), `BidFeed` (ticker styling), `BidControls` (gold primary bid buttons), `NominationPicker`, `Toast` (navy panel, gold border for info, red for errors), captain ribbon.
   - Pages: home (draft list as event cards like their "FPL S6" card), login (crest centered above white Discord pill; dev form styled), admin list + editor (navy panels, functional-first).
4. **Dark-only.** No theme toggle. `color-scheme: dark`.

## Constraints (hard)

- Zero changes to: component logic, hooks, props/interfaces, routes, RPC calls, and **user-visible copy** (e2e + tests key on strings like "Bid 11", "Nominate (opens at 10)", "Waiting for … to nominate", login placeholders `email`/`password`, button `Sign in`).
- `aria-pressed` may be added to PlayerPool filter chips (closes a deferred a11y minor; attribute-only, no copy change).
- Fonts self-hosted via `next/font/google` at build time (no runtime Google requests from the deployed site).
- Gates: `npm run build`, `npm run lint` (exit 0), `npm test` (15/15), `npm run e2e` (green) — all must pass unchanged.

## Verification

Playwright screenshots (scratch, not committed) of: home, login, spectator board with live lot, captain view with bid controls + nomination picker, paused state, admin editor — eyeballed against the fplexchange.com reference screenshots for brand fidelity.

## Out of scope

Light mode, logo redesign/derivatives, responsive/mobile redesign beyond what the current layout already does, admin UX changes.

(One favicon exception: replacing the default Next.js favicon with the crest via a `src/app/icon.png` copy of the downloaded logo IS in scope — it's a file copy, no new assets.)
