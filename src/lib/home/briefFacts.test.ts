import { describe, expect, it } from "vitest";
import {
  aggregatePlayerLines,
  summariseSeries,
  weekBoundsFromLatest,
  withinWindow,
  type BriefFixture,
  type BriefStatRow,
} from "./briefFacts";

const bo3 = (a: number, b: number, division = "Lunari"): BriefFixture => ({
  division, team_a: "Alpha", team_b: "Beta", score_a: a, score_b: b, best_of: 3,
});

describe("summariseSeries", () => {
  // The regression: a week 1 brief listed three 2-1 results and then wrote
  // that only one side had forced a third game. The model was inferring a
  // count nobody had given it, so the count is supplied now.
  it("counts every series that went the distance, not just one", () => {
    const summary = summariseSeries([bo3(2, 1), bo3(2, 1), bo3(2, 0), bo3(2, 1)]);
    expect(summary.series_that_went_the_distance).toBe(3);
    expect(summary.total_series).toBe(4);
    expect(summary.sweeps).toBe(1);
  });

  it("names both teams in a deciding-game series", () => {
    const summary = summariseSeries([
      { division: "Solari", team_a: "Wildcats", team_b: "Alcatraz", score_a: 1, score_b: 2, best_of: 3 },
    ]);
    expect(summary.teams_that_went_the_distance).toEqual(["Alcatraz", "Wildcats"]);
  });

  it("reports the winner and a high-first scoreline regardless of side", () => {
    const [result] = summariseSeries([
      { division: null, team_a: "Alpha", team_b: "Beta", score_a: 0, score_b: 2, best_of: 3 },
    ]).results;
    expect(result.winner).toBe("Beta");
    expect(result.loser).toBe("Alpha");
    expect(result.score).toBe("2-0");
    expect(result.was_sweep).toBe(true);
    expect(result.went_to_deciding_game).toBe(false);
  });

  it("measures the distance against best_of, so a Bo5 needs five games", () => {
    const bo5 = (a: number, b: number): BriefFixture => ({
      division: null, team_a: "Alpha", team_b: "Beta", score_a: a, score_b: b, best_of: 5,
    });
    expect(summariseSeries([bo5(3, 1)]).series_that_went_the_distance).toBe(0);
    expect(summariseSeries([bo5(3, 2)]).series_that_went_the_distance).toBe(1);
  });
});

describe("weekBoundsFromLatest", () => {
  it("returns the Monday-to-Monday window around the newest game", () => {
    // 2026-08-19 is a Wednesday; its week starts Monday the 17th.
    const bounds = weekBoundsFromLatest(["2026-08-19T02:00:00Z", "2026-08-18T01:00:00Z"]);
    expect(bounds?.start).toBe("2026-08-17T00:00:00.000Z");
    expect(bounds?.end).toBe("2026-08-24T00:00:00.000Z");
  });

  it("returns null when there are no dates at all", () => {
    expect(weekBoundsFromLatest([null, null])).toBeNull();
  });
});

describe("withinWindow", () => {
  const row = (game_date: string | null): BriefStatRow => ({
    summoner_name: "Ace", team_name: "Alpha", champion: "Ahri",
    kills: 1, deaths: 1, assists: 1, total_damage_to_champions: 1, game_date,
  });

  // The other regression: a brief said no stat lines existed for a week that
  // had been fully ingested, because the window started at the fixture's
  // scheduled kickoff and the games were played before it.
  it("keeps a game played earlier than its scheduled slot", () => {
    const bounds = weekBoundsFromLatest(["2026-08-19T02:00:00Z"]);
    expect(withinWindow([row("2026-08-17T18:00:00Z")], bounds)).toHaveLength(1);
  });

  it("drops a game from the week before and rows with no date", () => {
    const bounds = weekBoundsFromLatest(["2026-08-19T02:00:00Z"]);
    expect(withinWindow([row("2026-08-10T18:00:00Z"), row(null)], bounds)).toHaveLength(0);
  });
});

describe("aggregatePlayerLines", () => {
  const line = (name: string, k: number, d: number, a: number, dmg = 0): BriefStatRow => ({
    summoner_name: name, team_name: "Alpha", champion: "Ahri",
    kills: k, deaths: d, assists: a, total_damage_to_champions: dmg,
    game_date: "2026-08-18T01:00:00Z",
  });

  it("totals a player across their games and ranks by KDA", () => {
    const lines = aggregatePlayerLines([line("Ace", 5, 1, 5), line("Ace", 5, 1, 5), line("Bolt", 1, 5, 1)]);
    expect(lines[0].player).toBe("Ace");
    expect(lines[0].games).toBe(2);
    expect(lines[0].kills).toBe(10);
    expect(lines[0].kda).toBe(10);
    expect(lines[1].player).toBe("Bolt");
  });

  it("treats a deathless game as its own kda rather than Infinity", () => {
    // Infinity serialises to null in JSON, which reads to the model as
    // "no data" instead of "flawless".
    const [only] = aggregatePlayerLines([line("Ace", 4, 0, 2)]);
    expect(only.kda).toBe(6);
    expect(Number.isFinite(only.kda)).toBe(true);
  });

  it("ignores rows with no player name", () => {
    expect(aggregatePlayerLines([{ ...line("Ace", 1, 1, 1), summoner_name: null }])).toHaveLength(0);
  });
});
