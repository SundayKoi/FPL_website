import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { rollGodPack } from "./god";

function card(slug: string, tier: PlayerCardData["tier"]["key"], overall: number): PlayerCardData {
  return {
    slug,
    name: slug,
    tag: "NA1",
    teamName: "Fixture",
    teamImageUrl: null,
    role: "Mid",
    overall,
    tier: { key: tier, label: tier },
    archetype: "Playmaker",
    signature: { champion: "Ahri", games: 10 },
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 0,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 0,
    losses: 0,
    winratePct: 0,
    level: 0,
    pentas: 0,
    season: "S5",
  };
}

const pool = [
  card("epic-a", "diamond", 84),
  card("epic-b", "diamond", 85),
  card("epic-c", "diamond", 86),
  card("legend-a", "master", 90),
  card("legend-b", "challenger", 95),
  card("rare-a", "emerald", 80),
];

describe("rollGodPack", () => {
  it("uses premium finishes, reserves the signed finale, and preserves reveal order", () => {
    const pulls = rollGodPack(pool, new Map([["legend-b", "ink"]]), () => 0.1);

    expect(pulls).toHaveLength(5);
    expect(pulls.map((pull) => pull.foilType)).toEqual(["prisma", "aurora", "refractor", "ice", "refractor"]);
    expect(pulls[3].card.tier.key).toBe("master");
    expect(pulls[4]).toMatchObject({ signed: true, autograph: "ink", card: { slug: "legend-b", autograph: "ink" } });
    expect(new Set(pulls.map((pull) => pull.card.slug)).size).toBe(5);
  });

  it("falls back honestly in an edition with no legendary players or signatures", () => {
    const pulls = rollGodPack(
      [card("a", "gold", 62), card("b", "platinum", 78), card("c", "emerald", 80)],
      new Map(),
      () => 0.9,
    );

    expect(pulls).toHaveLength(5);
    expect(pulls[3].foilType).toBe("ice");
    expect(pulls[4]).toMatchObject({ foilType: "ice", signed: false, autograph: null });
    expect(pulls.some((pull) => pull.card.tier.key === "master" || pull.card.tier.key === "challenger")).toBe(false);
    expect(new Set(pulls.map((pull) => pull.card.slug)).size).toBe(3);
  });

  it("allows duplicates only when the whole eligible pool is smaller than five", () => {
    const pulls = rollGodPack([card("only", "gold", 62)], new Map(), () => 0.1);
    expect(pulls).toHaveLength(5);
    expect(new Set(pulls.map((pull) => pull.card.slug))).toEqual(new Set(["only"]));
  });
});
