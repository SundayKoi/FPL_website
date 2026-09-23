import { describe, expect, it } from "vitest";
import { EARN, SPEND } from "./ledger";
import { CAMP_PRICES, FORGE_FRAGMENTS, FORGE_HOLD } from "@/lib/expeditions/camp";
import { ROAD_REWARDS, TIER_ORDER } from "@/lib/expeditions/config";
import { LEAGUE_GOAL_FRAGMENTS } from "@/lib/expeditions/league";
import { REVEAL_FRAGMENTS } from "@/lib/expeditions/reveal";

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

  it("says the league goal and a walked road pay fragments, not dollars, off the tables that pay them", () => {
    const expeditions = EARN.find((row) => row.key === "expeditions");
    const paying = TIER_ORDER.map((tier) => ROAD_REWARDS[tier].fragments).filter((n) => n > 0);
    expect(LEAGUE_GOAL_FRAGMENTS).toBe(1);
    expect(expeditions?.detail).toContain("map fragments, which are not dollars");
    expect(expeditions?.detail).toContain("one map fragment for everyone who helped when the league's expedition of the week is reached");
    expect(expeditions?.detail).toContain(`${Math.min(...paying)}–${Math.max(...paying)} map fragments for reaching every place on a route in one season`);
    expect(expeditions?.detail).toContain("the Legendary route adds a free pack");
    // The dollar figure is the loot alone: fragments never enter it.
    expect(expeditions?.figure).not.toContain("fragment");
  });

  it("prices revealing a road in fragments, not dollars", () => {
    const reveal = SPEND.find((row) => row.key === "reveal");
    expect(reveal?.title).toBe("Revealing a road");
    expect(REVEAL_FRAGMENTS).toBe(1);
    expect(reveal?.figure).toBe("1 map fragment, no dollars");
    expect(reveal?.detail).toContain("every checkpoint left on its road, for one map fragment");
    expect(reveal?.detail).toContain("in a convoy, one reveal shows both squads");
  });
});
