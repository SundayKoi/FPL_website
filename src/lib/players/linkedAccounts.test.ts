import { describe, expect, it } from "vitest";
import { linkedAccountLabel, linkedAccountUrls, primaryLinkedAccountUrl } from "./linkedAccounts";

describe("linkedAccountUrls", () => {
  it("matches names case-insensitively and ignores Riot tags", () => {
    expect(linkedAccountUrls("winter").length).toBe(1);
    expect(linkedAccountUrls("WINTER#Ashtn").length).toBe(1);
    expect(linkedAccountUrls("  SlimPimpin77 ")[0]).toContain("SlimPimpin77-epic");
  });

  it("follows the shared alias table (08 Mitsu Eclipse = Chime)", () => {
    expect(linkedAccountUrls("Chime").length).toBe(1);
    expect(linkedAccountUrls("08 Mitsu Eclipse")).toEqual(linkedAccountUrls("Chime"));
  });

  it("handles the Greek final-sigma lowercase quirk", () => {
    expect(linkedAccountUrls("ΣΠΑΡΤΙΑΤΗΣ").length).toBe(1);
  });

  it("returns every account for multi-link players, empty for unknowns", () => {
    expect(linkedAccountUrls("Pr1mus").length).toBe(2);
    expect(linkedAccountUrls("Nobody Real")).toEqual([]);
    expect(primaryLinkedAccountUrl("Nobody Real")).toBeNull();
  });
});

describe("linkedAccountLabel", () => {
  it("labels multisearches and numbered extra accounts", () => {
    expect(linkedAccountLabel("https://op.gg/lol/multisearch/na?summoners=x", 0)).toBe("OP.GG · all accounts");
    expect(linkedAccountLabel("https://op.gg/lol/summoners/na/X-NA1", 0)).toBe("OP.GG");
    expect(linkedAccountLabel("https://op.gg/lol/summoners/na/Y-NA1", 1)).toBe("OP.GG · account 2");
  });
});
