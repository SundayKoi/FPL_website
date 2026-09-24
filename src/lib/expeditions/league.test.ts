import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mondayOf } from "@/lib/packs/week";
import {
  BOSS_HEALTH,
  CAIRN_TITLE,
  LANDMARK_MILES,
  contributorsOf,
  goalKindFor,
  goalProgress,
  leagueBoardFor,
  leagueGoalFor,
  myShare,
  ordinal,
  progressLine,
  targetFor,
  weekFixtures,
  weeksToWatch,
  type LeagueGoalRecord,
  type LeagueProgressRow,
} from "./league";

const PREMIER = "S5";
const ACADEMY = "A1";
// Wednesday 23 September 2026, midday Eastern.
const NOW = new Date("2026-09-23T16:00:00Z");
const THIS_WEEK = "2026-09-21";
const LAST_WEEK = "2026-09-14";

const row = (over: Partial<LeagueProgressRow>): LeagueProgressRow => ({
  season: PREMIER,
  weekStart: THIS_WEEK,
  discordId: "ann",
  username: "Ann",
  miles: 0,
  pushes: 0,
  ...over,
});

describe("the goal's size", () => {
  it("is 40 miles or 24 pushes, inside the bounds fell_expedition_league_goal accepts", () => {
    expect(LANDMARK_MILES).toBe(40);
    expect(BOSS_HEALTH).toBe(24);
    expect(targetFor("landmark")).toBe(LANDMARK_MILES);
    expect(targetFor("boss")).toBe(BOSS_HEALTH);
    // The size lives here; the SQL only bounds it, so a slip cannot pay
    // the league for one mile. The newest migration declaring the RPC is
    // the live one.
    const dir = join(process.cwd(), "supabase/migrations");
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .find((name) => readFileSync(join(dir, name), "utf8").includes("create or replace function public.fell_expedition_league_goal"));
    const sql = readFileSync(join(dir, latest!), "utf8");
    const bounds = sql.match(/p_target < (\d+) or p_target > (\d+) then raise exception 'bad target'/);
    expect(bounds, "the RPC bounds the target").not.toBeNull();
    const [low, high] = [Number(bounds![1]), Number(bounds![2])];
    for (const target of [LANDMARK_MILES, BOSS_HEALTH]) {
      expect(target).toBeGreaterThanOrEqual(low);
      expect(target).toBeLessThanOrEqual(high);
    }
  });
});

describe("goalKindFor", () => {
  it("alternates every week, the same way for everyone who asks", () => {
    const weeks = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
    const kinds = weeks.map((week) => goalKindFor(PREMIER, week));
    for (let i = 1; i < kinds.length; i += 1) expect(kinds[i]).not.toBe(kinds[i - 1]);
    expect(weeks.map((week) => goalKindFor(PREMIER, week))).toEqual(kinds);
  });

  it("gives each league its own phase, decided by nothing but the season", () => {
    // Whatever the phase, it holds across weeks: a league that is out of
    // step one week is out of step every week.
    const same = goalKindFor(PREMIER, THIS_WEEK) === goalKindFor(ACADEMY, THIS_WEEK);
    expect(goalKindFor(PREMIER, LAST_WEEK) === goalKindFor(ACADEMY, LAST_WEEK)).toBe(same);
  });
});

describe("leagueGoalFor", () => {
  const fixtures = [
    // Another league's match earlier the same week never names this one.
    { team_a: "Academy Owls", team_b: "Academy Foxes", scheduled_at: "2026-09-21T23:00:00Z", season: ACADEMY },
    // A TBD slot is skipped.
    { team_a: null, team_b: "Hawks", scheduled_at: "2026-09-21T23:30:00Z", season: PREMIER },
    { team_a: "The Lions", team_b: "Tigers", scheduled_at: "2026-09-22T00:00:00Z", season: PREMIER },
    { team_a: "Bears", team_b: "Wolves", scheduled_at: "2026-09-23T00:00:00Z", season: PREMIER },
    // Sunday night ET of the week before (Monday 03:00 UTC) is last week's.
    { team_a: "Early", team_b: "Birds", scheduled_at: "2026-09-21T03:00:00Z", season: PREMIER },
  ];

  it("names a landmark after the week's first fixture of this league, and a boss after its second team", () => {
    const goal = leagueGoalFor(PREMIER, THIS_WEEK, fixtures);
    expect(goal.season).toBe(PREMIER);
    expect(goal.weekStart).toBe(THIS_WEEK);
    if (goal.kind === "landmark") {
      expect(goal.title).toBe("The Lions–Tigers Ridge");
      expect(goal.target).toBe(LANDMARK_MILES);
      expect(goal.unit).toBe("miles");
    } else {
      expect(goal.title).toBe("The Tigers Colossus");
      expect(goal.target).toBe(BOSS_HEALTH);
      expect(goal.unit).toBe("pushes");
    }
    expect(weekFixtures(PREMIER, THIS_WEEK, fixtures).map((fixture) => fixture.team_b)).toEqual(["Hawks", "Tigers", "Wolves"]);
  });

  it("is the Cairn of the Week when the week has no fixture with both teams", () => {
    expect(leagueGoalFor(PREMIER, "2026-10-05", fixtures).title).toBe(CAIRN_TITLE);
    expect(leagueGoalFor(PREMIER, THIS_WEEK, []).title).toBe(CAIRN_TITLE);
  });

  it("the other league's week is named by its own fixtures", () => {
    const goal = leagueGoalFor(ACADEMY, THIS_WEEK, fixtures);
    expect(goal.title).toBe(goal.kind === "landmark" ? "The Academy Owls–Academy Foxes Ridge" : "The Academy Foxes Colossus");
  });
});

