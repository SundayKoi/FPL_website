import { describe, expect, it } from "vitest";
import {
  createScoutingPerformanceAccumulator,
  mergeScoutingPerformance,
  normalizeScoutingPerformance,
} from "./performance";

const sample = (gameKey: string, values: Partial<Parameters<typeof normalizeScoutingPerformance>[0]> = {}) => ({
  gameKey,
  performance: normalizeScoutingPerformance(values),
});

describe("scouting performance aggregation", () => {
  it("uses ratio-of-totals KDA, duration-weighted DPM, and mean KP", () => {
    const accumulator = createScoutingPerformanceAccumulator();
    accumulator.add(sample("game-1", {
      kills: 2, deaths: 1, assists: 3, damageToChampions: 12000, durationMinutes: 20, killParticipationPct: 40,
    }));
    accumulator.add(sample("game-2", {
      kills: 6, deaths: 3, assists: 5, damageToChampions: 40000, durationMinutes: 40, killParticipationPct: 80,
    }));

    expect(accumulator.result()).toMatchObject({
      statGames: 2,
      kdaGames: 2,
      damageGames: 2,
      kpGames: 2,
      kda: 4,
      damagePerMinute: 866.6666666666666,
      killParticipationPct: 60,
    });
  });

  it("handles zero deaths without inventing a missing KDA", () => {
    const accumulator = createScoutingPerformanceAccumulator();
    accumulator.add(sample("game-1", { kills: 2, deaths: 0, assists: 3 }));
    expect(accumulator.result()).toMatchObject({ statGames: 1, kdaGames: 1, kda: 5 });
  });

  it("distinguishes zero metrics from missing and rejects invalid values", () => {
    const accumulator = createScoutingPerformanceAccumulator();
    accumulator.add(sample("zero", {
      kills: 0, deaths: 0, assists: 0, damageToChampions: 0, durationMinutes: 30, killParticipationPct: 0,
    }));
    accumulator.add(sample("invalid", {
      kills: -1, deaths: 2, assists: 1, damageToChampions: 100, durationMinutes: 0, killParticipationPct: 101,
    }));
    accumulator.add(sample("missing", {}));

    expect(accumulator.result()).toMatchObject({
      statGames: 1,
      kdaGames: 1,
      damageGames: 1,
      kpGames: 1,
      kda: 0,
      damagePerMinute: 0,
      killParticipationPct: 0,
    });
  });

  it("keeps metric samples independent when fields are partial", () => {
    const accumulator = createScoutingPerformanceAccumulator();
    accumulator.add(sample("kda-only", { kills: 1, deaths: 1, assists: 1 }));
    accumulator.add(sample("damage-only", { damageToChampions: 1000, durationMinutes: 10 }));
    accumulator.add(sample("kp-only", { killParticipationPct: 50 }));

    expect(accumulator.result()).toEqual({
      statGames: 3,
      kdaGames: 1,
      damageGames: 1,
      kpGames: 1,
      kda: 2,
      damagePerMinute: 100,
      killParticipationPct: 50,
    });
  });

  it("merges duplicate rows symmetrically and supplements missing metrics", () => {
    const left = normalizeScoutingPerformance({ kills: 2, deaths: 1, assists: 3, damageToChampions: 1000 });
    const right = normalizeScoutingPerformance({ kills: 2, deaths: 1, assists: 3, durationMinutes: 10, killParticipationPct: 0 });
    expect(mergeScoutingPerformance(left, right)).toEqual(mergeScoutingPerformance(right, left));
    expect(mergeScoutingPerformance(left, right)).toMatchObject({
      kills: 2,
      damageToChampions: 1000,
      durationMinutes: 10,
      killParticipationPct: 0,
    });
  });

  it("makes conflicting non-null metrics unavailable", () => {
    const left = normalizeScoutingPerformance({ kills: 2, damageToChampions: 1000 });
    const right = normalizeScoutingPerformance({ kills: 3, damageToChampions: 1000 });
    expect(mergeScoutingPerformance(left, right)).toMatchObject({ kills: null, damageToChampions: 1000 });
  });

  it("keeps three-way conflicts unavailable regardless of duplicate order", () => {
    const samples = [
      normalizeScoutingPerformance({ kills: 2 }),
      normalizeScoutingPerformance({ kills: 3 }),
      normalizeScoutingPerformance({ kills: 4 }),
    ];
    const first = createScoutingPerformanceAccumulator();
    const second = createScoutingPerformanceAccumulator();
    for (const performance of samples) first.add({ gameKey: "duplicate", performance });
    for (const performance of [...samples].reverse()) second.add({ gameKey: "duplicate", performance });
    expect(first.result()).toEqual(second.result());
    expect(first.result().kda).toBeNull();
  });

  it("normalizes numeric strings and non-finite inputs", () => {
    expect(normalizeScoutingPerformance({
      kills: "2", deaths: "not-a-number", assists: Infinity, killParticipationPct: "40",
    })).toEqual({
      kills: 2,
      deaths: null,
      assists: null,
      damageToChampions: null,
      durationMinutes: null,
      killParticipationPct: 40,
    });
  });
});
