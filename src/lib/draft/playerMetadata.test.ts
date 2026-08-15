import { describe, expect, it } from "vitest";
import { resolvePlayerRank } from "./playerMetadata";

describe("resolvePlayerRank", () => {
  const canonical = [
    { id: "canonical-1", display_name: "Player One", rank: "Master I" },
    { id: "canonical-2", display_name: "Player Two", rank: "Diamond I" },
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
