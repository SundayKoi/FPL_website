import { describe, expect, it } from "vitest";
import { OVR_BASE, OVR_SCALE } from "./build";
import { MIN_STYLE_GAMES } from "./styleRating";
import { buildDistributions, buildStyleYardstick, fitCurve, quantiles, type HistoryRow } from "./styleYardstickBuilder";

let matches = 0;

/** One history game: a pair of opponents in the same role, per call. */
function lane(role: string, champion: string, opponent: string, over: Partial<HistoryRow> = {}, season = "S1"): HistoryRow[] {
  matches += 1;
  const base = (name: string, champ: string, team: string): HistoryRow => ({
    summoner_name: name,
    tag: "NA1",
    season,
    season_phase: "Regular",
    role,
    champion: champ,
    win: team === "Blue",
    game_date: "2026-01-06T01:00:00Z",
    match_id: `H${matches}`,
    team_name: team,
    team_side: team,
    game_duration_min: 30,
    kills: 4,
    deaths: 3,
    assists: 6,
    cs: 210,
    cs_at_10: 70,
    gold_at_10: 3200,
    xp_at_10: 4400,
    total_damage_to_champions: 21000,
    damage_share_pct: 22,
    damage_taken: 20000,
    damage_mitigated: 20000,
    time_ccing_others_s: 20,
    solo_kills: 0,
    turret_damage: 3000,
    kill_participation_pct: 55,
    vision_score: 30,
  } as HistoryRow);
  return [{ ...base(`${champion}${matches}`, champion, "Blue"), ...over }, base(`${opponent}${matches}`, opponent, "Red")];
}

describe("quantiles", () => {
  it("marks every 5th percentile", () => {
    const hundred = Array.from({ length: 101 }, (_, i) => i);
    expect(quantiles(hundred)).toEqual(Array.from({ length: 21 }, (_, i) => i * 5));
    expect(quantiles([])).toEqual([]);
  });
});

describe("buildDistributions", () => {
  it("files each game under its style in its role, and under its class everywhere", () => {
    const { distributions, games } = buildDistributions([...lane("MIDDLE", "Zed", "Orianna"), ...lane("TOP", "Sion", "Darius")]);
    expect(games).toBe(4);
    expect(Object.keys(distributions).sort()).toEqual([
      "*|assassin", "*|bruiser", "*|mage", "*|tank", "MIDDLE|assassin", "MIDDLE|mage", "TOP|bruiser", "TOP|tank",
    ]);
    // Only the stats the style is graded on are kept.
    expect(Object.keys(distributions["MIDDLE|assassin"].stats).sort()).toEqual(["dmg", "kills", "solo"]);
    expect(Object.keys(distributions["TOP|tank"].stats).sort()).toEqual(["cc", "mitigated", "takenShare"]);
  });

  it("records that tanks farm less than the role, and shrinks a rarely seen style's offset", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => lane("TOP", "Sion", "Darius", { cs: 180 })).flat(),
    ];
    const { offsets } = buildDistributions(rows);
    // Sion 6/min, Darius 7/min: the role averages 6.5, tanks sit half a CS
    // under it — shrunk by 10/(10+30) because ten games is not many.
    expect(offsets["TOP|tank"].cs).toBeCloseTo(-0.5 * (10 / 40));
    expect(offsets["TOP|bruiser"].cs).toBeCloseTo(0.5 * (10 / 40));
    // Lane diffs are measured against the opponent: Sion trails by 0 at 10.
    expect(offsets["TOP|tank"].csd).toBe(0);
  });
});

describe("buildStyleYardstick", () => {
  it("borrows another league's history when the league has none", () => {
    const premier = new Map([["S1", lane("MIDDLE", "Zed", "Orianna")]]);
    const yardstick = buildStyleYardstick({ league: "academy", own: new Map(), borrow: premier });
    expect(yardstick.league).toBe("academy");
    expect(yardstick.history).toEqual(["S1"]);
    expect(yardstick.borrowed).toEqual(["all"]);
  });

  it("borrows only the styles its own history has seen too rarely", () => {
    const own = new Map([["A1", Array.from({ length: MIN_STYLE_GAMES }, () => lane("MIDDLE", "Orianna", "Syndra", {}, "A1")).flat()]]);
    const borrow = new Map([["S1", Array.from({ length: MIN_STYLE_GAMES }, () => lane("MIDDLE", "Zed", "Orianna")).flat()]]);
    const yardstick = buildStyleYardstick({ league: "academy", own, borrow });
    expect(yardstick.history).toEqual(["A1"]);
    // Academy's own mages are plentiful; its assassins do not exist yet.
    expect(yardstick.borrowed).toContain("MIDDLE|assassin");
    expect(yardstick.borrowed).not.toContain("MIDDLE|mage");
    expect(yardstick.distributions["MIDDLE|mage"].games).toBe(MIN_STYLE_GAMES * 2);
  });
});

describe("fitCurve", () => {
  it("keeps the old curve when there is no history to fit", () => {
    expect(fitCurve(new Map(), () => { throw new Error("unused"); })).toEqual({ base: OVR_BASE, scale: OVR_SCALE });
  });
});
