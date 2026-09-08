import { describe, expect, it } from "vitest";
import {
  overtimeSecondsForDeadline,
  signedSecondsRemaining,
  turnAllowanceSeconds,
  turnDeadlineAt,
} from "./timing";

describe("match draft timing", () => {
  it("crosses zero with signed values", () => {
    const deadline = "2026-09-08T12:00:30.000Z";

    expect(signedSecondsRemaining(deadline, Date.parse("2026-09-08T12:00:30.000Z"))).toBe(0);
    expect(signedSecondsRemaining(deadline, Date.parse("2026-09-08T12:00:31.001Z"))).toBe(-1);
    expect(overtimeSecondsForDeadline(deadline, Date.parse("2026-09-08T12:00:38.500Z"))).toBe(8);
  });

  it("deducts overtime only from the same side's next pick", () => {
    expect(turnAllowanceSeconds("pick", "blue", { blue: 8, red: 0 })).toBe(22);
    expect(turnAllowanceSeconds("pick", "red", { blue: 8, red: 0 })).toBe(30);
    expect(turnAllowanceSeconds("ban", "blue", { blue: 8, red: 0 })).toBe(30);
  });

  it("supports consecutive picks, intervening turns, and debt over 30 seconds", () => {
    const pending = { blue: 38, red: 0 };
    expect(turnAllowanceSeconds("pick", "blue", pending)).toBe(-8);
    expect(turnAllowanceSeconds("pick", "red", pending)).toBe(30);
    expect(turnDeadlineAt("2026-09-08T12:00:00.000Z", "pick", "blue", pending)).toBe("2026-09-08T11:59:52.000Z");
    // A ban does not consume or create pick debt, including the final ban phase.
    expect(turnAllowanceSeconds("ban", "red", pending)).toBe(30);
  });
});

