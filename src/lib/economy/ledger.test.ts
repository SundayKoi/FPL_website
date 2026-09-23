import { describe, expect, it } from "vitest";
import { EARN, SPEND } from "./ledger";
import { CAMP_PRICES, FORGE_FRAGMENTS, FORGE_HOLD } from "@/lib/expeditions/camp";

describe("the economy ledger", () => {
  it("keys every row once", () => {
    const keys = [...EARN, ...SPEND].map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("prices the base camp off the table the database charges", () => {
    const camp = SPEND.find((row) => row.key === "camp");
    expect(camp?.title).toBe("Base camp upgrades");
    // The cheapest and dearest level, and the whole camp.
    expect(camp?.figure).toBe("$300 – $1,500 a level");
    expect(camp?.detail).toContain("a second scouting squad ($1,500 + 1 map fragment)");
    expect(camp?.detail).toContain("a tent ($600, then $1,200 + 1 map fragment)");
    expect(camp?.detail).toContain("$5,300 builds all of it.");
    expect(CAMP_PRICES.tent[1]).toEqual({ dollars: 1200, fragments: 1 });
  });

  it("says forging costs fragments, not dollars", () => {
    const forge = SPEND.find((row) => row.key === "forge");
    expect(forge?.figure).toBe(`${FORGE_FRAGMENTS} map fragments, no dollars`);
    expect(forge?.detail).toContain(`Hold up to ${FORGE_HOLD}`);
    expect(forge?.detail).toContain("one forged launch a week");
  });
});
