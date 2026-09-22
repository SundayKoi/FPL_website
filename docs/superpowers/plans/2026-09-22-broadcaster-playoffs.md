# The broadcaster tab, the homepage and the featured-match pick list follow the bracket

**Goal:** The broadcaster tab (`/broadcaster`, Premier and Academy) shows
"No featured match is available" during the playoffs, and the admin's
featured-match dropdown is empty. Both read `fetchHomepageSchedule`
(`src/lib/home/schedule.ts`), whose "active stage" comes from
`selectActiveRegularSeasonStage`: the first regular-season week that is
empty or has an unplayed fixture. Once week 5 is played that is null, the
fixture list is empty, and everything downstream goes blank: the broadcaster
tab, the homepage's featured match and upcoming-schedule widget, and the
admin dropdown. Make the active stage follow the bracket, list the whole
bracket ahead where staff pick a match, and let casters switch between the
night's games on the broadcaster tab itself.

**Tech and checks:** Next.js 16 (`searchParams` are Promises; read
`node_modules/next/dist/docs/` before touching a page), Vitest. Read
`AGENTS.md`. `npx vitest run <path>` while working, then `npm test`,
`npx tsc --noEmit` (one known `LayoutProps` error), `npm run lint`. **Do not
commit.** No database change.

**Read first:** `src/lib/schedule/format.ts` (REGULAR_SEASON_STAGES,
`selectActiveRegularSeasonStage`, `hasResult`, `STAGE_META`/`stageMeta`,
`STAGE_ORDER`, and the second caller of the active stage around line 178),
`src/lib/schedule/types.ts` (FIXTURE_STAGES, in bracket order),
`src/lib/home/schedule.ts` + test, `src/lib/broadcaster/workspace.ts` + test,
`src/app/broadcaster/page.tsx` + test, `src/components/broadcaster/BroadcasterFixtureHeader.tsx`,
`src/components/home/UpcomingSchedule.tsx` + test, `src/app/admin/page.tsx`
(`featuredFixtureChoices`) + `src/components/admin/AdminFeaturedMatchupEditor.tsx`,
`src/lib/academy/filtering.ts` (`filterAcademyFixtures`, `ACADEMY_EXCLUDED_STAGES`:
the Academy has no gauntlet).

## Task 1: `selectActiveStage` — `src/lib/schedule/format.ts`

```ts
/** The stage the league is at. The regular-season rule first (the first
 *  week that is empty or has an unplayed fixture); once every week is
 *  played, the first playoff stage in bracket order that has a fixture
 *  without a result. A placeholder with a TBD side counts as unplayed (the
 *  stage is still to be played); an EMPTY playoff stage is skipped (the
 *  Academy has no gauntlet). Null once every fixture of the season has a
 *  result. */
export function selectActiveStage(rows: FixtureRow[]): FixtureStage | null
```

Keep `selectActiveRegularSeasonStage` exported and use it for the first
half. Switch both existing callers to `selectActiveStage`: `fetchHomepageSchedule`
and the "next fixture window" helper around line 178 (its dated-fixture
branch already handles playoff rows; only its fallback changes).

Tests in `format.test.ts`, a new `describe("selectActiveStage")`: mid-season
answers exactly as `selectActiveRegularSeasonStage`; all five weeks played
+ gauntlet r1 (unplayed) and r2 placeholders (team_b null) → `gauntlet_r1`;
r1 played → `gauntlet_r2`; r1 and r2 played, quarterfinals unplayed →
`quarterfinals`; Academy shape (no gauntlet rows, quarterfinals unplayed) →
`quarterfinals`; semifinals with only TBD rows and quarterfinals all played
→ `semifinals`; every fixture played → null; an empty season → `week_1`.

## Task 2: the schedule data — `src/lib/home/schedule.ts`

`HomepageScheduleData` gains `upcoming: FixtureRow[]`: every fixture of the
season whose stage is the active stage or later, in bracket order then
`sort_order` (the same comparator the schedule page uses), played or not.
`fixtures` (the active stage only) keeps its meaning. `upcoming` is `[]`
when `activeStage` is null. Test: a playoff-week schedule returns the
active stage's fixtures in `fixtures` and the rest of the bracket in
`upcoming`; a mid-season one returns weeks from the active week on.

## Task 3: the admin's featured-match dropdown — `src/app/admin/page.tsx`

`featuredFixtureChoices` takes `schedule.upcoming` (both leagues) and labels
each `${stageMeta(fixture.stage).label}${fixture.division ? ` · ${fixture.division}` : ""} · ${team_a ?? "TBD"} vs ${team_b ?? "TBD"}`,
so a Week 3 row reads "Week 3 · Solari · A vs B" and a bracket row
"Gauntlet — Round 2 · A vs TBD". The "Automatic schedule selection" option
and the editor itself do not change. Update the admin page test if it
asserts labels.

## Task 4: the broadcaster tab picks a game — `src/lib/broadcaster/workspace.ts`, `src/app/broadcaster/page.tsx`

- `resolveBroadcasterFixture(supabase, league, requestedFixtureId?: string | null)`:
  when a requested id matches a fixture in `schedule.upcoming`, that
  fixture is the context's `fixture`; otherwise the featured selection as
  today. The context gains `upcoming: FixtureRow[]` (from the schedule).
- The page reads `fixture` from `searchParams` (a Promise) and passes it
  through. Between the league links and the fixture header, when
  `context.upcoming.length > 1`, render `<nav aria-label="Tonight's games">`
  of pills, one per upcoming fixture, grouped by stage with the stage label
  as a small heading (`stageMeta(stage).label`), each pill
  `{team_a ?? "TBD"} vs {team_b ?? "TBD"}`, an `aria-current="page"` on the
  selected one, linking to `/broadcaster?league={league}&fixture={id}`; the
  first pill row (or a leading pill) "Featured" links back without a
  `fixture` param. A fixture with a TBD side still lists (casters see the
  bracket) but its pill is `aria-disabled` and not a link, since there is
  nothing to scout. Reuse the league-links pill styling.
- The empty state ("No … featured match is available") stays for a season
  with nothing upcoming.

Tests: `workspace.test.ts` — a requested id in `upcoming` wins, an unknown
id falls back to the featured selection, `upcoming` is passed through.
`page.test.tsx` — the pills render one per upcoming fixture with the
selected one current, the TBD one disabled, and none when there is a
single fixture.

## Task 5: the homepage widget — `src/components/home/UpcomingSchedule.tsx`

It already renders `schedule.fixtures` under `stageMeta(activeStage).label`.
Make sure a bracket row with a null side prints "TBD" rather than an empty
cell, and change the null-stage heading from "Regular season complete" to
"Season complete". Test both.

## Task 6: docs

`docs/backend.md`: wherever the homepage schedule or the featured fixture
is described as "the active week", say the active stage follows the
bracket after week 5, that the admin dropdown lists the bracket ahead, and
that the broadcaster tab takes `?fixture=`. One or two sentences.
