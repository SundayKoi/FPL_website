# Remove the card Gauntlet, Showdown and the Pack stats page

**Goal:** Three features come off the site entirely: the card-battle
**Gauntlet** under Play (`/cards/gauntlet`, `/admin/gauntlet`), **Showdown**
(Hold'em with the cards, `/cards/showdown`, its sweep cron) and the
**Pack stats** page (`/cards/stats`, `/academy/cards/stats`). Every page,
component, action, query, cron, announcement, tab, glossary entry, admin
card and line of copy that belongs to them goes; nothing that remains may
import from them or link to them. The database is NOT touched.

**What stays, and must not be confused with the above:**
- The league's **playoff gauntlet** on the schedule page: fixture stages
  `gauntlet_r1`/`gauntlet_r2`, `src/lib/schedule/gauntlet.ts`,
  `gauntlet-actions.ts`, `AdminGenerateGauntlet`, the rulebook's gauntlet
  section, the Send-off's `gauntlet` stage and stamp, `STAGE_META`. Any
  "gauntlet" that means the bracket round is a league fixture and stays.
- Fantasy, Expeditions (and their ledger), the Weekly Draw, Higher/Lower,
  Guess the Card, FPL'dle, betting, the market, `/admin/analytics` (minus
  its Showdown section).
- **Every migration and pgTAP test.** Tables (`gauntlet_*`, `showdown_*`),
  RPCs and their tests stay as they are: migrations are immutable, and a
  drop would destroy run history. Orphaned RLS'd tables nobody reads are
  harmless. Do not add a migration.

**Tech and checks:** as the other plans in this folder. Read `AGENTS.md`.
`npx vitest run <path>` while working, then `npm test`, `npx tsc --noEmit`,
`npm run lint`. After this change `tsc` must show exactly ONE pre-existing
error (`src/app/layout.tsx … LayoutProps`); the other known one lives in the
Showdown page and disappears with it. **Do not commit.**

## Task 1: the one thing to save first

`mulberry32` in `src/lib/gauntlet/sim.ts` is imported by
`src/lib/expeditions/{company,journal,routes,weather}.ts`. Move it (the
function and its tests, if any) to `src/lib/expeditions/prng.ts` with a
one-line header, repoint those four imports, and only then delete the
gauntlet module. Check nothing else in `src/lib/gauntlet/` is imported by
a surviving file (`grep -rn "lib/gauntlet" src scripts` must be empty at
the end).

## Task 2: delete

Whole directories: `src/lib/gauntlet/`, `src/components/gauntlet/`,
`src/app/cards/gauntlet/`, `src/app/admin/gauntlet/`, `src/lib/showdown/`,
`src/components/showdown/`, `src/app/cards/showdown/`,
`src/app/api/showdown/`, `src/app/cards/stats/`, `src/app/academy/cards/stats/`.
Files: `src/components/admin/AnnounceGauntletButton.tsx` (and its use on
`src/app/admin/announce/page.tsx`).

`vercel.json`: remove the `/api/showdown/sweep` cron entry (keep the
expeditions one).

## Task 3: unhook everything that pointed at them

- `src/lib/cards/sections.ts` (+ `sections.test.ts`): Play's children are
  Fantasy, Expeditions, The ledger, Weekly Draw. No child is `premierOnly`
  any more: remove the flag, the academy branch that hid the two games,
  and simplify `pairedCardsHref` (it no longer needs the play fallback;
  keep the function and fix its tests and the header comment). Update the
  file's header comment listing the tabs. `CardsTabs` tests if they name
  the sub-tabs.
- `src/lib/cards/playStatus.ts` (+ test): drop `gauntlet`, `showdown` and
  `stats` from the input, the `PlayGame` union and the statuses.
- `src/app/cards/play/page.tsx`: drop the two queries modules, the leaf
  cases, the status inputs, and the description copy.
