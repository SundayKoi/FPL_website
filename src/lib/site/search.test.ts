import { describe, expect, it } from "vitest";
import { normalizeQuery, createSearch, type SearchItem } from "./search";

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

describe("createSearch", () => {
  const search = createSearch(ITEMS);
  it("returns nothing for an empty query", () => {
    expect(search("   ")).toEqual([]);
  });

  it("puts the exact name first and its longer cousins after", () => {
    expect(search("stats").map((item) => item.label)).toEqual(["Stats", "Pack stats"]);
    expect(search("doug").map((item) => item.label)).toEqual(["Doug", "Douglas"]);
  });

  it("finds a page by what people call it", () => {
    expect(search("supporters")[0]?.label).toBe("Patrons");
    expect(search("eclipse")[0]?.label).toBe("The Vault");
  });

  it("matches a pasted Riot id and an accented name typed plain", () => {
    expect(search("Doug#NA1")[0]?.label).toBe("Doug");
    expect(search("nandu")[0]?.label).toBe("Ñandú");
  });

  it("needs every word to match somewhere", () => {
    expect(search("neon dynasty").map((item) => item.label)).toEqual(["Neon Dynasty"]);
    expect(search("neon vault")).toEqual([]);
  });

  it("caps the list", () => {
    expect(search("a", 2)).toHaveLength(2);
  });
});
