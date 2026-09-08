import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, formatLaneDiff, formatValue } from "./format";

describe("formatDuration", () => {
  it("reads fractional minutes as m:ss", () => {
    expect(formatDuration(31.5)).toBe("31:30");
    expect(formatDuration(7)).toBe("7:00");
  });
});

describe("formatDate", () => {
  it("echoes input it cannot parse rather than printing 'Invalid Date'", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("formatValue", () => {
  it("caps at two fraction digits", () => {
    expect(formatValue(1.23456)).toBe("1.23");
  });
});

describe("formatLaneDiff", () => {
  it("signs the number the way a player would say it", () => {
    expect(formatLaneDiff(14, 1)).toBe("+14.0");
    expect(formatLaneDiff(-3.25, 1)).toBe("-3.3");
    expect(formatLaneDiff(0, 1)).toBe("0.0");
  });

  it("rounds gold and XP to whole numbers with separators", () => {
    expect(formatLaneDiff(1234.6, 0)).toBe("+1,235");
    expect(formatLaneDiff(-1234.6, 0)).toBe("-1,235");
  });

  it("says nothing rather than zero when the mark was never measured", () => {
    // The distinction the whole laning block rests on: a lane nobody
    // measured is not a lane that finished even.
    expect(formatLaneDiff(null, 1)).toBe("—");
    expect(formatLaneDiff(undefined, 0)).toBe("—");
    expect(formatLaneDiff(Number.NaN, 0)).toBe("—");
  });
});