- `src/lib/cards/mutations.ts`: drop `gauntletStat` and `gauntletEffects`
  (the type import from `@/lib/gauntlet/relics`) from `MutationEffect` and
  every entry; drop the Gauntlet clause from the header comment and from
  any player-facing copy that describes the effects (grep `gauntletStat`,
  `gauntletEffects` and "Gauntlet" in the mutations UI and
  `/cards/rarities`' mutation section). Tests accordingly.
- `src/lib/economy/ledger.ts`: remove the "The Gauntlet's purse", "A
  Gauntlet run" and "A Showdown seat" entries and the three imports. Ledger
  REASON labels for historical betting rows (if such a map exists elsewhere,
  e.g. `gauntlet_entry`, `showdown_rake`) stay so old ledger rows still
  print words rather than keys.
- `scripts/weekly-card-drop.ts` (+ test): remove `settleLastGauntletWeek`,
  the settle import, the "⚔ The Gauntlet — the week's board" announcement
  and the call site in the chain. Nothing else in the chain changes.
- `src/lib/site/glossary.ts`: remove the "Relic (in the Gauntlet)",
  ascension and purse entries and the two imports; edit the moments, team
  plate and betting-dollars meanings so they no longer mention the Gauntlet
  or Showdown. `src/lib/site/directory.test.ts`, `src/lib/league/links.test.ts`:
  drop the Gauntlet / Pack stats expectations.
- `src/app/admin/page.tsx`: remove the "Gauntlet balance" card; the
  announce card's description no longer cites "the Gauntlet overhaul".
- `src/lib/analytics/overview.ts` + `src/app/admin/analytics/page.tsx`:
  remove the Showdown field and section (the SQL RPC may still return the
  rows; the TS simply stops reading them). Section title becomes "Daily
  games, betting and the market". Tests.
- Copy: `src/app/betting/page.tsx` ("… buy card packs and market listings"),
  `src/app/membership/page.tsx` (both the perk line and the table row: the
  games are FPL'dle, Higher or Lower, Fantasy, Expeditions),
  `src/app/cards/page.tsx` (no Showdown table), `src/lib/expeditions/routes.ts`
  line ~1880 (wounded copy: say what the code still enforces — read what
  `wounded` actually blocks now; if only expeditions, say "benched from
  expeditions").
- `src/lib/cards/economy.ts` (+ test): delete `fetchEconomyStats`,
  `EconomyStats`, `PulledStats`, `pulledStats`, `DEFAULT_EXCLUDED_COLLECTORS`,
  `normalizeCollectorName`, `excludedCollectorNames` and the header about
  the stats page; keep `fetchAllRows` (trades use it) with a short header.
  Any comment elsewhere that says "the stats page counts …" (dribb.ts,
  onAir.ts, packs/config.ts, docs) loses that clause; migrations' comments
  are left alone.
- `src/components/admin/AdminFeaturedMatchupEditor.test.tsx`: the fixture
  title "Week 4 showdown" becomes "Week 4 clash" so the word does not
  survive in the tree by accident.
- Anything else the sweep below finds.

## Task 4: docs

- `README.md`: the Showdown sweep / cron secret lines (367), the `/stats`
  page line (510), the Gauntlet clauses in the wounded/lock/fielding
  paragraphs (806–822). The `CARD_STATS_EXCLUDED` env var if documented.
- `docs/backend.md`: delete the "### Showdown (Hold'em with the cards)"
  and "### Pack odds, measured" sections; remove the Gauntlet game from the
  Play tab list, the ledger, the wounded/expeditions paragraphs and any
  other clause; the "### The schedule and the gauntlet" section is the
  playoff format and stays. Remove Gauntlet/Showdown from the Discord
  commands section if they are there.
- `CONTEXT.md` only if it mentions them.
- Historical audits and dated plans under `docs/` are left as they are.

## The sweep (the definition of done)

All of these must come back empty, run from the repo root:

```
grep -rn -i "showdown" src scripts .github vercel.json README.md CONTEXT.md docs/backend.md
grep -rn -E "lib/gauntlet|cards/gauntlet|components/gauntlet|admin/gauntlet|gauntletStat|gauntletEffects|settleGauntletWeek" src scripts .github README.md docs/backend.md
grep -rn -E "cards/stats|academy/cards/stats|Pack stats|fetchEconomyStats|CARD_STATS_EXCLUDED|excludedCollectorNames" src scripts .github README.md docs/backend.md
```

And `grep -rn -i "gauntlet" src scripts README.md docs/backend.md` may
return only the playoff format: schedule code and copy, fixture stages,
the rulebook, `STAGE_META`, the Send-off stage. Read every remaining hit
and be sure.

Then `npm test`, `npx tsc --noEmit` (one known error left), `npm run lint`.
