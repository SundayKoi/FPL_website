import { describe, expect, it } from "vitest";
import { legacyGlossaryDestination } from "./LegacyGlossaryRedirect";

describe("legacy glossary fragments", () => {
  it("preserves glossary anchors and disambiguates the colliding dust anchor", () => {
    expect(legacyGlossaryDestination("")).toBe("/economy");
    expect(legacyGlossaryDestination("shine")).toBe("/economy#shine");
    expect(legacyGlossaryDestination("dust")).toBe("/economy#term-dust");
  });
});
