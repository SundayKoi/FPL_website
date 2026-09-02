import { describe, expect, it } from "vitest";
import { resolveThemeLeague } from "./theme";

describe("resolveThemeLeague", () => {
  it("uses Premier for ordinary shared routes", () => {
    expect(resolveThemeLeague("/", "")).toBe("premier");
    expect(resolveThemeLeague("/stats", "tab=Teams")).toBe("premier");
    expect(resolveThemeLeague("/premium", "")).toBe("premier");
  });

  it("uses Academy for all Academy descendants", () => {
    expect(resolveThemeLeague("/academy", "")).toBe("academy");
    expect(resolveThemeLeague("/academy/teams/divine-ascension", "")).toBe("academy");
  });

  it("allows Academy to select the shared Premium HQ theme", () => {
    expect(resolveThemeLeague("/premium", "league=academy")).toBe("academy");
    expect(resolveThemeLeague("/premium", "?league=academy")).toBe("academy");
  });

  it("ignores the Premium query override on other routes", () => {
    expect(resolveThemeLeague("/stats", "league=academy")).toBe("premier");
    expect(resolveThemeLeague("/academy/stats", "league=premier")).toBe("academy");
  });
});
