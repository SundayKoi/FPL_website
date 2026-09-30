import { describe, expect, it } from "vitest";
import { draftGameParam, draftLayoutParam } from "./params";

describe("draftGameParam", () => {
  it("keeps a game number inside the series", () => {
    expect(draftGameParam("2", 3)).toBe(2);
    expect(draftGameParam("5", 3)).toBe(3);
  });

  it("falls back to game 1 for missing or malformed values", () => {
    expect(draftGameParam(undefined, 3)).toBe(1);
    expect(draftGameParam("0", 3)).toBe(1);
    expect(draftGameParam("1.5", 3)).toBe(1);
    expect(draftGameParam("two", 3)).toBe(1);
  });
});

describe("draftLayoutParam", () => {
  it("accepts only the two layouts", () => {
    expect(draftLayoutParam("board")).toBe("board");
    expect(draftLayoutParam("stage")).toBe("stage");
    expect(draftLayoutParam("grid")).toBeNull();
    expect(draftLayoutParam(undefined)).toBeNull();
  });
});
