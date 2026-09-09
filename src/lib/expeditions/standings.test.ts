import { describe, expect, it } from "vitest";
import { ACCOLADES, ACCOLADE_ORDER, accoladeLine, accoladesOf, leaderOf, rankStandings, type StandingRow } from "./standings";

const row = (over: Partial<StandingRow> & { discordId: string }): StandingRow => ({
  username: over.discordId,
  avatarUrl: null,
  runs: 1,
  miles: 0,
  loot: 0,
  survivals: 0,
  rivalsBeaten: 0,
  ...over,
});

describe("season standings", () => {
  const rows = [
    row({ discordId: "bo", miles: 6, loot: 1200, survivals: 0 }),
    row({ discordId: "ann", miles: 6, loot: 900, survivals: 1, rivalsBeaten: 1 }),
    row({ discordId: "cy", miles: 9, loot: 300 }),
    row({ discordId: "di", miles: 0, loot: 0 }),
  ];

  it("ranks by miles, then loot, then homecomings, then the name", () => {
    expect(rankStandings(rows).map((entry) => entry.discordId)).toEqual(["cy", "bo", "ann", "di"]);
    const level = [row({ discordId: "b", miles: 2, loot: 5 }), row({ discordId: "a", miles: 2, loot: 5 })];
    expect(rankStandings(level).map((entry) => entry.discordId)).toEqual(["a", "b"]);
    expect(rankStandings(rows)).not.toBe(rows);
  });

  it("previews each mark the way the close awards it: top of the standing, above zero, ties to the lower id", () => {
    expect(leaderOf(rows, "pathfinder")?.discordId).toBe("cy");
    expect(leaderOf(rows, "plunderer")?.discordId).toBe("bo");
    expect(leaderOf(rows, "survivor")?.discordId).toBe("ann");
    expect(leaderOf([row({ discordId: "z", miles: 0 })], "pathfinder")).toBeNull();
    const tied = [row({ discordId: "zed", miles: 4 }), row({ discordId: "abe", miles: 4 })];
    expect(leaderOf(tied, "pathfinder")?.discordId).toBe("abe");
  });

  it("names a mark and its number in one line", () => {
    expect(accoladeLine({ kind: "pathfinder", username: "Ann", value: 42 })).toBe("⟟ Pathfinder — Ann, 42 miles");
    expect(accoladeLine({ kind: "pathfinder", username: "Ann", value: 1 })).toBe("⟟ Pathfinder — Ann, 1 mile");
    expect(accoladeLine({ kind: "plunderer", username: "Bo", value: 12500 })).toBe("◈ Plunderer — Bo, $12,500");
    expect(accoladeLine({ kind: "survivor", username: "Cy", value: 2 })).toBe("✧ Survivor — Cy, 2 homecomings");
  });

  it("lists a collector's marks in award order", () => {
    const held = [
      { kind: "survivor" as const, discordId: "ann", username: "Ann", value: 1, awardedAt: "2026-09-09T00:00:00Z" },
      { kind: "pathfinder" as const, discordId: "ann", username: "Ann", value: 6, awardedAt: "2026-09-09T00:00:00Z" },
      { kind: "plunderer" as const, discordId: "bo", username: "Bo", value: 1200, awardedAt: "2026-09-09T00:00:00Z" },
    ];
    expect(accoladesOf(held, "ann").map((def) => def.key)).toEqual(["pathfinder", "survivor"]);
    expect(accoladesOf(held, "cy")).toEqual([]);
    expect(ACCOLADE_ORDER.map((kind) => ACCOLADES[kind].stat)).toEqual(["miles", "loot", "survivals"]);
  });
});
