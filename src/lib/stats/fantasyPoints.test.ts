import { describe, expect, it } from "vitest";
import {
  FANTASY_TARIFF,
  fantasyKey,
  fantasySeason,
  fantasyWeek,
  type FantasyStatRow,
  gamePoints,
  weekOf,
  weeksIn,
} from "./fantasyPoints";

function game(over: Partial<FantasyStatRow> = {}): FantasyStatRow {
  return {
    summoner_name: "Doug",
    tag: "NA1",
    game_date: "2026-08-26T02:00:00Z",
    kills: 0,
    deaths: 0,
    assists: 0,
    cs_per_min: 0,
    vision_score: 0,
    damage_share_pct: 0,
    kill_participation_pct: 0,
    win: false,
    ...over,
  };
}

describe("the tariff", () => {
  it("matches the league's point values", () => {
    // The numbers as posted. Nothing else in the codebase writes them
    // down, so this is the one place a balance change has to touch.
    expect(FANTASY_TARIFF).toEqual({
      kill: 3,
      death: -1,
      assist: 1.5,
      csPerMin: 0.5,
      visionScore: 0.05,
      damageShare: 10,
      killParticipation: 5,
      win: 5,
    });
  });
});

describe("scoring one game", () => {
  it("prices each line the way the table says", () => {
    expect(gamePoints(game({ kills: 4 }))).toBe(12);
    expect(gamePoints(game({ deaths: 3 }))).toBe(-3);
    expect(gamePoints(game({ assists: 6 }))).toBe(9);
    expect(gamePoints(game({ cs_per_min: 8.4 }))).toBe(4.2);
    expect(gamePoints(game({ vision_score: 42 }))).toBe(2.1);
    expect(gamePoints(game({ win: true }))).toBe(5);
  });

  it("reads damage share and KP as fractions, not percentages", () => {
    // THE trap in this module. raw_stats stores 30 for "30%", and the
    // tariff prices per 1.0 — so a missing /100 pays 300 points for an
    // ordinary game, and the leaderboard still looks plausibly sorted.
    expect(gamePoints(game({ damage_share_pct: 30 }))).toBe(3);
    expect(gamePoints(game({ kill_participation_pct: 70 }))).toBe(3.5);
    // A whole team's damage is the full ten points, never a hundred.
    expect(gamePoints(game({ damage_share_pct: 100 }))).toBe(10);
  });

  it("adds up a real-looking game", () => {
    // 7 kills (21) − 2 deaths (−2) + 9 assists (13.5) + 8.1 cs/m (4.05)
    // + 38 vision (1.9) + 31% damage (3.1) + 74% KP (3.7) + a win (5)
    const points = gamePoints(
      game({
        kills: 7,
        deaths: 2,
        assists: 9,
        cs_per_min: 8.1,
        vision_score: 38,
        damage_share_pct: 31,
        kill_participation_pct: 74,
        win: true,
      }),
    );
    expect(points).toBe(50.25);
  });

  it("charges for deaths", () => {
    expect(gamePoints(game({ kills: 1, deaths: 10 }))).toBe(-7);
  });

  it("scores a row with missing columns instead of returning NaN", () => {
    // An ingest that dropped vision score should cost the vision points,
    // not the whole game — a NaN here would poison a season total and
    // sort to the bottom of the table silently.
    const sparse = { summoner_name: "Doug", tag: "NA1", kills: 5, win: true } as FantasyStatRow;
    expect(gamePoints(sparse)).toBe(20);
    expect(Number.isFinite(gamePoints({} as FantasyStatRow))).toBe(true);
  });

  it("takes a different tariff without touching the default", () => {
    expect(gamePoints(game({ kills: 1 }), { ...FANTASY_TARIFF, kill: 10 })).toBe(10);
    expect(gamePoints(game({ kills: 1 }))).toBe(3);
  });
});

