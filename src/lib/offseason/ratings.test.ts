import { describe, expect, it } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import { compareByRating, entrantKey, leaderboards, rateEntrants, rateRows, type OffseasonStatRow } from "./ratings";
import type { OffseasonEntrant } from "./types";

const RIOT_ROLE: Record<LolRole, string> = { top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" };
const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

function statRow(overrides: Partial<OffseasonStatRow>): OffseasonStatRow {
  return {
    summoner_name: "Player",
    tag: "OS1",
    season: "OFFSEASON",
    season_phase: "Offseason",
    role: "MIDDLE",
    champion: "Ahri",
    game_date: "2026-10-20",
    match_id: "NA1_1000000001",
    team_name: "Team Blue",
    team_side: "Blue",
    game_duration_min: 30,
    kills: 5,
    deaths: 3,
    assists: 7,
    solo_kills: 1,
    kill_participation_pct: 55,
    cs: 220,
    cs_per_min: 7.3,
    gold_earned: 11_000,
    gold_per_min: 370,
    total_damage_to_champions: 18_000,
    damage_per_min: 600,
    damage_share_pct: 20,
    vision_score: 25,
    vision_score_per_min: 0.8,
    turret_plates_destroyed: 1,
    double_kills: 0,
    triple_kills: 0,
    quadra_kills: 0,
    penta_kills: 0,
    cs_at_10: 70,
    gold_at_10: 3_200,
    xp_at_10: 4_500,
    damage_taken_per_min: 500,
    kda_challenges: 4,
    first_blood_kill: false,
    first_blood_assist: false,
    win: true,
    ...overrides,
  };
}

/** One game: "Blue n" beats "Red n" in every role; `boost` makes a player dominate. */
function game(matchId: string, boost: Record<string, number> = {}): OffseasonStatRow[] {
  return ROLES.flatMap((role) =>
    (["Blue", "Red"] as const).map((side) => {
      const name = `${side} ${role}`;
      const scale = boost[name] ?? 1;
      return statRow({
        summoner_name: name,
        match_id: matchId,
        role: RIOT_ROLE[role],
        team_side: side,
        team_name: `Team ${side}`,
        win: side === "Blue",
        kills: Math.round((side === "Blue" ? 6 : 3) * scale),
        deaths: side === "Blue" ? 2 : 5,
        total_damage_to_champions: Math.round(18_000 * scale),
        damage_per_min: Math.round(600 * scale),
        gold_earned: Math.round(11_000 * scale),
      });
    }),
  );
}

let clock = 0;
function entrant(name: string, role: LolRole, overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  clock += 1;
  return {
    id: name,
    event_id: "event",
    profile_id: null,
    display_name: name,
    riot_id: `${name}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: `2026-10-01T00:00:${String(clock).padStart(2, "0")}Z`,
    locked_in_role: null,
    locked_in_at: null,
    ...overrides,
  };
}

describe("entrantKey", () => {
  it("matches the card engine's player key", () => {
    expect(entrantKey("Some Name#OS1")).toBe("some name#os1");
    expect(entrantKey("no tag")).toBeNull();
  });
});

describe("rateRows", () => {
  it("returns nothing for no rows", () => {
    expect(rateRows([], "S6").size).toBe(0);
  });

  it("rates every player in the cohort", () => {
    const cards = rateRows(game("NA1_1000000001"), "S6");
    expect(cards.size).toBe(10);
    const blueMid = cards.get("blue mid#os1")!;
    expect(blueMid.overall).toBeGreaterThan(0);
    expect(blueMid.wins).toBe(1);
  });

  it("uses the side when the ingest could not name a team", () => {
    const rows = game("NA1_1000000001").map((row) => ({ ...row, team_name: null }));
    expect(rateRows(rows, "S6").size).toBe(10);
  });
});

describe("rateEntrants", () => {
  const entrants = [entrant("Blue mid", "mid"), entrant("Red mid", "mid"), entrant("Never Played", "mid")];
  const rows = [
    ...game("NA1_1000000001", { "Blue mid": 1.6 }),
    ...game("NA1_1000000002"),
    ...game("NA1_9999999999"),
  ];
  const weekOfMatch = new Map([
    ["NA1_1000000001", 1],
    ["NA1_1000000002", 2],
  ]);
  const ratings = rateEntrants({ entrants, rows, weekOfMatch, yardstickSeason: "S6" });

  it("rates cumulatively over the event's games only", () => {
    const blue = ratings.get("Blue mid")!;
    expect(blue.games).toBe(2);
    expect(blue).toMatchObject({ wins: 2, losses: 0 });
    expect(ratings.get("Red mid")).toMatchObject({ games: 2, wins: 0, losses: 2 });
    expect(blue.overall!).toBeGreaterThan(ratings.get("Red mid")!.overall!);
  });

  it("keeps a week-by-week trend", () => {
    const weekly = ratings.get("Blue mid")!.weekly;
    expect(weekly.map((week) => [week.week, week.games])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(weekly.every((week) => typeof week.overall === "number")).toBe(true);
  });

  it("leaves a player without games unrated", () => {
    expect(ratings.get("Never Played")).toMatchObject({ card: null, overall: null, games: 0, weekly: [] });
  });

  it("sorts best first with unrated players last", () => {
    const sorted = [...entrants].reverse().sort(compareByRating(ratings));
    expect(sorted.map((player) => player.id)).toEqual(["Blue mid", "Red mid", "Never Played"]);
  });

  it("builds per-role leaderboards without withdrawn players", () => {
    const boards = leaderboards(
      [...entrants, entrant("Gone", "mid", { status: "withdrawn" }), entrant("Unplaced", "top", { assigned_role: null })],
      ratings,
    );
    expect(boards.mid.map((player) => player.id)).toEqual(["Blue mid", "Red mid", "Never Played"]);
    expect(boards.top).toEqual([]);
  });
});
