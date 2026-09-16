# The Send-off: playoff card editions printed by elimination

**Goal:** Give the playoff weeks a card edition that makes sense. Each player's
playoff card prints once, in the week their team's split ends, rated on the
whole split and stamped with how far they got. The Champion's five print last,
in a frame nothing else can wear. Send-off editions close a set number of days
after the finals. An admin page previews the five stamps on real cards and
dry-runs what Tuesday's drop will print.

**Why:** A weekly edition rates each player against the players who played
that week (`fetchWeekCards` → `buildSeasonCards`, percentile bars against the
same-role cohort, whole-cohort fallback under four). The bracket thins that
cohort to 40, then 20, then 10 players, so semifinal and final prints rank
people among a handful and the losing finalists print as bad cards. The
season-to-date build (`fetchSeasonCards`) already rates everyone against the
whole league, so a send-off print uses it unchanged.

**Architecture:** One pure module (`src/lib/cards/sendoff.ts`) owns the rules:
which fixture results end a split, which stamp the loser wears, how a week's
send-off roster is planned from fixtures plus the season cards, and when the
vault closes. One builder (`src/lib/cards/editionBuilder.ts`) decides per week
whether the edition is a weekly print or a send-off, so the Tuesday drop and
the manual archiver agree. The stamp lives on the card json (`card.sendoff`),
frozen on the edition row and on every pulled copy, like `live`, `chase` and
`champWin`. No migration: `card_editions.card` and `card_inventory.card` are
jsonb and already carry every other stamp. The renderer draws the stamp off the
json. Everything that consumes editions (packs, print runs, Eclipse, sets,
team cards, Higher or Lower, moments) keeps reading `PlayerCardData` from the
archive and needs no change.

**Tech:** TypeScript, Next.js 16 App Router (read
`node_modules/next/dist/docs/` before touching a page — `searchParams` is a
Promise), Supabase, Vitest (node project for `src/lib/**` and `scripts/**`,
jsdom for components and pages), Tailwind v4 utilities in
`src/app/globals.css`.

**Checks:** `npx vitest run <path>` per file; `npm test`, `npx tsc --noEmit`,
`npm run lint` before handing back. Do not commit — the integrator commits.

---

## Fixed contracts (already in the tree)

`src/lib/cards/build.ts` — `PlayerCardData.sendoff?: SendoffMark | null`.

`src/lib/cards/sendoff.ts` (scaffold; Task 1 extends it, Task 5 and 6 only
read it):

```ts
export const SENDOFF_STAGES = ["gauntlet", "quarterfinalist", "semifinalist", "finalist", "champion"] as const;
export type SendoffStage;
export const SENDOFF_EXIT_STAGES = ["gauntlet_r1", "gauntlet_r2", "quarterfinals", "semifinals", "finals"] as const;
export type SendoffExitStage;
export interface SendoffMark { stage; exit; team; series: string | null; week: string }
export interface SendoffStageMeta { stage; label; stamp; line; accent; glyph; order }
export const SENDOFF_META: Record<SendoffStage, SendoffStageMeta>;
export const LOSER_STAGE_BY_EXIT: Record<SendoffExitStage, SendoffStage>;
export function withSendoff(card, mark): PlayerCardData;      // clears standout, sets sendoff
export function crownSendoff(cards): PlayerCardData[];         // top OVR per role → standout, best first
export function sendoffEditionLabel(stage): string;            // "Send-off · Champion" (one card)
export const EXIT_LABELS: Record<SendoffExitStage, string>;    // "Gauntlet" | "Quarterfinals" | ...
export function sendoffWeekLabel(exits): string | null;        // "Send-off · Finals" (one edition)
```

Fixture rows come from `public.fixtures` (`src/lib/schedule/types.ts`
`FixtureRow`): `stage`, `team_a`, `team_b`, `score_a`, `score_b`,
`scheduled_at`, `season`. Team names in fixtures are `league_teams.name`, and
`PlayerCardData.teamName` is `raw_stats.team_name`, which the ingest writes
from the same table. Match them with `normalizeTeamName` from
`src/lib/league/context.ts`. Weeks are `mondayOf(new Date(scheduled_at))` from
`src/lib/packs/week.ts`. The season code is the card season (`S5`, `A5`);
`fixtures.season` carries the same code for both leagues, and the Academy has
no gauntlet stages.

---

## Task 1: The planner (pure) — `src/lib/cards/sendoff.ts` + `sendoff.test.ts`

Add to the scaffold. Everything pure; no supabase, no clock unless passed in.

