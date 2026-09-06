import { describe, expect, it } from "vitest";
import { gradeOf, isSlabbed, slabRefusal, WEAR_GRADES, wearGradeOf, wearOf } from "./wear";

describe("wear grades", () => {
  it("reads five grades off the fielding count, worst last", () => {
    expect(WEAR_GRADES.map((grade) => grade.key)).toEqual(["fn", "mw", "ft", "ww", "bs"]);
    expect(wearGradeOf(0).label).toBe("Factory New");
    expect(wearGradeOf(1).label).toBe("Minimal Wear");
    expect(wearGradeOf(2).label).toBe("Minimal Wear");
    expect(wearGradeOf(3).label).toBe("Field-Tested");
    expect(wearGradeOf(6).label).toBe("Well-Worn");
    expect(wearGradeOf(11).label).toBe("Battle-Scarred");
    expect(wearGradeOf(400).label).toBe("Battle-Scarred");
  });

  it("only marks the card from Well-Worn on", () => {
    expect(WEAR_GRADES.filter((grade) => grade.layer).map((grade) => grade.key)).toEqual(["ww", "bs"]);
  });

  it("reads a missing or broken count as Factory New", () => {
    expect(wearOf({})).toBe(0);
    expect(wearOf({ wear: -3 })).toBe(0);
    expect(wearOf({ wear: 4.7 })).toBe(4);
    expect(wearOf(null)).toBe(0);
  });

  it("shows a slab's frozen grade over the live count", () => {
    expect(gradeOf({ wear: 12, slab: { wear: 2, at: "2026-09-07T00:00:00.000Z" } }).label).toBe("Minimal Wear");
    expect(gradeOf({ wear: 12 }).label).toBe("Battle-Scarred");
    expect(isSlabbed({ slab: { wear: 0, at: "" } })).toBe(true);
    expect(isSlabbed({})).toBe(false);
  });

  it("refuses a fielding in one sentence", () => {
    expect(slabRefusal("Doug")).toContain("Doug is sealed in a slab");
  });
});
