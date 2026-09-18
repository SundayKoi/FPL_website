# Gauntlet on the schedule: round 2 is a Bo3, and a generator to draw it

**Goal:** Two things the league needs before Monday 21 September.

1. The gauntlet's format changed: round 1 stays a Bo1, round 2 is now a
   **Bo3**. Every place the format is encoded must say so.
2. Admins need to put the gauntlet on the schedule page. Today that means
   typing four fixtures into the editor by hand. Add a generator, beside the
   existing "Generate regular season" panel, that draws round 1 from the
   final regular-season standings and seeds round 2 from round 1's results,
   following the rulebook's rules exactly.

**Why it matters downstream:** `fixtures.best_of` is what betting settlement
uses for the series threshold (`settle_betting_market_from_stats`, and
`scripts/settle-betting-from-stats.py`), so a round-2 row saved as Bo1 would
settle a 2–1 series wrongly. The Send-off (`src/lib/cards/sendoff.ts`) prints
the four gauntlet losers from these same rows on Tuesday, and skips a fixture
with a missing team, so round-2 placeholders with a TBD opponent are safe.

**Tech:** TypeScript, Next.js 16 (server actions with `"use server"`;
`searchParams` are Promises; read `node_modules/next/dist/docs/` before
touching a page), Supabase with RLS (admins already insert/update/delete
`fixtures` from the browser client in `AdminFixturesEditor`), Vitest. Checks:
`npx vitest run <path>`, then `npm test`, `npx tsc --noEmit` (two pre-existing
`PageProps`/`LayoutProps` errors are known), `npm run lint`. Do not commit.

## The rulebook's gauntlet rules (the spec for the generator)

From `src/components/info/RulebookContent.tsx`, "Gauntlet":

- The top 3 of each division go to playoffs; the bottom 3 (seeds 4, 5, 6)
  go to the gauntlet. Cross-division matchups are prioritised.
