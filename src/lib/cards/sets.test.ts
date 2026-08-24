import { describe, expect, it } from "vitest";
import { buildTeamSets, completedSetCount } from "./sets";
import type { PlayerCardData } from "./build";

function card(slug: string, teamName: string | null, overall = 70, teamImageUrl: string | null = null): PlayerCardData {
  return { slug, name: slug, teamName, overall, teamImageUrl, role: "Mid" } as PlayerCardData;
}

describe("buildTeamSets", () => {
  it("counts owned members against the team's current roster", () => {
    const sets = buildTeamSets(
      [card("a", "Wolves"), card("b", "Wolves"), card("c", "Bears")],
      ["a"],
    );
    const wolves = sets.find((set) => set.teamName === "Wolves");
    expect(wolves?.ownedCount).toBe(1);
    expect(wolves?.members).toHaveLength(2);
    expect(wolves?.complete).toBe(false);
  });

  it("marks a set complete only when every member is owned", () => {
    const sets = buildTeamSets([card("a", "Wolves"), card("b", "Wolves")], ["a", "b"]);
    expect(sets[0].complete).toBe(true);
    expect(completedSetCount(sets)).toBe(1);
  });

  it("ignores players with no team", () => {
    expect(buildTeamSets([card("a", null)], [])).toHaveLength(0);
  });

  it("orders completed sets first, then by fewest cards remaining", () => {
    const cards = [
      card("a", "Done"),
      card("b", "Far"),
      card("c", "Far"),
      card("d", "Far"),
      card("e", "Close"),
      card("f", "Close"),
    ];
    const sets = buildTeamSets(cards, ["a", "e"]);
    expect(sets.map((set) => set.teamName)).toEqual(["Done", "Close", "Far"]);
  });

  it("takes the crest from whichever member carries one", () => {
    const sets = buildTeamSets([card("a", "Wolves", 70, null), card("b", "Wolves", 60, "crest.png")], []);
    expect(sets[0].imageUrl).toBe("crest.png");
  });

  it("accepts a Set of owned slugs as readily as an array", () => {
    const sets = buildTeamSets([card("a", "Wolves")], new Set(["a"]));
    expect(sets[0].complete).toBe(true);
  });
});
