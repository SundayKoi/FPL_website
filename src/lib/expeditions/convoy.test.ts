import { describe, expect, it } from "vitest";
import { convoySheet, convoyVerdict, normaliseConvoyCode } from "./convoy";

const at = "";

describe("convoySheet", () => {
  it("pushes only where both pushed, and keeps my own kind of push", () => {
    const mine = [{ index: 0, choice: "favour" as const, at }, { index: 1, choice: "push" as const, at }, { index: 2, choice: "push" as const, at }];
    const theirs = [{ index: 0, choice: "push" as const, at }, { index: 1, choice: "camp" as const, at }];
    expect(convoySheet(3, mine, theirs)).toEqual(["favour", "camp", "camp"]);
  });

  it("reads a fork nobody answered as silence, and one only one side answered as camp", () => {
    expect(convoySheet(2, [], [])).toEqual([null, null]);
    expect(convoySheet(2, [{ index: 0, choice: "push", at }], [])).toEqual(["camp", null]);
    expect(convoySheet(2, [], [{ index: 1, choice: "rally", at }])).toEqual([null, "camp"]);
  });
});

describe("convoyVerdict", () => {
  it("camps on any camp, pushes on two pushes, waits otherwise", () => {
    expect(convoyVerdict("push", "camp")).toBe("camping");
    expect(convoyVerdict(null, "camp")).toBe("camping");
    expect(convoyVerdict("light", "push")).toBe("pushing");
    expect(convoyVerdict("push", null)).toBe("waiting");
    expect(convoyVerdict(null, null)).toBe("waiting");
  });
});

describe("normaliseConvoyCode", () => {
  it("upper-cases, trims, reads the confusables as the letters the alphabet has, and caps the length", () => {
    expect(normaliseConvoyCode(" ab0i1z-9 ")).toBe("ABOIIZ");
    expect(normaliseConvoyCode("abcdefgh")).toBe("ABCDEF");
  });
});
