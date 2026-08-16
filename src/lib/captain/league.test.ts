import { describe, expect, it } from "vitest";
import { draftSettingColumn, leagueLabel, normalizeLeague } from "./league";

describe("captain league helpers", () => {
  it("defaults missing and invalid values to Premier", () => {
    expect(normalizeLeague(undefined)).toBe("premier");
    expect(normalizeLeague("club")).toBe("premier");
    expect(normalizeLeague(["academy", "premier"])).toBe("premier");
  });

  it("selects Academy only for the exact scalar value", () => {
    expect(normalizeLeague("academy")).toBe("academy");
    expect(leagueLabel("academy")).toBe("Academy");
    expect(draftSettingColumn("academy")).toBe("academy_draft_id");
    expect(draftSettingColumn("premier")).toBe("featured_draft_id");
  });
});
