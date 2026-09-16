import { describe, expect, it } from "vitest";
import { editionLabel } from "@/lib/packs/week";
import { sendoffEditionLabel } from "./sendoff";
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
  it("names a send-off print by its stamp, not by the Monday it fell on", () => {
    // "Aug 31 edition" says nothing about a card whose whole point is how
    // far that player's team got.
    const sendoff = { stage: "champion", exit: "finals", team: "Storm", series: "3–1", week: "2026-08-31" } as const;
    expect(copyEditionLabel("2026-08-31", { sendoff })).toBe(sendoffEditionLabel("champion"));
  });
  it("still calls a relic a relic", () => {
    expect(copyEditionLabel("2026-08-24", { champWin: {} as never, sendoff: null })).toBe(RELIC_EDITION_LABEL);
  });
  it("says nothing for a copy with no week", () => {
    expect(copyEditionLabel(null, {})).toBe("");
  });
});
