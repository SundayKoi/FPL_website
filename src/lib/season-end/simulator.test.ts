import { describe, expect, it } from "vitest";
import { catalogHash, type SeasonEndCatalog, type SeasonEndCollectible } from "./collectibles";
import { DEFAULT_SEASON_END_RULES } from "@/lib/packs/season-end";
import { simulateSeasonEnd } from "./simulator";

function design(kind: SeasonEndCollectible["kind"], id: string): SeasonEndCollectible {
  const common = {
    designId: id,
    releaseId: "release",
    league: "premier" as const,
    season: "S5",
    division: null,
    schemaVersion: 1 as const,
    artwork: { kind: "fallback" as const, label: id },
    display: { title: id, subtitle: kind, description: id, headline: id, evidence: id },
    evidence: {},
    baseSalvage: kind === "season" ? 20 : 30,
  };
  if (kind === "season") return { ...common, kind, player: { key: id, name: id, tag: "TAG", slug: id }, card: {} as never, signatureEligible: true, source: { kind: "cumulative-season-card", games: 6 } };
  if (kind === "best_of") return { ...common, kind, player: { key: id, name: id, tag: "TAG", slug: id }, champion: { id, name: id, games: 3, wins: 2, winRate: 66 }, signatureEligible: true, source: { kind: "best-of-champion", awardId: id } };
  return { ...common, kind, subject: { kind: "team", team: { key: id, name: id } }, signatureEligible: false, source: { kind: "season-accolade", awardId: id, scope: "team" } };
}

function catalog(): SeasonEndCatalog {
  const designs = [design("season", "s1"), design("season", "s2"), design("best_of", "b1"), design("accolade", "a1"), design("accolade", "a2")];
  return { releaseId: "release", league: "premier", season: "S5", schemaVersion: 1, rulesVersion: "test", designs, withheldAwards: [], catalogHash: catalogHash(designs), createdAt: "2026-09-18T00:00:00.000Z" };
}

describe("Season's End simulator", () => {
  it("reports supply, guaranteed foil, and signature-family outcomes", () => {
    const report = simulateSeasonEnd(catalog(), {
      openings: 1000,
      seed: 42,
      rules: { ...DEFAULT_SEASON_END_RULES, foilChance: 0, signatureChance: 0.05 },
      signaturesByPlayerKey: new Map([["s1", "sig"], ["b1", "sig"]]),
      collectorTrajectories: 25,
    });
    expect(report.supply).toHaveLength(3);
    expect(report.supply[0].family.season + report.supply[0].family.accolade + report.supply[0].family.best_of).toBe(500);
    expect(report.guaranteedFoilProbability).toBe(0.2);
    expect(report.guaranteedSlotFoilRate).toBe(1);
    expect(report.completion.every((entry) => entry.trajectories === 25)).toBe(true);
    expect(report.signaturesByFamily.accolade).toBe(0);
    expect(report.expectedDust).toBeGreaterThan(0);
  });

  it("rounds patron salvage after applying the patron multiplier", () => {
    const unitSalvageCatalog = { ...catalog(), designs: catalog().designs.map((design) => ({ ...design, baseSalvage: 1 })) };
    const report = simulateSeasonEnd(unitSalvageCatalog, {
      openings: 100,
      seed: 42,
      patron: true,
      rules: { ...DEFAULT_SEASON_END_RULES, foilChance: 0, signatureChance: 0 },
      economy: {
        version: "season-end-economy-2026-09-v1",
        patronMultiplier: 1.5,
        signatureBonus: 0,
        foilDustMultipliers: { prisma: 1, aurora: 1, refractor: 1, ice: 1 },
        baseSalvageByKind: { season: 1, best_of: 1, accolade: 1 },
      },
    });
    expect(report.expectedDust).toBe(10);
    expect(report.conservativeSalvageUpperBound).toBe(10);
  }, 20_000); // ~5.4s on the CI runner against a 5s default — timed out on develop too.
});