describe("weeksToWatch", () => {
  it("is this Eastern week and last", () => {
    expect(weeksToWatch(NOW)).toEqual([THIS_WEEK, LAST_WEEK]);
  });

  it("keeps the Eastern calendar at midnight Monday, not UTC's", () => {
    // Sunday 11:30 PM ET is Monday 03:30 UTC: still the old week.
    expect(weeksToWatch(new Date("2026-09-21T03:30:00Z"))).toEqual(["2026-09-14", "2026-09-07"]);
    expect(weeksToWatch(new Date("2026-09-21T04:30:00Z"))).toEqual([THIS_WEEK, LAST_WEEK]);
    // Across the November clock change (EST, UTC-5).
    expect(weeksToWatch(new Date("2026-11-02T04:30:00Z"))).toEqual(["2026-10-26", "2026-10-19"]);
    expect(weeksToWatch(new Date("2026-11-02T05:30:00Z"))).toEqual(["2026-11-02", "2026-10-26"]);
    expect(mondayOf(new Date("2026-11-02T05:30:00Z"))).toBe("2026-11-02");
  });
});

describe("progress", () => {
  const rows: LeagueProgressRow[] = [
    row({ discordId: "bo", username: "Bo", miles: 9, pushes: 1 }),
    row({ discordId: "ann", username: "Ann", miles: 9, pushes: 4 }),
    row({ discordId: "cy", username: "Cy", miles: 0, pushes: 0 }),
    row({ discordId: "dee", username: "Dee", miles: 13, pushes: 0 }),
    // Another league's week and another week of this league: never counted.
    row({ season: ACADEMY, discordId: "ann", miles: 30, pushes: 30 }),
    row({ weekStart: LAST_WEEK, discordId: "ann", miles: 30, pushes: 30 }),
  ];
  const landmark = { season: PREMIER, weekStart: THIS_WEEK, kind: "landmark" as const, target: 40 };
  const boss = { season: PREMIER, weekStart: THIS_WEEK, kind: "boss" as const, target: 24 };

  it("a landmark counts miles, most first, ties to the lower discord id, nobody with none", () => {
    expect(contributorsOf(landmark, rows).map((c) => `${c.discordId}:${c.stat}`)).toEqual(["dee:13", "ann:9", "bo:9"]);
    expect(goalProgress(landmark, rows)).toEqual({ total: 31, target: 40, remaining: 9, fraction: 31 / 40, collectors: 3, reached: false });
  });

  it("a boss counts pushes", () => {
    expect(contributorsOf(boss, rows).map((c) => `${c.discordId}:${c.stat}`)).toEqual(["ann:4", "bo:1"]);
    expect(goalProgress(boss, rows)).toMatchObject({ total: 5, remaining: 19, collectors: 2, reached: false });
  });

  it("reached at exactly the target, and the bar stops full", () => {
    const full = [...rows, row({ discordId: "eve", username: "Eve", miles: 9 })];
    expect(goalProgress(landmark, full)).toMatchObject({ total: 40, remaining: 0, fraction: 1, reached: true });
    const over = [...full, row({ discordId: "fin", username: "Fin", miles: 5 })];
    expect(goalProgress(landmark, over)).toMatchObject({ total: 45, remaining: 0, fraction: 1, reached: true });
  });

  it("myShare places the viewer among the contributors, or says they have none yet", () => {
    expect(myShare(landmark, rows, "bo")).toEqual({ stat: 9, rank: 3, of: 3 });
    expect(myShare(landmark, rows, "cy")).toEqual({ stat: 0, rank: null, of: 3 });
    expect(myShare(landmark, rows, null)).toBeNull();
  });

  it("puts a number in context", () => {
    const goal = leagueGoalFor(PREMIER, THIS_WEEK, []);
    const line = progressLine({ goal: { ...goal, kind: "landmark", unit: "miles", target: 40 }, progress: goalProgress(landmark, rows) });
    expect(line).toBe("31 of 40 miles walked by 3 collectors this week");
    const pushes = progressLine({ goal: { ...goal, kind: "boss", unit: "pushes", target: 24 }, progress: goalProgress(boss, rows) }, "last week");
    expect(pushes).toBe("5 of 24 pushes landed by 2 collectors last week");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
  });
});

