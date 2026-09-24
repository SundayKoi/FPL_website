import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { abilitySheet } from "./archetypes";
import { squadMeets, type CardCopy } from "./config";
import { SUGGESTED_ROUTES, bestRoute, cycleByEdges, freeCopies, routeGate, suggestSquad, type RouteContext } from "./suggest";

const NOW = new Date("2026-09-23T16:00:00.000Z");

function copy(id: number, tier: string, extra: Omit<Partial<CardCopy>, "card"> & { archetype?: string; card?: Partial<PlayerCardData> } = {}): CardCopy {
  const { archetype = "Jack of All Trades", card = {}, ...rest } = extra;
  return {
    id,
    season: "S5",
    slug: `p${id}`,
    playerName: `P${id}`,
    role: "Mid",
    editionWeek: "2026-09-21",
    overall: 80,
    tier,
    foil: false,
    foilType: null,
    signed: false,
    card: { name: `P${id}`, archetype, teamName: null, ...card } as PlayerCardData,
    packOpenId: null,
    acquiredAt: "2026-09-21T00:00:00.000Z",
    printNumber: null,
    mutation: null,
    ...rest,
  };
}

function ctx(over: Partial<RouteContext> = {}): RouteContext {
  return { now: NOW, fragments: 0, patron: false, legendMark: true, tiersOut: new Set(), lostCards: 0, ...over };
}

describe("routeGate", () => {
  it("stays idle, not refused, until three cards are picked", () => {
    const gate = routeGate("raid", [copy(1, "gold")], ctx());
    expect(gate.state).toBe("idle");
    expect(gate.short).toBeNull();
    // The card below the pill still hears every reason, verbatim.
    expect(gate.squad).toContain("An expedition takes exactly 3 cards — this squad has 1.");
  });

  it("names the board's reasons before any squad exists", () => {
    expect(routeGate("raid", [], ctx({ tiersOut: new Set(["raid"]) })).short).toBe("out now");
    expect(routeGate("gilded", [], ctx()).short).toBe("patrons only");
    expect(routeGate("legendary", [], ctx({ fragments: 1 })).short).toBe("3 fragments");
    expect(routeGate("rescue", [], ctx()).short).toBe("nothing lost");
    expect(routeGate("mythic", [], ctx({ legendMark: false, fragments: 3 })).short).toBe("Legend mark");
    expect(routeGate("raid", [], ctx({ tiersOut: new Set(["raid"]) })).state).toBe("out");
  });

  it("says in two words what a full squad is short of", () => {
    const matte = [copy(1, "gold"), copy(2, "gold"), copy(3, "gold")];
    expect(routeGate("raid", matte, ctx()).short).toBe("needs 12 power");
    const strong = [copy(1, "challenger"), copy(2, "challenger"), copy(3, "gold")];
    expect(routeGate("raid", strong, ctx()).short).toBe("needs a foil");
    expect(routeGate("scout", strong, ctx()).state).toBe("ready");
    const relic = copy(4, "gold", { foil: true, foilType: "eclipse" });
    expect(routeGate("legend", [relic, ...strong.slice(0, 2)], ctx()).short).toBe("relic aboard");
  });
});

describe("bestRoute", () => {
  it("picks the best-paying route the squad can run, never one that can kill", () => {
    expect(SUGGESTED_ROUTES).not.toContain("legendary");
    expect(SUGGESTED_ROUTES).not.toContain("mythic");
    const raidSquad = [copy(1, "diamond", { foil: true, foilType: "prisma" }), copy(2, "gold"), copy(3, "silver")];
    expect(bestRoute(raidSquad, ctx())).toBe("raid");
    // With that route already out, the next best open route is chosen.
    expect(bestRoute(raidSquad, ctx({ tiersOut: new Set(["raid"]) }))).toBe("scout");
    expect(bestRoute([copy(1, "gold")], ctx())).toBeNull();
  });
});

describe("suggestSquad", () => {
  const shelf = [
    copy(1, "challenger", { foil: true, foilType: "ice", signed: true, archetype: "Unkillable" }),
    copy(2, "diamond", { foil: true, foilType: "prisma", archetype: "Camp Thief" }),
    copy(3, "gold", { archetype: "Camp Thief" }),
    copy(4, "gold", { archetype: "Poke Support" }),
    copy(5, "silver", { archetype: "The Surgeon" }),
    copy(6, "bronze"),
  ];

  it("opens the best route it can with the strongest free cards", () => {
    const first = suggestSquad(shelf, ctx())!;
    expect(first.route).toBe("legend");
    expect(squadMeets("legend", first.squad, NOW).ok).toBe(true);
  });

  it("cycles to squads of three different edge kinds on the next press", () => {
    const first = suggestSquad(shelf, ctx(), 0)!;
    const second = suggestSquad(shelf, ctx(), 1)!;
    expect(second.route).toBe(first.route);
    expect(abilitySheet(second.squad).every((entry) => entry.counts)).toBe(true);
    for (const squad of cycleByEdges(shelf, "legend", ctx())) {
      expect(new Set(abilitySheet(squad).map((entry) => entry.ability.kind)).size).toBe(3);
      expect(squadMeets("legend", squad, NOW).ok).toBe(true);
    }
  });

  it("never suggests a card that is away, lost, sealed or benched", () => {
    const wounded = copy(7, "challenger", { card: { wounded: { until: "2026-09-30T00:00:00.000Z", run: 1 } } });
    const sealed = copy(8, "challenger", { card: { slab: { grade: 10 } } as never });
    const free = freeCopies([...shelf, wounded, sealed], { deployedIds: new Set([1]), lostIds: new Set([2]), now: NOW });
    expect(free.map((entry) => entry.id)).toEqual([3, 4, 5, 6]);
    const suggestion = suggestSquad(free, ctx())!;
    expect(suggestion.squad.map((entry) => entry.id).sort()).toEqual([3, 4, 5]);
    expect(suggestion.route).toBe("scout");
  });

  it("has nothing to suggest with fewer than three free cards", () => {
    expect(suggestSquad(shelf.slice(0, 2), ctx())).toBeNull();
  });
});
