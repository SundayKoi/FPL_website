import { describe, expect, it } from "vitest";
import { editionLabel } from "@/lib/packs/week";
import { copyEditionLabel, RELIC_EDITION_LABEL } from "./copyEdition";

describe("copyEditionLabel", () => {
  it("names a print by its week", () => {
    expect(copyEditionLabel("2026-08-24", {})).toBe(editionLabel("2026-08-24"));
    expect(copyEditionLabel("2026-08-24")).toBe(editionLabel("2026-08-24"));
  });
  it("names a champions relic by the drop, never a week", () => {
    expect(copyEditionLabel("2026-08-24", { champWin: {} as never })).toBe(RELIC_EDITION_LABEL);
  });
  it("takes a plain relic flag from rows that carry no card", () => {
    expect(copyEditionLabel("2026-08-24", true)).toBe(RELIC_EDITION_LABEL);
    expect(copyEditionLabel("2026-08-24", false)).toBe(editionLabel("2026-08-24"));
  });
  it("says nothing for a copy with no week", () => {
    expect(copyEditionLabel(null, {})).toBe("");
  });
});