describe("leagueBoardFor", () => {
  const thisGoal = leagueGoalFor(PREMIER, THIS_WEEK, []);
  const lastGoal = leagueGoalFor(PREMIER, LAST_WEEK, []);
  const stat = (kind: string, n: number) => (kind === "landmark" ? { miles: n } : { pushes: n });
  const progress: LeagueProgressRow[] = [
    row({ discordId: "ann", username: "Ann", ...stat(thisGoal.kind, 6) }),
    row({ discordId: "bo", username: "Bo", ...stat(thisGoal.kind, 2) }),
    row({ weekStart: LAST_WEEK, discordId: "bo", username: "Bo", ...stat(lastGoal.kind, lastGoal.target) }),
    // The Academy is walking too; none of it reaches Premier's board.
    row({ season: ACADEMY, discordId: "ann", username: "Ann", miles: 99, pushes: 99 }),
  ];
  const fellLastWeek: LeagueGoalRecord = {
    season: PREMIER,
    weekStart: LAST_WEEK,
    kind: lastGoal.kind,
    target: lastGoal.target,
    fellAt: "2026-09-17T18:00:00Z",
    topId: "bo",
    rewards: [{ discordId: "bo", fragments: 1, top: true }],
  };

  it("is hidden when either league read failed", () => {
    expect(leagueBoardFor({ season: PREMIER, now: NOW, fixtures: [], progress: null, goals: [], viewerId: "ann" })).toBeNull();
    expect(leagueBoardFor({ season: PREMIER, now: NOW, fixtures: [], progress, goals: null, viewerId: "ann" })).toBeNull();
    expect(leagueBoardFor({ season: null, now: NOW, fixtures: [], progress, goals: [], viewerId: "ann" })).toBeNull();
  });

  it("shows this week at zero when nobody has walked, and no last week", () => {
    const board = leagueBoardFor({ season: PREMIER, now: NOW, fixtures: [], progress: [], goals: [], viewerId: "ann" })!;
    expect(board.thisWeek.progress).toMatchObject({ total: 0, collectors: 0, reached: false });
    expect(board.thisWeek.me).toEqual({ stat: 0, rank: null, of: 0 });
    expect(board.lastWeek).toBeNull();
  });

  it("reads only its own league: this week's standing, last week's fall and its Vanguard", () => {
    const board = leagueBoardFor({ season: PREMIER, now: NOW, fixtures: [], progress, goals: [fellLastWeek], viewerId: "ann" })!;
    expect(board.thisWeek.goal.weekStart).toBe(THIS_WEEK);
    expect(board.thisWeek.progress.total).toBe(8);
    expect(board.thisWeek.leaders.map((leader) => leader.discordId)).toEqual(["ann", "bo"]);
    expect(board.thisWeek.me).toEqual({ stat: 6, rank: 1, of: 2 });
    expect(board.thisWeek.fell).toBeNull();
    expect(board.lastWeek?.fell).toEqual({ at: "2026-09-17T18:00:00Z", vanguard: { discordId: "bo", username: "Bo" }, rewarded: 1, mine: false });
  });

  it("keeps the kind and size a goal fell with, and says whether the viewer was paid", () => {
    const other = lastGoal.kind === "landmark" ? "boss" : "landmark";
    const board = leagueBoardFor({
      season: PREMIER,
      now: NOW,
      fixtures: [],
      progress,
      goals: [{ ...fellLastWeek, kind: other, target: 30 }],
      viewerId: "bo",
    })!;
    expect(board.lastWeek?.goal.kind).toBe(other);
    expect(board.lastWeek?.goal.target).toBe(30);
    expect(board.lastWeek?.fell?.mine).toBe(true);
  });

  it("keeps last week open while it has not fallen and someone walked", () => {
    const board = leagueBoardFor({ season: PREMIER, now: NOW, fixtures: [], progress, goals: [], viewerId: "ann" })!;
    expect(board.lastWeek?.fell).toBeNull();
    expect(board.lastWeek?.progress.total).toBe(lastGoal.target);
    expect(board.lastWeek?.me).toEqual({ stat: 0, rank: null, of: 1 });
  });

  it("the other league's board never sees this league's goal", () => {
    const board = leagueBoardFor({ season: ACADEMY, now: NOW, fixtures: [], progress, goals: [fellLastWeek], viewerId: "bo" })!;
    expect(board.lastWeek).toBeNull();
    expect(board.thisWeek.progress.collectors).toBe(1);
    expect(board.thisWeek.leaders.map((leader) => leader.discordId)).toEqual(["ann"]);
  });
});
