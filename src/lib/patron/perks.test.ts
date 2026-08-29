import { describe, expect, it } from "vitest";
import { BINDER_SLOTS, PATRON_BINDER_SLOTS } from "@/lib/binder/queries";
import { PATRON_DUST_MULT } from "@/lib/packs/config";
import { SOVEREIGN_TENURE_DAYS } from "./flames";
import {
  BASE_EXPEDITION_LAUNCHES,
  HEADLINE_PATRON_PERKS,
  PATRON_EXPEDITION_LAUNCHES,
  PATRON_FAIRNESS_NOTE,
  PATRON_PERKS,
} from "./perks";

describe("PATRON_PERKS", () => {
  it("is a complete, unique, well-formed list", () => {
    expect(PATRON_PERKS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(PATRON_PERKS.map((perk) => perk.key)).size).toBe(PATRON_PERKS.length);
    for (const perk of PATRON_PERKS) {
      expect(perk.icon.length, perk.key).toBeGreaterThan(0);
      expect(perk.title.length, perk.key).toBeGreaterThan(3);
      expect(perk.blurb.length, perk.key).toBeGreaterThan(20);
      // Copy is a sentence, not a stub.
      expect(perk.blurb.trim().endsWith("."), perk.key).toBe(true);
    }
  });

  it("quotes the numbers the server actually enforces", () => {
    // The whole reason this list is code and not prose: a perk page that
    // disagrees with the server is worse than no perk page.
    const binder = PATRON_PERKS.find((perk) => perk.key === "binder")!;
    expect(binder.title).toContain(String(PATRON_BINDER_SLOTS));
    expect(binder.blurb).toContain(String(PATRON_BINDER_SLOTS - BINDER_SLOTS));
    expect(binder.blurb).toContain(String(BINDER_SLOTS));

    const dust = PATRON_PERKS.find((perk) => perk.key === "dust")!;
    expect(dust.title).toContain(String(Math.round((PATRON_DUST_MULT - 1) * 100)));

    // The expedition limit is enforced in SQL (launch_expedition), so the
    // constants here are pinned by hand — this asserts the copy quotes
    // them, and the values match the migration's case-when.
    const expeditions = PATRON_PERKS.find((perk) => perk.key === "expeditions")!;
    expect(PATRON_EXPEDITION_LAUNCHES).toBe(2);
    expect(BASE_EXPEDITION_LAUNCHES).toBe(1);
    expect(expeditions.blurb).toContain(String(PATRON_EXPEDITION_LAUNCHES));
    expect(expeditions.blurb).toContain(String(BASE_EXPEDITION_LAUNCHES));

    const flame = PATRON_PERKS.find((perk) => perk.key === "flame")!;
    expect(flame.blurb).toContain(String(Math.round(SOVEREIGN_TENURE_DAYS / 30)));
    // The flame reaches both boards now, not just betting.
    expect(flame.blurb).toMatch(/Gauntlet/);

    const recurring = PATRON_PERKS.find((perk) => perk.key === "recurring-rewards")!;
    expect(recurring.title).toBe("50% more recurring rewards");
    expect(recurring.blurb).toContain("/daily");
    expect(recurring.blurb).toContain("FPL'dle");
    expect(recurring.headline).toBe(true);
  });

  it("keeps a short list for the cards hub, drawn from the same source", () => {
    expect(HEADLINE_PATRON_PERKS.length).toBeGreaterThanOrEqual(3);
    expect(HEADLINE_PATRON_PERKS.length).toBeLessThan(PATRON_PERKS.length);
    for (const perk of HEADLINE_PATRON_PERKS) expect(PATRON_PERKS).toContain(perk);
  });

  it("states the fairness rule, which is the point of the whole list", () => {
    expect(PATRON_FAIRNESS_NOTE).toMatch(/odds/);
    expect(PATRON_FAIRNESS_NOTE).toMatch(/rating/);
    expect(PATRON_FAIRNESS_NOTE).toMatch(/pack/);
    expect(PATRON_FAIRNESS_NOTE).toBe(
      "Patronage increases listed recurring wallet rewards. It never changes betting odds, pack odds, ratings, match results, Fantasy scoring, or Gauntlet placement.",
    );
  });
});