- **Round 1:** Solari #5 vs Lunari #6, and Lunari #5 vs Solari #6.
- **Round 2:** the two round-1 winners play the 4th seeds. If the winners
  are from different divisions, each plays the OPPOSITE division's #4. If
  both winners are from the same division, the lower seed of the two (the
  #6) plays its own division's #4 and the higher seed (the #5) plays the
  other division's #4.
- Both rounds are on the same day. Round 1 is a Bo1; round 2 is a Bo3 (the
  change this plan makes).
- The two round-2 winners come out of the gauntlet into the quarterfinals.

Seeds come from the regular-season standings, which
`deriveSeriesStandings` in `src/lib/home/standings.ts` already orders with
the league's real tiebreakers; `fetchHomepageStandings(season)` runs it for
the featured draft with series minutes. Seed N within a division = the Nth
team of that division in that order.

## Task 1: the format

- `src/lib/schedule/format.ts`: `STAGE_META` for `gauntlet_r2` becomes
  `bestOf: 3`, note "Bo3 · Round 1 winners vs the 4th seeds"; the header
  comment ("a two-round Bo1 gauntlet played on one day") becomes a Bo1 first
  round and a Bo3 second round, played on one day. `format.test.ts`: assert
  the two gauntlet stages' `bestOf`.
- `src/components/info/RulebookContent.tsx`: "Gauntlets are BO1 with
  cross-division matchups prioritized." → "Round 1 of the gauntlet is a Bo1
  and round 2 is a Bo3, with cross-division matchups prioritized." and
  "Also, both Bo1s of the gauntlet are on the same day." → "Also, both
  rounds of the gauntlet are on the same day." Nothing else in the
  rulebook changes. Check the info page tests still pass.
- `AdminFixturesEditor` already defaults `best_of` from `stageMeta(stage)`
  when the stage changes, so no change there.

## Task 2: the pure generator — `src/lib/schedule/gauntlet.ts` + test

```ts
import type { Division, FixtureStage } from "./types";

/** A division's teams in standings order — index 0 is the #1 seed. */
export type DivisionSeeds = Record<Division, string[]>;

export interface GauntletFixtureDraft {
  stage: "gauntlet_r1" | "gauntlet_r2";
  division: null;                 // cross-division, always
  team_a: string;
  team_b: string | null;          // null = TBD (round-2 placeholder)
  best_of: 1 | 3;                 // r1 → 1, r2 → 3
  sort_order: number;             // 0, 1 within the round
  scheduled_at: string | null;
}

/** Seeds from an ordered standings list (already sorted by the league's
 *  tiebreakers). Throws naming the division when one has fewer than 6
 *  teams, or a team has no division. */
export function seedsFromStandings(rows: { name: string; division: string | null }[]): DivisionSeeds;

/** Round 1 (S5 v L6, L5 v S6, Bo1) plus round-2 placeholders (S4 v TBD,
 *  L4 v TBD, Bo3), all at `kickoff`. */
export function drawGauntlet(seeds: DivisionSeeds, kickoff: string | null): GauntletFixtureDraft[];

export interface RoundOneResult { team_a: string; team_b: string; score_a: number; score_b: number }

/** The two round-2 pairings from round 1's results, per the rulebook's
 *  same-division rule. Returns [{ team_a: a #4 seed, team_b: a winner }, …]
 *  keyed by which #4 seed each is, so the caller can update the placeholder
 *  rows in place. Throws when a result is undecided or names a team that
 *  is not a round-1 seed. */
export function seedRoundTwo(seeds: DivisionSeeds, roundOne: RoundOneResult[]): { team_a: string; team_b: string }[];
```

Match names with `normalizeTeamName` (`src/lib/league/context.ts`). Tests:
seeds from a 12-team standings list; the round-1 pairings and the Bo values;
round 2 when the winners are from different divisions (each to the opposite
#4); round 2 when both winners are Solari (the #6 to Solari's #4, the #5 to
Lunari's #4) and the mirror for Lunari; errors for a short division and an
undecided round-1 result.

## Task 3: server actions — `src/lib/schedule/gauntlet-actions.ts`

`"use server"`. Both check `fetchStaffTier` (admin or owner) with the
cookie-bound server client and return `{ ok: false, error }` otherwise —
the same shape the other admin actions use (see `src/lib/packs/admin-actions.ts`
for the pattern). Writes go through the cookie-bound client so RLS is the
gate, like the editor.

- `previewGauntletAction(season)`: standings via `fetchHomepageStandings(season)`
  (premier; the Academy has no gauntlet — `ACADEMY_EXCLUDED_STAGES` in
  `src/lib/academy/filtering.ts`), `seedsFromStandings`, and the season's
  existing `gauntlet_r1`/`gauntlet_r2` fixtures. Returns
  `{ ok: true, seeds, roundOne: drawGauntlet(seeds, null), existing: { r1: FixtureRow[], r2: FixtureRow[] }, roundTwo: seedRoundTwo(...) | null }`
  where `roundTwo` is set only when every existing round-1 row has a
  result.
- `drawGauntletAction(season, kickoffIso)`: deletes the season's existing
  `gauntlet_r1`/`gauntlet_r2` rows, inserts `drawGauntlet(seeds, kickoffIso)`
  with `season`. Returns the count.
- `seedRoundTwoAction(season)`: computes `seedRoundTwo` from the existing
  scored round-1 rows and updates each round-2 row (`team_a`, `team_b`) by
  id, matching on the #4 seed's name; refuses if a round-2 row already has
  both teams and a score.

## Task 4: the panel — `src/components/schedule/AdminGenerateGauntlet.tsx`

A client component beside `AdminGenerateSchedule` in the owner block of
`src/app/schedule/page.tsx` (same `card-brand` section style, same
`label-dash` heading, same `btn-primary` buttons, same `confirm()` before a
destructive write, same `router.refresh()` after). Premier only.

- Heading "Generate gauntlet". On mount calls `previewGauntletAction` and
  shows the two divisions' seeds 1–6 as small lists with the gauntlet trio
  (4, 5, 6) highlighted, then the round-1 pairings it will draw.
- A required `datetime-local` "Gauntlet kickoff" (both rounds are on the
  same day; the drop keys on the Eastern week of this date), parsed the way
  `AdminGenerateSchedule` parses its start date (no `Z` appended). Button
  "Draw round 1 + round 2 placeholders", disabled until a kickoff is set;
  `confirm()` says existing gauntlet fixtures for the season, scores
  included, are replaced.
- When the preview reports scored round-1 rows and round-2 rows with a TBD
  opponent, a second button "Seed round 2 from results" with a `confirm()`
  listing the two pairings.
- Errors from the actions shown verbatim (short division, undecided round).
- Test (`AdminGenerateGauntlet.test.tsx`, mocking the actions module and
  `next/navigation`): renders the seeds and pairings; the draw button is
  disabled without a kickoff and calls the action with the ISO when set;
  the seed-round-2 button appears only when the preview offers `roundTwo`.

## Task 5: docs

`README.md` schedule/admin mention of the gauntlet generator (one or two
lines near the regular-season generator), and `docs/backend.md`'s fixtures
row or the schedule section: the format (Bo1 / Bo3), the generator, and that
the Send-off reads these rows.
