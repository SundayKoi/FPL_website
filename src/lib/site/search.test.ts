import { describe, expect, it } from "vitest";
import { normalizeQuery, rankSearch, type SearchItem } from "./search";

const ITEMS: SearchItem[] = [
  { kind: "page", label: "Stats", href: "/stats", hint: "League" },
  { kind: "page", label: "Pack stats", href: "/cards/stats", hint: "Cards" },
  { kind: "page", label: "The Vault", href: "/cards/vault", hint: "Cards", keywords: ["eclipse", "one of one"] },
  { kind: "page", label: "Patrons", href: "/supporters", hint: "Info", keywords: ["flame holders", "supporters"] },
  { kind: "player", label: "Doug", href: "/players/Doug%23NA1", hint: "#NA1" },
  { kind: "player", label: "Douglas", href: "/players/Douglas%23EUW", hint: "Player" },
  { kind: "team", label: "Neon Dynasty", href: "/teams/neon-dynasty", hint: "Team" },
  { kind: "player", label: "Ñandú", href: "/players/%C3%91and%C3%BA%23X", hint: "Player" },
];

describe("normalizeQuery", () => {
  it("lowercases, strips accents and turns a Riot id into words", () => {
    expect(normalizeQuery("  Doug#NA1 ")).toBe("doug na1");
    expect(normalizeQuery("Ñandú")).toBe("nandu");
  });
});

describe("rankSearch", () => {
  it("returns nothing for an empty query", () => {
    expect(rankSearch("   ", ITEMS)).toEqual([]);
  });

  it("puts the exact name first and its longer cousins after", () => {
    expect(rankSearch("stats", ITEMS).map((item) => item.label)).toEqual(["Stats", "Pack stats"]);
    expect(rankSearch("doug", ITEMS).map((item) => item.label)).toEqual(["Doug", "Douglas"]);
  });

  it("finds a page by what people call it", () => {
    expect(rankSearch("supporters", ITEMS)[0]?.label).toBe("Patrons");
    expect(rankSearch("eclipse", ITEMS)[0]?.label).toBe("The Vault");
  });

  it("matches a pasted Riot id and an accented name typed plain", () => {
    expect(rankSearch("Doug#NA1", ITEMS)[0]?.label).toBe("Doug");
    expect(rankSearch("nandu", ITEMS)[0]?.label).toBe("Ñandú");
  });

  it("needs every word to match somewhere", () => {
    expect(rankSearch("neon dynasty", ITEMS).map((item) => item.label)).toEqual(["Neon Dynasty"]);
    expect(rankSearch("neon vault", ITEMS)).toEqual([]);
  });

  it("caps the list", () => {
    expect(rankSearch("a", ITEMS, 2)).toHaveLength(2);
  });
});
