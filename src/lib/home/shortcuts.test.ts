import { describe, expect, it } from "vitest";
import { homeShortcuts } from "./shortcuts";

describe("homeShortcuts", () => {
  it("offers nothing to a signed-out visitor", () => {
    expect(homeShortcuts("premier", "signed-out")).toEqual([]);
  });

  it("points a Premium member at today's pack and FPL'dle, in their league", () => {
    expect(homeShortcuts("academy", "premium").map((s) => s.href)).toEqual([
      "/academy/my-team",
      "/academy/schedule",
      "/academy/cards/packs",
      "/academy/fpldle",
    ]);
  });

  it("never offers a member without Premium something they cannot open", () => {
    const links = homeShortcuts("premier", "member");
    expect(links.map((s) => s.href)).toEqual(["/my-team", "/schedule", "/cards/browse", "/membership"]);
    expect(links.filter((s) => s.accent).map((s) => s.href)).toEqual(["/membership"]);
  });
});
