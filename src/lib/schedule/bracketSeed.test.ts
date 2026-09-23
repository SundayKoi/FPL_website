import { describe, expect, it } from "vitest";
import {
  parseBracketFile,
  planBracketSeed,
  type BracketFixture,
  type ExistingFixture,
} from "./bracketSeed";

const TEAMS = [
  "Flannel Esports Requiem",
  "Astronauts",
  "The Strokers",
  "Free People Legion",
  "Divine Ascension",
  "Flannel Esports Love Tap",
];

const SEASON = "A1";

const bracket = (over: Partial<BracketFixture> = {}): BracketFixture => ({
  stage: "quarterfinals",
  sort_order: 0,
  team_a: "Flannel Esports Requiem",
  team_b: "Astronauts",
  best_of: 5,
  scheduled_at: "2026-09-21T20:00:00-04:00",
  ...over,
});

const existing = (over: Partial<ExistingFixture> = {}): ExistingFixture => ({
  id: "fix-1",
  season: SEASON,
  stage: "quarterfinals",
  sort_order: 0,
  team_a: null,
  team_b: null,
  score_a: null,
  score_b: null,
  ...over,
});

const plan = (rows: ExistingFixture[], fixtures: BracketFixture[]) =>
  planBracketSeed(rows, fixtures, SEASON, TEAMS, TEAMS);

describe("planBracketSeed", () => {
  it("inserts a fixture the season does not have yet", () => {
    const result = plan([], [bracket()]);

    expect(result.errors).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.skips).toEqual([]);
    expect(result.inserts).toEqual([
      {
        season: SEASON,
        stage: "quarterfinals",
        division: null,
        team_a: "Flannel Esports Requiem",
        team_b: "Astronauts",
        best_of: 5,
        scheduled_at: "2026-09-21T20:00:00-04:00",
        sort_order: 0,
      },
    ]);
  });

  it("updates an existing unscored row in place, keeping its id", () => {
    const result = plan([existing({ id: "old", team_a: "Astronauts", team_b: null })], [bracket()]);

    expect(result.inserts).toEqual([]);
    expect(result.skips).toEqual([]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].id).toBe("old");
    expect(result.updates[0].row).toMatchObject({
      team_a: "Flannel Esports Requiem",
      team_b: "Astronauts",
      best_of: 5,
      division: null,
      scheduled_at: "2026-09-21T20:00:00-04:00",
    });
  });

  it("leaves a scored row alone and reports what is already on it", () => {
    const played = existing({
      id: "played",
      team_a: "Astronauts",
      team_b: "Flannel Esports Requiem",
      score_a: 3,
      score_b: 1,
    });

    const result = plan([played], [bracket()]);

    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.skips).toEqual([
      { id: "played", stage: "quarterfinals", sort_order: 0, played: "Astronauts 3–1 Flannel Esports Requiem" },
    ]);
  });

  it("treats a half-reported score as played rather than rewriting it", () => {
    const result = plan([existing({ score_a: 3 })], [bracket()]);

    expect(result.updates).toEqual([]);
    expect(result.skips).toHaveLength(1);
  });

  it("fails the run on a team name no league_teams row spells, listing every one", () => {
    const result = plan([], [bracket({ team_a: "Astronaut", team_b: "The Strokerz" })]);

    expect(result.inserts).toEqual([]);
    expect(result.errors).toEqual([
      `quarterfinals #0: no league_teams row is called "Astronaut" (team_a).`,
      `quarterfinals #0: no league_teams row is called "The Strokerz" (team_b).`,
    ]);
  });

  it("writes the league_teams spelling, not the file's", () => {
    const result = plan([], [bracket({ team_a: "  flannel esports REQUIEM ", team_b: "astronauts" })]);

    expect(result.errors).toEqual([]);
    expect(result.inserts[0]).toMatchObject({ team_a: "Flannel Esports Requiem", team_b: "Astronauts" });
  });

  it("allows a TBD side: a bye's missing opponent and an undecided final", () => {
    const result = plan([], [
      bracket({ stage: "semifinals", team_a: "Divine Ascension", team_b: null }),
      bracket({ stage: "finals", team_a: null, team_b: null }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.inserts.map((row) => [row.stage, row.team_a, row.team_b])).toEqual([
      ["semifinals", "Divine Ascension", null],
      ["finals", null, null],
    ]);
  });

  it("matches on sort_order, so a second fixture in the same stage is its own row", () => {
    const rows = [existing({ id: "qf0", sort_order: 0 }), existing({ id: "qf1", sort_order: 1, score_a: 3, score_b: 0 })];

    const result = plan(rows, [
      bracket({ sort_order: 0 }),
      bracket({ sort_order: 1, team_a: "The Strokers", team_b: "Free People Legion" }),
      bracket({ sort_order: 2, team_a: "Divine Ascension", team_b: "Flannel Esports Love Tap" }),
    ]);

    expect(result.updates.map((update) => update.id)).toEqual(["qf0"]);
    expect(result.skips.map((skip) => skip.id)).toEqual(["qf1"]);
    expect(result.inserts.map((row) => row.sort_order)).toEqual([2]);
  });

  it("never plans a delete: fixtures the bracket does not mention are untouched", () => {
    const week = existing({ id: "week-1", stage: "week_1", sort_order: 0 });

    const result = plan([week], [bracket()]);

    expect(result.inserts).toHaveLength(1);
    expect(result.updates).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("week-1");
  });

  it("rejects a file that claims one slot twice", () => {
    const result = plan([], [bracket(), bracket({ team_a: "The Strokers", team_b: "Free People Legion" })]);

    expect(result.errors).toEqual([
      "quarterfinals #0: the bracket lists this slot twice — (season, stage, sort_order) has to be unique.",
    ]);
    expect(result.inserts).toHaveLength(1);
  });
});