describe("a player's season", () => {
  const rows: FantasyStatRow[] = [
    // Doug plays twice in the week of Aug 24 — 14 points and 3 — and once
    // the following week for 6.
    game({ kills: 3, win: true, game_date: "2026-08-25T20:00:00Z" }),
    game({ kills: 1, game_date: "2026-08-26T20:00:00Z" }),
    game({ kills: 2, game_date: "2026-09-02T20:00:00Z" }),
    // Ana plays once, for 30.
    game({ summoner_name: "Ana", tag: "EUW", kills: 10, game_date: "2026-08-25T20:00:00Z" }),
  ];

  it("groups by name AND tag", () => {
    // Two players can share a summoner name across regions; keying on the
    // name alone would silently merge their seasons.
    const players = fantasySeason([...rows, game({ summoner_name: "Doug", tag: "EUW", kills: 1 })]);
    expect(players.map((player) => player.key).sort()).toEqual(["Ana#EUW", "Doug#EUW", "Doug#NA1"]);
    expect(fantasyKey({ summoner_name: "Doug", tag: "NA1" })).toBe("Doug#NA1");
  });

  it("scores a week as the AVERAGE of its games, never the sum", () => {
    // THE rule. Doug's first week is 14 and 3 — that is 8.5, not 17.
    // Summing would mean turning up four times beat playing well twice,
    // which is a participation trophy rather than a score.
    const doug = fantasySeason(rows).find((player) => player.key === "Doug#NA1")!;
    expect(doug.byWeek.get("2026-08-24")!.points).toBe(8.5);
    expect(doug.byWeek.get("2026-08-24")!.games).toBe(2);
    expect(doug.byWeek.get("2026-08-31")!.points).toBe(6);
  });

  it("totals the season as the SUM of the weekly scores", () => {
    // 8.5 + 6. Playing more weeks earns more; playing more games inside
    // one week does not.
    const doug = fantasySeason(rows).find((player) => player.key === "Doug#NA1")!;
    expect(doug.points).toBe(14.5);
    expect(doug.weeks).toHaveLength(2);
    expect(doug.games).toBe(3);
    expect(doug.wins).toBe(1);
    expect(doug.perWeek).toBe(7.25);
  });

  it("cannot be climbed by playing more games in one week", () => {
    // The regression this correction is about: a player who plays the same
    // game four times must score exactly what they score playing it once.
    const once = fantasySeason([game({ kills: 4, game_date: "2026-08-25T20:00:00Z" })]);
    const fourTimes = fantasySeason(
      Array.from({ length: 4 }, () => game({ kills: 4, game_date: "2026-08-25T20:00:00Z" })),
    );
    expect(fourTimes[0].points).toBe(once[0].points);
    expect(fourTimes[0].games).toBe(4);
  });

  it("ranks on the season total", () => {
    const players = fantasySeason(rows);
    expect(players[0].key).toBe("Ana#EUW");
    expect(players[0].points).toBe(30);
    expect(players[1].key).toBe("Doug#NA1");
  });

  it("splits the season into Eastern weeks", () => {
    const doug = fantasySeason(rows).find((player) => player.key === "Doug#NA1")!;
    // The 25th and 26th of August are the same league week; September 2nd
    // is the next one. Newest first.
    expect(doug.weeks.map((week) => week.week)).toEqual(["2026-08-31", "2026-08-24"]);
  });

  it("skips a row that belongs to nobody", () => {
    // A nameless row counted under "#" would invent a player the league
    // does not have, sitting in the table with nothing to click.
    const players = fantasySeason([...rows, game({ summoner_name: null })]);
    expect(players.every((player) => player.summonerName)).toBe(true);
    expect(players).toHaveLength(2);
  });

  it("drops a game with no date rather than scoring it into no week", () => {
    // It belongs to no week, so there is nothing to average it into.
    // Keeping it would make `games` disagree with `points`, and a table
    // whose own columns contradict each other is worse than a missing row.
    expect(fantasySeason([game({ kills: 5, game_date: null })])).toEqual([]);
    expect(weekOf({ game_date: null })).toBeNull();
    expect(weekOf({ game_date: "not a date" })).toBeNull();
  });

  it("returns nothing at all for no rows", () => {
    expect(fantasySeason([])).toEqual([]);
    expect(weeksIn([])).toEqual([]);
  });
});

describe("one week of it", () => {
  const rows: FantasyStatRow[] = [
    game({ kills: 3, win: true, game_date: "2026-08-25T20:00:00Z" }),
    game({ kills: 1, game_date: "2026-09-02T20:00:00Z" }),
    game({ summoner_name: "Ana", tag: "EUW", kills: 10, game_date: "2026-09-02T20:00:00Z" }),
  ];

  it("lists the weeks that have games, newest first", () => {
    expect(weeksIn(rows)).toEqual(["2026-08-31", "2026-08-24"]);
  });

  it("re-ranks on the week's own score", () => {
    const week = fantasyWeek(fantasySeason(rows), "2026-08-31");
    expect(week.map((player) => player.key)).toEqual(["Ana#EUW", "Doug#NA1"]);
    expect(week[0].weekScore.points).toBe(30);
    expect(week[1].weekScore.points).toBe(3);
  });

  it("leaves out anyone who didn't play that week", () => {
    const week = fantasyWeek(fantasySeason(rows), "2026-08-24");
    expect(week.map((player) => player.key)).toEqual(["Doug#NA1"]);
    expect(week[0].weekScore.games).toBe(1);
    expect(week[0].weekScore.wins).toBe(1);
  });

  it("never disagrees with the season about a week", () => {
    // The weekly view is DERIVED from the season rather than re-scored, so
    // the weeks must sum back to the season total exactly.
    const season = fantasySeason(rows);
    const doug = season.find((player) => player.key === "Doug#NA1")!;
    const fromWeeks = weeksIn(rows)
      .flatMap((week) => fantasyWeek(season, week))
      .filter((player) => player.key === "Doug#NA1")
      .reduce((sum, player) => sum + player.weekScore.points, 0);
    expect(fromWeeks).toBe(doug.points);
  });
});
