import { describe, expect, it } from "vitest";
import { catalogHash, type SeasonEndCatalog, type SeasonEndCollectible } from "@/lib/season-end/collectibles";
import { applySeasonEndAutographs, calibrateSeasonEndSignatures, rollSeasonEndPack } from "./season-end";

function item(kind: SeasonEndCollectible["kind"], id: string): SeasonEndCollectible {
  const common = { designId: id, releaseId: "r", league: "premier" as const, season: "S5", division: null, schemaVersion: 1 as const, artwork: { kind: "fallback" as const, label: id }, display: { title: id, subtitle: kind, description: id, headline: id, evidence: id }, evidence: {}, baseSalvage: kind === "season" ? 20 : 30 };
  if (kind === "season") return { ...common, kind, player: { key: id, name: id, tag: "TAG", slug: id }, card: {} as never, signatureEligible: true, source: { kind: "cumulative-season-card", games: 6 } };
  if (kind === "best_of") return { ...common, kind, player: { key: id, name: id, tag: "TAG", slug: id }, champion: { id: id, name: id, games: 3, wins: 2, winRate: 66 }, signatureEligible: true, source: { kind: "best-of-champion", awardId: id } };
  return { ...common, kind, subject: { kind: "team", team: { key: id, name: id } }, signatureEligible: false, source: { kind: "season-accolade", awardId: id, scope: "team" } };
}

function testCatalog(): SeasonEndCatalog {
  const designs = [item("season", "s1"), item("season", "s2"), item("accolade", "a1"), item("accolade", "a2"), item("best_of", "b1"), item("best_of", "b2")];
  return { releaseId: "r", league: "premier", season: "S5", schemaVersion: 1, rulesVersion: "test", designs, withheldAwards: [], catalogHash: catalogHash(designs), createdAt: "2026-09-18T00:00:00.000Z" };
}

describe("Season's End roller", () => {
  it("rolls 2+2+1 with distinct designs and a last-slot foil", () => {
    const pulls = rollSeasonEndPack(testCatalog(), () => 0, new Map([["s1", "sig"]]), { foilChance: 0, slot34FamilyWeights: { accolade: 100, best_of: 0 }, slot5FamilyWeights: { season: 100, accolade: 0, best_of: 0 }, guaranteedSlot: 5, signatureChance: 1, signatureChanceCap: 0.05, foilTypeWeights: { prisma: 70, aurora: 20, refractor: 8, ice: 2 } });
    expect(pulls).toHaveLength(5);
    expect(pulls.slice(0, 2).every((pull) => pull.design.kind === "season")).toBe(true);
    expect(pulls.slice(2, 4).every((pull) => pull.design.kind === "accolade" || pull.design.kind === "best_of")).toBe(true);
    expect(new Set(pulls.map((pull) => pull.design.designId)).size).toBe(5);
    expect(pulls[4].guaranteedFoil).toBe(true);
    expect(pulls[4].foil).toBe(true);
    expect(pulls.some((pull) => pull.design.kind === "accolade" && pull.signed)).toBe(false);
  });

  it("promotes a signed matte player copy to Prisma without signing accolades", () => {
    const pulls = applySeasonEndAutographs([
      { design: item("season", "s1"), foil: false, foilType: null, guaranteedFoil: false },
      { design: item("accolade", "a1"), foil: false, foilType: null, guaranteedFoil: false },
    ], new Map([["s1", "data:image/png;base64,sig"]]), () => 0, 1);
    expect(pulls[0]).toMatchObject({ signed: true, foil: true, foilType: "prisma" });
    expect(pulls[1]).toMatchObject({ signed: false, autograph: null });
  });

  it("solves per-copy chance against the pack-level target and reports a cap shortfall", () => {
    const exact = calibrateSeasonEndSignatures({ referencePackProbability: 0.05, signableCopyDistribution: new Map([[2, 1]]) });
    expect(exact.capped).toBe(false);
    expect(exact.achievablePackProbability).toBeCloseTo(0.05, 8);
    const capped = calibrateSeasonEndSignatures({ referencePackProbability: 0.5, signableCopyDistribution: new Map([[1, 1]]), maxPerCopy: 0.05 });
    expect(capped.capped).toBe(true);
    expect(capped.shortfall).toBeCloseTo(0.45, 8);
  });
});