```ts
/** What the planner reads off a fixture. FixtureRow satisfies it. */
export interface SendoffFixture {
  stage: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
}

export interface Elimination {
  team: string;               // as the fixture names it
  stage: SendoffStage;
  exit: SendoffExitStage;
  series: string | null;      // "1–3" from this team's side (en dash)
  opponent: string | null;
  week: string;               // mondayOf(scheduled_at)
}

/** Every split that ended in `week`: the loser of each decided playoff
 *  fixture scheduled in that Eastern week, plus the winner of the finals as
 *  `champion`. Undecided (null or tied scores) fixtures eliminate nobody.
 *  One entry per team — a team that appears twice keeps its LATER exit.
 *  Sorted by SENDOFF_META order then team name. */
export function eliminationsInWeek(fixtures: SendoffFixture[], week: string): Elimination[];

/** Does `week` hold any fixture whose stage is a SENDOFF_EXIT_STAGE,
 *  decided or not? This is what makes a week a send-off week rather than a
 *  weekly print — an undecided playoff week prints nothing, not a
 *  ten-player weekly edition. */
export function isPlayoffWeek(fixtures: SendoffFixture[], week: string): boolean;

export interface SendoffPlan {
  week: string;
  eliminations: Elimination[];
  /** The edition: every season card whose teamName matches an eliminated
   *  team, stamped (withSendoff) and crowned (crownSendoff). */
  cards: PlayerCardData[];
  /** Eliminated teams no card matched — a name mismatch to surface. */
  unmatched: string[];
  /** The exits present, for sendoffWeekLabel. */
  exits: SendoffExitStage[];
}

export function planSendoff(seasonCards: PlayerCardData[], fixtures: SendoffFixture[], week: string): SendoffPlan;

/** Days the send-off editions stay on sale after the finals. */
export const SENDOFF_VAULT_DAYS = 14;

/** When every send-off edition of the season closes: the finals fixture's
 *  scheduled_at plus SENDOFF_VAULT_DAYS, as ISO; null while no finals
 *  fixture has a date. Two finals fixtures (a data error) → the latest. */
export function sendoffVaultClosesAt(fixtures: SendoffFixture[]): string | null;

export function isSendoffVaulted(fixtures: SendoffFixture[], now: Date): boolean;

export interface TeamSendoffStatus {
  team: string;
  status: "printed" | "alive" | "unscheduled";
  stage: SendoffStage | null;
  week: string | null;
  cards: number;            // how many season cards carry this team
}

/** The bracket ledger for the admin page: every team named by a season card
 *  or a playoff fixture, with whether (and when, and as what) it has
 *  printed, running eliminationsInWeek over every playoff week up to and
 *  including `throughWeek`. "alive" = in a playoff fixture and not
 *  eliminated yet; "unscheduled" = in no playoff fixture at all. */
export function sendoffLedger(seasonCards: PlayerCardData[], fixtures: SendoffFixture[], throughWeek: string): TeamSendoffStatus[];
```

Tests to pin (build fixtures in the test; a small `fx(stage, a, b, sa, sb, at)`
helper): gauntlet week with both rounds eliminates four teams all stamped
`gauntlet`; a team that loses r2 after winning r1 is stamped once; finals
produce `finalist` and `champion`; a tied or unscored fixture eliminates
nobody; `isPlayoffWeek` true for an unscored quarterfinal and false for
`week_5`; `planSendoff` stamps only matching cards, clears the season crown,
crowns one per role among the printed cards, matches team names
case-insensitively and reports `unmatched`; `sendoffVaultClosesAt` adds 14
days and returns null without a dated finals; `sendoffLedger` marks printed /
alive / unscheduled correctly; the Eastern week boundary (a Sunday 9 PM ET
fixture belongs to the week that Sunday is in).

## Task 2: Reads and the edition builder

`src/lib/cards/queries.ts`:

- `fetchSeasonFixtures(supabase, season): Promise<SendoffFixture[]>` —
  `from("fixtures").select("stage, team_a, team_b, score_a, score_b, scheduled_at").eq("season", season)`;
  returns `[]` on error (fixtures are garnish for every reader here except
  the builder, which checks separately).
- `fetchCurrentWeekCards`: after `fetchLatestGameWeek`, read the season's
  fixtures; if `isPlayoffWeek(fixtures, week)` return `fetchSeasonCards`.
  During the bracket the hub, browse, compare, teams page and homepage show
  the whole collection rather than the ten people who played. Comment why.
  Add a test in `queries.test.ts` following its existing mocking style.

`src/lib/cards/editionBuilder.ts` (new, framework-free, script-safe):

```ts
export type EditionKind = "weekly" | "sendoff";
export interface WeekEdition {
  kind: EditionKind;
  cards: PlayerCardData[];
  /** Set on a send-off: what the drop posts and the label the shop shows. */
  plan: SendoffPlan | null;
}
/** The edition for `week`: a send-off when the week holds a playoff
 *  fixture, else the weekly print. `seasonCards` is passed in because the
 *  drop already has them; the archiver passes what it fetched. */
export async function buildEditionForWeek(
  supabase, season, week,
  seasonCards: () => Promise<PlayerCardData[]>,
): Promise<WeekEdition>;
```

