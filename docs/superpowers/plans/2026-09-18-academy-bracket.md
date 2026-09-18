# Academy playoffs: seed the bracket from a file

**Goal:** The Academy has no gauntlet: six teams, two byes, quarterfinals on
Monday 21 September, semifinals on Monday 28 September, grand finals on
Monday 5 October, all Bo5.

The bracket has to get onto the schedule. The league owner cannot run SQL
and this environment has no database access, so the way to "slot the
matchups in" is a bracket file committed to the repo plus a manual GitHub
Actions workflow that seeds it with the service key, the same way
`archive-card-edition.yml` runs its script. Reusable for the Premier
bracket later.

The Send-off needs nothing new for the Academy: the planner already
handles byes (a team with no quarterfinal fixture is simply not eliminated
that week), Academy fixtures carry the Academy season code so
`processSeason` for the Academy season reads them, and every round is on a
Monday, so each lands in its own Eastern card week and the following
Tuesday's drop prints that round's losers.

**Facts to rely on:** `mondayOf` (src/lib/packs/week.ts) puts each Monday
8pm Eastern kickoff in the week of that Monday. Academy fixtures use the Academy season code
(`league_settings.academy_season`; the Premier schedule page filters them
out with `fixture.season !== leagueSeasons.academy`). `fixtures.team_a`/
`team_b` are `league_teams.name` spellings, which is also what
`raw_stats.team_name` and therefore `PlayerCardData.teamName` carry.
`archiveEdition` (src/lib/cards/editions.ts) upserts a week's rows and
prunes rows no longer in the set, and returns early on an empty set.
`eliminationsInWeek` skips a fixture with a missing team, so a TBD row is
safe. **Tech and checks:** as in the other plans in this folder; Vitest
node project for `scripts/**` and `src/lib/**`; do not commit.

## Task 1: the bracket file and the seeding script

`scripts/data/brackets/academy-2026-playoffs.json` — the bracket from the
league's sheet, exactly these rows (kickoffs are 8pm Eastern, EDT, so
`-04:00`):

```json
{
  "league": "academy",
  "note": "Academy split 1 playoffs, from the league's bracket sheet. Divine Ascension and Flannel Esports Love Tap have quarterfinal byes.",
  "fixtures": [
    { "stage": "quarterfinals", "sort_order": 0, "team_a": "Flannel Esports Requiem", "team_b": "Astronauts", "best_of": 5, "scheduled_at": "2026-09-21T20:00:00-04:00" },
    { "stage": "quarterfinals", "sort_order": 1, "team_a": "The Strokers", "team_b": "Free People Legion", "best_of": 5, "scheduled_at": "2026-09-21T20:00:00-04:00" },
    { "stage": "semifinals", "sort_order": 0, "team_a": "Divine Ascension", "team_b": null, "best_of": 5, "scheduled_at": "2026-09-28T20:00:00-04:00" },
    { "stage": "semifinals", "sort_order": 1, "team_a": "Flannel Esports Love Tap", "team_b": null, "best_of": 5, "scheduled_at": "2026-09-28T20:00:00-04:00" },
    { "stage": "finals", "sort_order": 0, "team_a": null, "team_b": null, "best_of": 5, "scheduled_at": "2026-10-05T20:00:00-04:00" }
  ]
}
```

`scripts/seed-bracket.ts` (header comment in the voice of
`archive-card-edition.ts`):

- Args: the bracket path (default the Academy file), `--dry-run`. Env:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Resolves `season` from `league_settings` by `league` (`academy_season` or
  `current_season`); a file may also give `"season"` explicitly, which wins.
- **Team names are validated before anything is written.** Every non-null
  team must match a `league_teams.name` (compare with `normalizeTeamName`
  from src/lib/league/context.ts; write the row with the `league_teams`
  spelling). A name that matches nothing fails the run listing every
  mismatch, because a misspelt fixture prints nobody's send-off. Print the
  matched spelling beside each fixture in the plan.
- **Idempotent, keyed by `(season, stage, sort_order)`.** Existing row
  without scores → update `team_a`, `team_b`, `best_of`, `scheduled_at`,
  `division` (null). Existing row WITH scores → leave every column alone
  and say so. Missing → insert. Never deletes. The decision logic is a
  pure function in `src/lib/schedule/bracketSeed.ts` —
  `planBracketSeed(existing, bracketFixtures, season)` returning
  `{ inserts, updates, skips, errors }` — with tests: insert when missing,
  update when unscored, skip when scored, unknown name → error, TBD null
  team allowed, sort_order match.
- `--dry-run` prints the plan and exits 0 without writing. A real run
  prints what it wrote.

`.github/workflows/seed-bracket.yml`: `workflow_dispatch` with inputs
`bracket` (string, default `scripts/data/brackets/academy-2026-playoffs.json`)
and `dry_run` (boolean, **default true**), `environment: Production`, Node
22, `npm ci`, `npx tsx scripts/seed-bracket.ts "$BRACKET" $([ "$DRY_RUN" = true ] && echo --dry-run)`
with the two secrets, mirroring `archive-card-edition.yml`.

## Task 2: docs

`docs/backend.md`: the seed-bracket workflow (a row in the scheduled and
trusted workflows table, manual), and a line in "The Send-off" that the
Academy's byes need no special handling. `README.md`: a line under the schedule ops section for
seeding a bracket from a file, and the safety of the dry run default.
