import { describe, expect, it } from "vitest";
import { currentFantasyWeek, isLocked, lastCompletedWeek, lockTimeOf } from "./week";

// 2026-08-17 and 2026-08-24 are Mondays.
describe("lockTimeOf", () => {
  it("is Monday 6:00 PM Eastern — 22:00 UTC under EDT", () => {
    expect(lockTimeOf("2026-08-17").toISOString()).toBe("2026-08-17T22:00:00.000Z");
  });

  it("stays 6:00 PM Eastern in winter — 23:00 UTC under EST", () => {
    // 2026-12-14 is a Monday. The lock is a wall-clock hour in New York,
    // not a UTC constant, so it must NOT drift when DST ends.
    expect(lockTimeOf("2026-12-14").toISOString()).toBe("2026-12-14T23:00:00.000Z");
  });
});

describe("isLocked", () => {
  it("is false a minute before the deadline and true a minute after", () => {
    expect(isLocked("2026-08-17", new Date("2026-08-17T21:59:00Z"))).toBe(false);
    expect(isLocked("2026-08-17", new Date("2026-08-17T22:01:00Z"))).toBe(true);
  });

  it("counts the deadline itself as locked", () => {
    expect(isLocked("2026-08-17", new Date("2026-08-17T22:00:00Z"))).toBe(true);
  });

  it("is locked for the whole rest of the week", () => {
    expect(isLocked("2026-08-17", new Date("2026-08-21T09:00:00Z"))).toBe(true);
    expect(isLocked("2026-08-17", new Date("2026-08-23T23:59:59Z"))).toBe(true);
  });
});

describe("currentFantasyWeek", () => {
  it("is this Monday while Monday's deadline is still ahead", () => {
    expect(currentFantasyWeek(new Date("2026-08-17T00:00:00Z"))).toBe("2026-08-17");
    expect(currentFantasyWeek(new Date("2026-08-17T21:59:00Z"))).toBe("2026-08-17");
  });

  it("rolls to next Monday the moment this week locks", () => {
    expect(currentFantasyWeek(new Date("2026-08-17T22:00:00Z"))).toBe("2026-08-24");
    expect(currentFantasyWeek(new Date("2026-08-17T22:01:00Z"))).toBe("2026-08-24");
  });

  it("stays on next Monday mid-week and through Sunday night", () => {
    expect(currentFantasyWeek(new Date("2026-08-20T13:45:00Z"))).toBe("2026-08-24");
    expect(currentFantasyWeek(new Date("2026-08-23T23:59:59Z"))).toBe("2026-08-24");
    expect(currentFantasyWeek(new Date("2026-08-24T00:00:00Z"))).toBe("2026-08-24");
  });

  it("crosses month and year boundaries", () => {
    // 2026-01-01 is a Thursday, so its week's Monday (2025-12-29) has locked.
    expect(currentFantasyWeek(new Date("2026-01-01T12:00:00Z"))).toBe("2026-01-05");
  });

  it("never returns a week that is already locked", () => {
    const stamps = [
      "2026-08-16T23:30:00Z",
      "2026-08-17T21:59:59Z",
      "2026-08-17T22:00:00Z",
      "2026-08-19T04:00:00Z",
      "2026-08-23T23:59:59Z",
    ];
    for (const stamp of stamps) {
      const now = new Date(stamp);
      expect(isLocked(currentFantasyWeek(now), now)).toBe(false);
    }
  });
});

describe("lastCompletedWeek", () => {
  it("is the previous Monday until this week's deadline passes", () => {
    expect(lastCompletedWeek(new Date("2026-08-16T23:30:00Z"))).toBe("2026-08-10");
    expect(lastCompletedWeek(new Date("2026-08-17T21:59:00Z"))).toBe("2026-08-10");
  });

  it("becomes this Monday once it locks, and stays there all week", () => {
    expect(lastCompletedWeek(new Date("2026-08-17T22:00:00Z"))).toBe("2026-08-17");
    expect(lastCompletedWeek(new Date("2026-08-20T13:45:00Z"))).toBe("2026-08-17");
    expect(lastCompletedWeek(new Date("2026-08-23T23:59:59Z"))).toBe("2026-08-17");
  });

  it("crosses the year boundary", () => {
    expect(lastCompletedWeek(new Date("2026-01-01T12:00:00Z"))).toBe("2025-12-29");
  });

  it("always sits exactly one week behind the editable week", () => {
    const stamps = ["2026-08-16T23:30:00Z", "2026-08-17T21:59:59Z", "2026-08-17T22:00:00Z", "2026-08-22T10:00:00Z"];
    for (const stamp of stamps) {
      const now = new Date(stamp);
      const gap = new Date(currentFantasyWeek(now)).getTime() - new Date(lastCompletedWeek(now)).getTime();
      expect(gap).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });
});