A send-off week with no decided fixture returns `{ kind: "sendoff", cards: [],
plan }` — `archiveEdition` already treats empty cards as "leave the week
alone", so nothing prints until scores land and a later run (or the manual
archiver) fills the week in.

## Task 3: The drop and the archiver

`scripts/weekly-card-drop.ts` `processSeason`: replace the
`fetchWeekCards(supabase, season, editionWeek)` archive read with
`buildEditionForWeek(supabase, season, editionWeek, async () => cards)`. Keep
every comment about the two rating bases; add that a send-off is the one
archive that IS season-rated, and why. On a successful send-off archive post
one embed before the Eclipse board:

```
title:  🎓 {label} — The Send-off · {EXIT_LABELS of the plan} 
body:   **{team}** — {SENDOFF_META[stage].label} · fell {series} to {opponent}   (one line per elimination)
        {n} cards printed, one per player, rated on the whole split.
        Vault shuts {Mon DD} — then what was pulled is all there will ever be.   (only when closesAt is known)
footer: origin + hub path, like the other embeds
```

Log the plan's `unmatched` teams with `[WARN]` so a name mismatch is visible in
the Actions log. The Eclipse board still posts (crowns come from
`crownSendoff`). Extend `scripts/weekly-card-drop.test.ts`: mock
`buildEditionForWeek` (the test already mocks the queries module; mock
`../src/lib/cards/editionBuilder` the same way) and assert a send-off week
archives the plan's cards and posts the embed; a weekly week is unchanged.

`scripts/archive-card-edition.ts`: use `buildEditionForWeek` with
`() => fetchSeasonCards(supabase, season)` so a manual rebuild of a playoff
week produces the same send-off the drop would. Update its header comment.

## Task 4: The shop, the opener, the copy line

`src/lib/cards/copyEdition.ts`: `copyEditionLabel(editionWeek, card)` returns
`sendoffEditionLabel(card.sendoff.stage)` when the card carries a send-off,
ahead of the relic check's fallback to the week label. Extend
`copyEdition.test.ts`.

`src/lib/packs/open.ts`, right after the `weeks.includes(requestedWeek)`
guard: read `fetchSeasonFixtures`; if the resolved `editionWeek` is a playoff
week (`isPlayoffWeek`) and `isSendoffVaulted(fixtures, new Date())`, return
`{ ok: false, error: "That send-off edition is vaulted — what was pulled is all there will ever be." }`
before anything is charged. When no week is requested and the newest week is
vaulted, fall back to the newest NON-vaulted week rather than refusing. Pin
both in `open.test.ts` (it has a fixtures-free mock client; extend the
`from("fixtures")` branch).

`src/app/cards/packs/page.tsx` + `src/components/cards/PackShop.tsx`: the
shop needs to know which weeks are send-offs, what to call them and when they
close. Add to `queries.ts`:

```ts
export interface EditionWeekInfo { week: string; label: string; sendoff: { closesAt: string | null } | null }
/** Every archived week newest first, labelled: "Week N · Sep 8" counting
 *  only weekly prints, or sendoffWeekLabel for a send-off week. Vaulted
 *  send-off weeks are left out — they are not on sale. */
export async function fetchEditionWeekInfo(supabase, season, now = new Date()): Promise<EditionWeekInfo[]>;
```

Implement it from `fetchCardEditionWeeks` + `fetchSeasonFixtures`, without a
per-week card read: a week is a send-off week iff `isPlayoffWeek`, and its
exits are the exit stages of that week's fixtures. Pass `editionWeekInfo` to
`PackShop` as a new optional prop alongside `editionWeeks` (keep the old prop
working for `PackShop.test.tsx` and the Discord flows): when present, the
picker renders `info.label`, and a send-off option gets a second line
"Vault shuts Sep 30" when `closesAt` is set. Move the existing
`editionLabel(week, number)` numbering to count weekly prints only. Extend
`PackShop.test.tsx`.

`src/lib/packs/week.ts` `editionLabel` stays as it is (Discord and copy lines
go through `copyEditionLabel`, which now knows about send-offs).

## Task 5: The card — `src/components/cards/PlayerCard3D.tsx` + `globals.css`

Read the file's stamp machinery first (`CardStamp`, the `stamps` array at
~L291, the coin strip at ~L750 and the back ledger at ~L1095, the standout pill
at ~L738, the frame/glow selection at ~L323).

