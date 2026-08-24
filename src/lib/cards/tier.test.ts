import { describe, expect, it } from "vitest";
import { tierLabel } from "./tier";

describe("tierLabel", () => {
  it("capitalizes the tier key", () => {
    expect(tierLabel("challenger")).toBe("Challenger");
  });

  it("falls back to a dash for a missing tier", () => {
    expect(tierLabel("")).toBe("—");
  });
});
