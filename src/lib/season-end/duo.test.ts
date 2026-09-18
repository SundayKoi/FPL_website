import { describe, expect, it } from "vitest";
import type { SeasonRow } from "./derive";
import { DUO_PAIR_DEFINITIONS, midrankPercentile, scoreDuoPairs } from "./duo";

const definition = DUO_PAIR_DEFINITIONS[0];
const metricFields = ["kill_participation_pct", "kda", "damage_per_min", "vision_score_per_min"] as const;

function row(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    match_id: "m1",
    summoner_name: "Jungle",
    tag: "NA1",
    season: "S5",
    season_phase: "Regular",
    team_name: "Wolves",
    team_side: "Blue",
    role: "JUNGLE",
    game_date: "2026-08-01T00:00:00.000Z",
    champion: "Ahri",
    win: true,
    kill_participation_pct: 50,
    kda: 2,
    damage_per_min: 500,
    vision_score_per_min: 1,
    ...overrides,
  };
}

function pairGame(matchId: string, left: Partial<SeasonRow> = {}, right: Partial<SeasonRow> = {}): [SeasonRow, SeasonRow] {
  return [
    row({ match_id: matchId, ...left }),
    row({ match_id: matchId, summoner_name: "Mid", role: "MIDDLE", ...right }),
  ];
}

describe("Duo Impact scoring", () => {
  it("uses neutral singleton and equal-observation midranks", () => {
    expect(midrankPercentile(12, [12])).toBe(50);
    expect(midrankPercentile(12, [12, 12, 12])).toBe(50);
    expect(midrankPercentile(10, [10, 20, 30])).toBe(0);
    expect(midrankPercentile(30, [10, 20, 30])).toBe(100);
  });

  it("applies the four weights without dynamically reweighting missing components", () => {
    const candidate = pairGame("m1", {
      kill_participation_pct: 100,
      kda: 0,
      damage_per_min: 0,
      vision_score_per_min: 0,
    }, {
      kill_participation_pct: 100,
      kda: 0,
      damage_per_min: 0,
      vision_score_per_min: 0,
    });
    const references = [
      row({ summoner_name: "JungleRef", kill_participation_pct: 0, kda: 2, damage_per_min: 500, vision_score_per_min: 1 }),
      row({ summoner_name: "MidRef", role: "MIDDLE", kill_participation_pct: 0, kda: 2, damage_per_min: 500, vision_score_per_min: 1 }),
    ];
    const result = scoreDuoPairs([...candidate, ...references], [candidate], definition, 1);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.pairs[0].componentScores).toMatchObject({
      kill_participation_pct: 100,
      kda: 0,
      damage_per_min: 0,
      vision_score_per_min: 0,
    });
    expect(result.pairs[0].value).toBeCloseTo(35);

    const missing = scoreDuoPairs([
      row({ kill_participation_pct: null }),
      candidate[1],
    ], [candidate], definition, 1);
    expect(missing.status).toBe("unavailable");
  });

  it("gives each member equal influence and averages game scores", () => {
    const first = pairGame("m1", Object.fromEntries(metricFields.map((field) => [field, 0])) as Partial<SeasonRow>, Object.fromEntries(metricFields.map((field) => [field, 0])) as Partial<SeasonRow>);
    const second = pairGame("m2", Object.fromEntries(metricFields.map((field) => [field, 100])) as Partial<SeasonRow>, Object.fromEntries(metricFields.map((field) => [field, 100])) as Partial<SeasonRow>);
    const refs = [
      row({ summoner_name: "JRef", ...Object.fromEntries(metricFields.map((field) => [field, 50])) }),
      row({ summoner_name: "MRef", role: "MIDDLE", ...Object.fromEntries(metricFields.map((field) => [field, 50])) }),
    ];
    const result = scoreDuoPairs([...first, ...second, ...refs], [first, second], definition, 1);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.pairs[0].value).toBeCloseTo(50);
    expect(result.pairs[0].rawAverages[0]).toMatchObject({
      kill_participation_pct: 50,
      kda: 50,
      damage_per_min: 50,
      vision_score_per_min: 50,
    });
  });

  it("keeps unrelated-role gaps out of coverage and reports no eligible pair as unearned", () => {
    const pair = pairGame("m1");
    const unrelated = row({ role: "TOP", kill_participation_pct: null });
    expect(scoreDuoPairs([...pair, unrelated], [pair], definition, 1).status).toBe("ready");
    expect(scoreDuoPairs(pair, [pair], definition, 2).status).toBe("unearned");
  });

  it("rejects malformed role evidence instead of selecting an arbitrary participant", () => {
    const pair = pairGame("m1");
    const duplicate = row({ match_id: "m1", summoner_name: "Other Jungle" });
    expect(scoreDuoPairs([...pair, duplicate], [[...pair, duplicate]], definition, 1).status).toBe("unavailable");
  });
});