- Add a send-off coin to `stamps` (key `sendoff`, testId `sendoff-stamp`,
  glyph `SENDOFF_META[stage].glyph`, accent from meta, title
  `"The Send-off — {line}. {team} fell {series} to … in the {EXIT_LABELS[exit]}."`,
  label `Send-off`, detail `meta.label`). The back ledger renders it like the
  others.
- Under the tier banner, where the standout pill sits, add a send-off ribbon:
  a centered pill reading `meta.stamp` with `meta.line` in small type under
  it, in `meta.accent`. When the card is also standout, the ribbon sits above
  the "★ Role of the Week ★" pill.
- Champion frame: `card.sendoff?.stage === "champion"` selects a new
  `card-frame-champion` and `card-glow-champion` (define both in
  `globals.css` beside `card-frame-standout` / `card-frame-eclipse`; add them
  to the reduced-motion, `[data-motion="rest"]` and `.pack-flip-turning` lists
  the same way). Eclipse still wins over it, and it wins over standout. Make
  it read as a different object from the Eclipse's gold-over-obsidian and
  the standout's molten gold: e.g. white-gold leaf over deep crimson with
  a slow drift. Finalist gets no frame, only the ribbon.
- Tests in `PlayerCard3D.test.tsx`: the coin renders with its title; the
  ribbon text; the champion frame class present for a champion and absent
  for a finalist; Eclipse beats the champion frame.

## Task 6: The admin page — `src/app/admin/sendoff/page.tsx` + test + nav

Template: `src/app/admin/overlays/page.tsx` (auth via `fetchStaffTier`,
redirect to `/admin`; service client; `PlayerCard3D` interactive). Add an
entry to the admin index in `src/app/admin/page.tsx` next to "Card overlays":
label "The Send-off", stat "Playoff editions", description "Playoff cards
printed by elimination — the five stamps on real cards, and a dry run of what
Tuesday's drop prints. Mints nothing.", href `/admin/sendoff`.

Data: `fetchAllCardSeasons`; `?league=academy` (searchParams is a Promise)
switches the season, with a Premier/Academy toggle at the top; season cards via
`fetchSeasonCards`; fixtures via `fetchSeasonFixtures`; `week = mondayOf(new Date())`.

Sections, in order:

1. **The five exits.** Five `PlayerCard3D`s, one per `SENDOFF_STAGES` entry, on
   the five best season cards (`withSendoff(card, { stage, exit, team: card.teamName ?? "—", series: "1–3", week })`
   with a sensible exit per stage), caption with the stage's `label` and
   `line`. The champion one shows the frame. Mark the section "Mockups".
2. **This week's send-off, dry run.** `planSendoff(cards, fixtures, week)`:
   each elimination as a row (team, stage label, series, opponent), the
   printed cards as a grid of `PlayerCard3D`s (non-interactive is fine),
   `unmatched` teams in a warning colour, and the vault line (`closesAt` or
   "vault date unknown until the finals are scheduled"). When the week holds
   no playoff fixture say so ("Not a playoff week — Tuesday prints a weekly
   edition."); when it holds undecided ones say nothing prints until scores
   land.
3. **Bracket ledger.** `sendoffLedger(cards, fixtures, week)` as a table:
   team, status, stage, week, cards. Sort printed first by stage order.
4. **Shop preview.** How the picker will read: `fetchEditionWeekInfo` rows as
   plain text lines.

Page copy must say it mints and writes nothing. Test (`page.test.tsx`, model
on `src/app/admin/parallels/page.test.tsx`): staff gate; five stamp cards
render with their captions; a decided quarterfinal in the current week shows
its eliminations and printed cards; an undecided one shows the "nothing
prints yet" line.

## Task 7: Docs

`docs/backend.md`: a "### The Send-off" section under the card sections
(after "Print runs and provenance" is fine) covering the rule, the stamp on the
json, the builder, the vault, the admin page, and the pitfall that a playoff
week with unscored fixtures prints nothing until scores land (then re-run the
archiver for that week). Add the new script behaviour to the "Card edition
archive" row of the scheduled-workflows table. `README.md` gets one line under
the cards feature list.

---

## Ownership for parallel work

- **Agent A (core):** Tasks 1, 2, 3, 4, 7. Owns `src/lib/cards/sendoff.ts`,
  `editionBuilder.ts`, `queries.ts`, `copyEdition.ts`, `src/lib/packs/open.ts`,
  `scripts/*`, `src/app/cards/packs/page.tsx`, `src/components/cards/PackShop.tsx`,
  docs.
- **Agent B (surface):** Tasks 5, 6. Owns `PlayerCard3D.tsx`, `globals.css`,
  `src/app/admin/**`. Reads `sendoff.ts` (the scaffold API above) and must not
  edit it; if it needs something more, add it in the page or component and
  note it for the integrator.

Neither agent commits. Both run their own tests, then `npx tsc --noEmit` and
`npm run lint` on the whole tree before reporting.