describe("parseBracketFile", () => {
  const file = {
    league: "academy",
    fixtures: [{ stage: "finals", sort_order: 0, team_a: null, team_b: null, best_of: 5, scheduled_at: "2026-10-05T20:00:00-04:00" }],
  };

  it("accepts the Academy bracket shape and defaults the optional fields", () => {
    expect(parseBracketFile(file)).toEqual({
      league: "academy",
      season: null,
      note: null,
      publishingApproved: false,
      entrants: [],
      pairingPolicy: { pairing_22: null, pairing_40: null },
      fixtures: [
        { stage: "finals", sort_order: 0, team_a: null, team_b: null, best_of: 5, scheduled_at: "2026-10-05T20:00:00-04:00" },
      ],
    });
  });

  it("keeps an explicit season", () => {
    expect(parseBracketFile({ ...file, season: "A1" }).season).toBe("A1");
  });

  it("names the row and the field it rejected", () => {
    expect(() => parseBracketFile({ ...file, fixtures: [{ ...file.fixtures[0], stage: "quarterfinal" }] })).toThrow(
      /fixtures\[0\]\.stage/,
    );
    expect(() => parseBracketFile({ ...file, fixtures: [{ ...file.fixtures[0], best_of: 7 }] })).toThrow(
      /fixtures\[0\]\.best_of/,
    );
    expect(() => parseBracketFile({ ...file, fixtures: [{ ...file.fixtures[0], scheduled_at: "monday night" }] })).toThrow(
      /scheduled_at is not a date/,
    );
    expect(() => parseBracketFile({ ...file, league: "juniors" })).toThrow(/"league"/);
    expect(() => parseBracketFile({ ...file, fixtures: [] })).toThrow(/"fixtures"/);
  });
});

const premierEntrants = [
  ...["One", "Two", "Three", "Four"].map((suffix, index) => ({ name: `Solari ${suffix}`, division: "Solari" as const, seed: index + 1 })),
  ...["One", "Two", "Three", "Four"].map((suffix, index) => ({ name: `Lunari ${suffix}`, division: "Lunari" as const, seed: index + 1 })),
];

const premierFixture = (overrides: Partial<BracketFixture> = {}): BracketFixture => ({
  stage: "quarterfinals",
  sort_order: 0,
  team_a: "Solari One",
  team_b: "Lunari Four",
  best_of: 5,
  scheduled_at: "2026-09-28T20:00:00-04:00",
  ...overrides,
});

describe("Premier bracket validation and protection", () => {
  it("rejects duplicate stage slots before a seed can run", () => {
    expect(() => parseBracketFile({
      league: "premier",
      entrants: premierEntrants,
      fixtures: [premierFixture(), premierFixture()],
    })).toThrow(/lists quarterfinals#0 more than once/i);
  });

  it("resolves names against the selected draft and season and allows later-round placeholders", () => {
    const fixtures = [
      premierFixture(),
      premierFixture({ sort_order: 1, team_a: "Solari Two", team_b: "Lunari Three" }),
      premierFixture({ sort_order: 2, team_a: "Lunari One", team_b: "Solari Four" }),
      premierFixture({ sort_order: 3, team_a: "Lunari Two", team_b: "Solari Three" }),
      premierFixture({ stage: "semifinals", sort_order: 0, team_a: null, team_b: null }),
      premierFixture({ stage: "semifinals", sort_order: 1, team_a: null, team_b: null }),
      premierFixture({ stage: "finals", sort_order: 0, team_a: null, team_b: null }),
    ];
    const names = premierEntrants.map(({ name }) => name);
    const plan = planBracketSeed([], fixtures, "S5", names, names, premierEntrants);

    expect(plan.errors).toEqual([]);
    expect(plan.inserts).toHaveLength(7);
    expect(plan.inserts.slice(4).every((row) => row.team_a === null && row.team_b === null && row.division === null)).toBe(true);
    expect(() => parseBracketFile({ league: "premier", entrants: premierEntrants, fixtures })).not.toThrow();
  });

  it("keeps advanced teams on stable semifinal slots when the seed file still has TBDs", () => {
    const planned = premierFixture({ stage: "semifinals", sort_order: 0, team_a: null, team_b: null });
    const current: ExistingFixture = {
      id: "semi-1",
      season: "S5",
      stage: "semifinals",
      sort_order: 0,
      team_a: "Solari One",
      team_b: "Lunari Two",
      score_a: null,
      score_b: null,
      division: null,
      best_of: 5,
      scheduled_at: planned.scheduled_at,
    };
    const names = premierEntrants.map(({ name }) => name);
    const plan = planBracketSeed([current], [planned], "S5", names, names, premierEntrants);
    expect(plan.errors).toEqual([]);
    expect(plan.unchanged).toEqual([{ id: "semi-1", stage: "semifinals", sort_order: 0 }]);
  });

  it("blocks a changed Premier slot with scores or downstream work", () => {
    const protectedFixture: ExistingFixture = {
      id: "qf-1",
      season: "S5",
      stage: "quarterfinals",
      sort_order: 0,
      team_a: "Old name",
      team_b: "Lunari Four",
      score_a: null,
      score_b: null,
      protectedReasons: ["match_reports"],
    };
    const names = premierEntrants.map(({ name }) => name);
    const plan = planBracketSeed([protectedFixture], [premierFixture()], "S5", names, names, premierEntrants);
    expect(plan.updates).toHaveLength(0);
    expect(plan.errors.join(" ")).toContain("protected");
  });
});
