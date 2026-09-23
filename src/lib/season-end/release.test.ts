import { describe, expect, it } from "vitest";
import { buildSeasonEndSigningBook, SEASON_END_ECONOMY, validateSeasonEndEconomy, validateSeasonEndReleaseRules } from "./release";
import { releaseRevisionDigest, type SeasonEndCatalog, type SeasonEndCollectible } from "./collectibles";

function playerDesign(kind: "season" | "best_of", id: string, playerKey: string): SeasonEndCollectible {
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
    baseSalvage: 20,
  };
  if (kind === "season") {
    return { ...common, kind, player: { key: playerKey, name: playerKey, tag: "TAG", slug: playerKey }, card: {} as never, signatureEligible: true, source: { kind: "cumulative-season-card", games: 6 } };
  }
  return { ...common, kind, player: { key: playerKey, name: playerKey, tag: "TAG", slug: playerKey }, champion: { id, name: id, games: 3, wins: 2, winRate: 66 }, signatureEligible: true, source: { kind: "best-of-champion", awardId: id } };
}

describe("Season's End release contracts", () => {
  it("rejects malformed persisted rules without throwing", () => {
    expect(validateSeasonEndReleaseRules(null as never)).toContain("Season's End rules must be an object");
    expect(validateSeasonEndReleaseRules({ foilChance: Number.NaN } as never).length).toBeGreaterThan(0);
  });

  it("rejects malformed economy payloads without throwing", () => {
    expect(validateSeasonEndEconomy(null as never)).toContain("Season's End economy must be an object");
    expect(validateSeasonEndEconomy({ version: "wrong" } as never).length).toBeGreaterThan(0);
    expect(validateSeasonEndEconomy(SEASON_END_ECONOMY)).toEqual([]);
    expect(validateSeasonEndEconomy({ ...SEASON_END_ECONOMY, version: "season-end-economy-2026-09-v1", signatureBonus: 1200 })).toEqual([]);
  });

  it("deduplicates the signing book by canonical player identity", () => {
    const catalog = { designs: [playerDesign("season", "season-1", "player"), playerDesign("best_of", "best-1", "player")] };
    expect(buildSeasonEndSigningBook(catalog, new Map([["player", "sig"]]))).toEqual({
      entries: [{ playerKey: "player", autograph: "sig" }],
      errors: [],
    });
  });

  it("keeps the release revision stable when only the read-time timestamp changes", () => {
    const catalog = {
      releaseId: "release",
      league: "premier" as const,
      season: "S5",
      schemaVersion: 1 as const,
      rulesVersion: "rules",
      designs: [playerDesign("season", "season-1", "player")],
      withheldAwards: [],
    } satisfies Pick<SeasonEndCatalog, "releaseId" | "league" | "season" | "schemaVersion" | "rulesVersion" | "designs" | "withheldAwards">;
    const input = { catalog, rules: { foilChance: 0 }, signingBook: [], economy: { version: "economy" }, calibration: { seed: 1 } };
    expect(releaseRevisionDigest(input)).toBe(releaseRevisionDigest({ ...input, catalog: { ...catalog } }));
  });
});
