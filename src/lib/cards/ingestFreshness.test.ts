import { describe, expect, it } from "vitest";
import { ingestVerdict } from "./ingestFreshness";

const WEEK = "2026-08-24";

describe("ingestVerdict", () => {
  it("passes when the week's own games are ingested", () => {
    expect(ingestVerdict(WEEK, WEEK, 4)).toEqual({ ok: true, reason: "fresh" });
  });

  it("refuses when the week was played but the ingest hasn't landed", () => {
    // The failure this exists to catch: the drop runs on last week's data
    // and every step downstream is perfectly happy with the missing rows.
    const verdict = ingestVerdict(WEEK, "2026-08-17", 4);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain("4 fixtures were played");
    expect(verdict.message).toContain("2026-08-17");
    // It has to say what to do about it, or it is just a stopped job.
    expect(verdict.message).toContain("Ingest match reports");
  });

  it("refuses a season with nothing ingested at all, and says so in words", () => {
    const verdict = ingestVerdict(WEEK, null, 1);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.message).toContain("1 fixture was played");
    expect(verdict.message).toContain("no week at all");
  });

  it("passes a bye week rather than blocking every drop after it", () => {
    // A guard nobody can satisfy gets switched off. With no fixture played
    // there is nothing for the ingest to have missed.
    expect(ingestVerdict(WEEK, "2026-08-17", 0)).toEqual({ ok: true, reason: "no-games-played" });
    expect(ingestVerdict(WEEK, null, 0)).toEqual({ ok: true, reason: "no-games-played" });
  });
});
