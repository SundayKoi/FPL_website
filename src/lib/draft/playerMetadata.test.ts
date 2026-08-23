import { describe, expect, it } from "vitest";
import { comparePlayerRanks, resolvePlayerOpggUrl, resolvePlayerRank } from "./playerMetadata";

describe("comparePlayerRanks", () => {
  it.each([
    ["M10", "D1", "master before diamond"],
    ["D2", "E1", "diamond before emerald"],
    ["D1", "D2", "lower division first within a tier"],
  ])("sorts %s before %s (%s)", (left, right) => {
    expect(comparePlayerRanks(left, right)).toBeLessThan(0);
  });

  it("puts null or malformed ranks after known ranks", () => {
    expect(comparePlayerRanks("M1", null)).toBeLessThan(0);
    expect(comparePlayerRanks(null, "M1")).toBeGreaterThan(0);
    expect(comparePlayerRanks("M1", "broken")).toBeLessThan(0);
  });

  it("returns zero for equal ranks", () => {
    expect(comparePlayerRanks("D3", "D3")).toBe(0);
  });
});

describe("resolvePlayerRank", () => {
  const canonical = [
    { id: "canonical-1", display_name: "Player One", rank: "Master I", opgg_url: "https://op.gg/one" },
    { id: "canonical-2", display_name: "Player Two", rank: "Diamond I", opgg_url: "https://op.gg/two" },
  ];

  it("keeps a rank already stored on the draft player", () => {
    expect(resolvePlayerRank({ rank: "Grandmaster I", canonical_player_id: "canonical-1", display_name: "Player One" }, canonical)).toBe("Grandmaster I");
  });

  it("falls back to the canonical id when the draft rank is blank", () => {
    expect(resolvePlayerRank({ rank: null, canonical_player_id: "canonical-1", display_name: "Different label" }, canonical)).toBe("Master I");
  });

  it("falls back to a normalized display name for older draft rows", () => {
    expect(resolvePlayerRank({ rank: null, canonical_player_id: null, display_name: "  PLAYER   TWO " }, canonical)).toBe("Diamond I");
  });

  it("returns null when no canonical player matches", () => {
    expect(resolvePlayerRank({ rank: null, canonical_player_id: null, display_name: "Unknown" }, canonical)).toBeNull();
  });
});

describe("resolvePlayerOpggUrl", () => {
  const canonical = [
    { id: "canonical-1", display_name: "Player One", rank: "Master I", opgg_url: "https://op.gg/one" },
    { id: "canonical-2", display_name: "Player Two", rank: "Diamond I", opgg_url: "https://op.gg/two" },
  ];

  it("keeps an OP.GG URL already stored on the draft player", () => {
    expect(
      resolvePlayerOpggUrl(
        { opgg_url: "https://op.gg/draft", canonical_player_id: "canonical-1", display_name: "Player One" },
        canonical,
      ),
    ).toBe("https://op.gg/draft");
  });

  it("falls back to canonical id and then normalized display name", () => {
    expect(
      resolvePlayerOpggUrl(
        { opgg_url: null, canonical_player_id: "canonical-1", display_name: "Different label" },
        canonical,
      ),
    ).toBe("https://op.gg/one");
    expect(
      resolvePlayerOpggUrl(
        { opgg_url: null, canonical_player_id: null, display_name: "  PLAYER   TWO " },
        canonical,
      ),
    ).toBe("https://op.gg/two");
  });
});
