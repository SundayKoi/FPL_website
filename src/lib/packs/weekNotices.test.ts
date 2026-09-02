import { describe, expect, it } from "vitest";
import { weekNotices } from "./weekNotices";

const chase = { title: "Doug — Cracked Ice", bounty: 250, week: "2026-08-24", claimedBy: null };
const live = { until: "2026-08-25T01:30:00Z", label: "Match night rip" };

describe("weekNotices", () => {
  it("draws nothing in a quiet week", () => {
    expect(weekNotices({ liveWindow: null, chase: null, championsWindow: null, championComps: 0 })).toEqual([]);
  });

  it("leads with the most urgent thing, and keeps the rest in order", () => {
    const notices = weekNotices({
      liveWindow: live,
      chase,
      championsWindow: { until: "2026-09-14T04:00:00Z" },
      championComps: 2,
    });
    expect(notices.map((notice) => notice.key)).toEqual(["live", "tribute", "faceless", "chase"]);
  });

  it("says who took the chase, or what taking it pays", () => {
    const standing = weekNotices({ liveWindow: null, chase, championsWindow: null, championComps: 0 })[0];
    expect(standing.detail).toContain("wins 250 betting dollars");
    const taken = weekNotices({ liveWindow: null, chase: { ...chase, claimedBy: "Spies" }, championsWindow: null, championComps: 0 })[0];
    expect(taken.detail).toBe("Taken by Spies");
  });

  it("prints the league's clock, not the server's", () => {
    const [notice] = weekNotices({ liveWindow: live, chase: null, championsWindow: null, championComps: 0 });
    expect(notice.detail).toContain("9:30 PM ET");
  });

  it("counts a tribute in plain words", () => {
    const [one] = weekNotices({ liveWindow: null, chase: null, championsWindow: null, championComps: 1 });
    expect(one.text).toBe("1 free Faceless Pack is yours for the S4 title.");
    expect(one.detail).toContain("unlock the moment the vault opens");
  });
});
