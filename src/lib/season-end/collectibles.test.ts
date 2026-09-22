import { describe, expect, it } from "vitest";
import { catalogHash, releaseRevisionDigest, seasonEndDesignId, stableJson, validateSeasonEndCatalog, validateSeasonEndCatalogForLock, type SeasonEndCatalog, type SeasonEndCollectible } from "./collectibles";

function design(kind: SeasonEndCollectible["kind"], id: string): SeasonEndCollectible {
  const common = {
    designId: id,
    releaseId: "release-1",
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
  if (kind === "best_of") return { ...common, kind, player: { key: id, name: id, tag: "TAG", slug: id }, champion: { id: "champ", name: "Champion", games: 3, wins: 2, winRate: 66.7 }, signatureEligible: true, source: { kind: "best-of-champion", awardId: id } };
  return { ...common, kind, subject: { kind: "player", player: { key: id, name: id, tag: "TAG", slug: id } }, signatureEligible: false, source: { kind: "season-accolade", awardId: id, scope: "player" } };
}

function catalog(designs: SeasonEndCollectible[]): SeasonEndCatalog {
  return { releaseId: "release-1", league: "premier", season: "S5", schemaVersion: 1, rulesVersion: "test", designs, withheldAwards: [], catalogHash: catalogHash(designs), createdAt: "2026-09-18T00:00:00.000Z" };
}

describe("Season's End collectible catalog", () => {
  it("makes IDs distinguish the release, season, family, award, subject and division", () => {
    const base = { releaseId: "release-1", league: "premier" as const, season: "S5", kind: "accolade" as const, awardId: "award", subjectId: "subject" };
    expect(seasonEndDesignId(base)).not.toBe(seasonEndDesignId({ ...base, division: "Solari" }));
    expect(seasonEndDesignId(base)).not.toBe(seasonEndDesignId({ ...base, subjectId: "other" }));
    expect(seasonEndDesignId({ ...base, subjectId: "A|B" })).not.toBe(seasonEndDesignId({ ...base, subjectId: "A%7CB" }));
  });

  it("rejects an incomplete catalog instead of silently shrinking the pack", () => {
    const result = validateSeasonEndCatalog(catalog([design("season", "s1"), design("best_of", "b1"), design("accolade", "a1")]));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("at least two Season Cards are required");
    expect(result.errors).toContain("at least five unique designs are required");
  });

  it("hashes the ordered payload deterministically", () => {
    const first = catalog([design("season", "s1"), design("season", "s2"), design("best_of", "b1"), design("accolade", "a1"), design("accolade", "a2")]);
    const second = catalog([...first.designs].reverse());
    expect(first.catalogHash).not.toBe(second.catalogHash);
    expect(catalogHash(first.designs.toSorted((a, b) => a.designId.localeCompare(b.designId)))).toBe(catalogHash(first.designs.toSorted((a, b) => a.designId.localeCompare(b.designId))));
  });

  it("does not throw when a database payload is malformed", () => {
    expect(validateSeasonEndCatalog({ releaseId: "release-1", league: "premier", season: "S5", designs: [{ kind: "future" } as never] }).ok).toBe(false);
  });

  it("requires two designs in every family before lock", () => {
    const preview = [design("season", "s1"), design("season", "s2"), design("best_of", "b1"), design("accolade", "a1"), design("accolade", "a2")];
    expect(validateSeasonEndCatalogForLock(catalog(preview)).ok).toBe(false);
    expect(validateSeasonEndCatalogForLock(catalog([...preview, design("best_of", "b2")])).ok).toBe(true);
  });

  it("changes the release digest when frozen rules, economy, or review state changes", () => {
    const value = catalog([design("season", "s1"), design("season", "s2"), design("best_of", "b1"), design("best_of", "b2"), design("accolade", "a1"), design("accolade", "a2")]);
    const base = { catalog: value, rules: { foilChance: 0.04 }, signingBook: [], economy: { version: "v1" }, calibration: { seed: 1 }, reviewDecisions: { art: "approved" } };
    expect(releaseRevisionDigest(base)).not.toBe(releaseRevisionDigest({ ...base, rules: { foilChance: 0.05 } }));
    expect(releaseRevisionDigest(base)).not.toBe(releaseRevisionDigest({ ...base, reviewDecisions: { art: "rejected" } }));
  });

  it("uses JSON-compatible numeric text in the canonical evidence representation", () => {
    expect(stableJson({ x: 1.0, y: 2.5, nested: [0.25, 100_000] })).toBe('{"nested":[0.25,100000],"x":1,"y":2.5}');
    expect(stableJson({ small: 0.00000009999999999, large: 1e21 })).toBe('{"large":1000000000000000000000,"small":0.00000009999999999}');
  });
});
