import { describe, expect, it } from "vitest";
import { ALL_WEEKS, weeksToArchive } from "./editions";

const CURRENT = "2026-08-24";
const ARCHIVED = ["2026-08-17", "2026-08-10"];

describe("weeksToArchive", () => {
  it("archives just the current week when nothing was asked for", () => {
    expect(weeksToArchive("", ARCHIVED, CURRENT)).toEqual([CURRENT]);
  });

  it("archives exactly the week that was asked for", () => {
    expect(weeksToArchive("2026-07-06", ARCHIVED, CURRENT)).toEqual(["2026-07-06"]);
  });

  it("rebuilds every archived week on 'all'", () => {
    expect(weeksToArchive(ALL_WEEKS, ARCHIVED, CURRENT)).toContain("2026-08-10");
  });

  it("includes the current week even when it was never archived", () => {
    // The pack shop offers the newest ARCHIVED week by default. Rebuilding
    // the back catalogue while leaving that one out would fix every
    // edition except the one most people are actually buying.
    expect(weeksToArchive(ALL_WEEKS, ARCHIVED, CURRENT)).toContain(CURRENT);
  });

  it("does not queue the current week twice when it is already archived", () => {
    const weeks = weeksToArchive(ALL_WEEKS, [CURRENT, ...ARCHIVED], CURRENT);
    expect(weeks.filter((week) => week === CURRENT)).toHaveLength(1);
  });

  it("returns weeks newest first", () => {
    expect(weeksToArchive(ALL_WEEKS, ["2026-08-10", "2026-08-17"], CURRENT)).toEqual([
      "2026-08-24",
      "2026-08-17",
      "2026-08-10",
    ]);
  });

  it("still archives the current week on 'all' with an empty archive", () => {
    expect(weeksToArchive(ALL_WEEKS, [], CURRENT)).toEqual([CURRENT]);
  });
});
