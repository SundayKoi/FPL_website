import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMP_LINES,
  CAMP_PRICES,
  CAMP_SLOTS_MAX,
  CAMP_UPGRADES,
  EMPTY_CAMP,
  FORGED_PER_WEEK,
  FORGE_FRAGMENTS,
  FORGE_HOLD,
  campCovers,
  campFromRow,
  forgedPolicyState,
  friendlyCampError,
  maxLevel,
  nextLevel,
  nextPurchase,
  priceLine,
  purchaseBlocks,
  scoutSlots,
  tierSlots,
  wallRelics,
  type CampPurchase,
  type CampState,
} from "./camp";
import { TIER_ORDER } from "./config";

const camp = (over: Partial<CampState> = {}): CampState => ({ ...EMPTY_CAMP, ...over });

/** The newest migration that says `needle` — each redeclaration carries
 *  the whole body, so the last one is the live one. */
function newestDeclaring(needle: string): string {
  const dir = join(process.cwd(), "supabase/migrations");
  const latest = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(join(dir, name), "utf8").includes(needle));
  expect(latest, `no migration declares ${needle}`).toBeTruthy();
  return readFileSync(join(dir, latest!), "utf8");
}

describe("the camp's prices are the database's", () => {
  /** expedition_camp_price's value rows, read out of the live declaration. */
  function sqlPrices(): Record<string, Record<number, { dollars: number; fragments: number }>> {
    const sql = newestDeclaring("create or replace function public.expedition_camp_price");
    const body = sql.slice(sql.indexOf("create or replace function public.expedition_camp_price"));
    const table = body.slice(0, body.indexOf("$$;"));
    const rows = [...table.matchAll(/\('(\w+)',\s*(\d+),\s*(\d+)::bigint,\s*(\d+)\)/g)];
    expect(rows.length, "the price rows are not where the test expects them").toBeGreaterThan(0);
    const prices: Record<string, Record<number, { dollars: number; fragments: number }>> = {};
    for (const [, upgrade, level, dollars, fragments] of rows) {
      (prices[upgrade] ??= {})[Number(level)] = { dollars: Number(dollars), fragments: Number(fragments) };
    }
    return prices;
  }

  it("holds CAMP_PRICES equal to expedition_camp_price, level for level", () => {
    // A TypeScript table and a SQL table describing one price, with
    // nothing holding them together, is how a button ends up promising
    // $600 for a purchase the database charges $700 — or refuses as
    // 'bad price' forever. Changing either now fails here until both move.
    const fromSql = sqlPrices();
    const fromTs: Record<string, Record<number, { dollars: number; fragments: number }>> = {};
    for (const [purchase, levels] of Object.entries(CAMP_PRICES)) {
      fromTs[purchase] = Object.fromEntries(levels.map((price, index) => [index + 1, { ...price }]));
    }
    expect(fromSql).toEqual(fromTs);
  });

  it("holds the table's own bounds to the constants", () => {
    const sql = newestDeclaring("create table if not exists public.expedition_camps");
    expect(sql).toMatch(new RegExp(`slots\\s+int\\s+not null default 0 check \\(slots between 0 and ${CAMP_SLOTS_MAX}\\)`));
    expect(sql).toMatch(new RegExp(`tent\\s+int\\s+not null default 0 check \\(tent between 0 and ${maxLevel("tent")}\\)`));
    expect(sql).toMatch(new RegExp(`forge\\s+int\\s+not null default 0 check \\(forge between 0 and ${maxLevel("forge")}\\)`));
    expect(sql).toMatch(new RegExp(`wall\\s+int\\s+not null default 0 check \\(wall between 0 and ${maxLevel("wall")}\\)`));
    expect(sql).toMatch(new RegExp(`forged_policies int\\s+not null default 0 check \\(forged_policies between 0 and ${FORGE_HOLD}\\)`));
  });

  it("holds the forge's weekly limit to FORGED_PER_WEEK", () => {
    const sql = newestDeclaring("p_convoy text, p_forged boolean");
    expect(sql).toContain(`if v_forged >= ${FORGED_PER_WEEK} then raise exception 'forge spent this week'`);
    expect(sql).toContain(`if v_camp.forged_policies >= ${FORGE_HOLD} then raise exception 'forge is full'`);
  });

  it("prices a slot at the number the guardrail was written against", () => {
    expect(CAMP_PRICES.slot).toHaveLength(CAMP_SLOTS_MAX);
    expect(CAMP_PRICES.policy).toEqual([{ dollars: 0, fragments: FORGE_FRAGMENTS }]);
  });

  it("costs $5,300 and 3 fragments to build everything", () => {
    const all = CAMP_UPGRADES.flatMap((upgrade) => CAMP_PRICES[upgrade]);
    expect(all.reduce((sum, price) => sum + price.dollars, 0)).toBe(5300);
    expect(all.reduce((sum, price) => sum + price.fragments, 0)).toBe(3);
  });

  it("has a line for every level it sells", () => {
    for (const upgrade of CAMP_UPGRADES) expect(CAMP_LINES[upgrade]).toHaveLength(maxLevel(upgrade));
  });
});

describe("levels", () => {
  it("climbs to the top and stops", () => {
    expect(nextLevel(camp(), "tent")).toBe(1);
    expect(nextLevel(camp({ tent: 1 }), "tent")).toBe(2);
    expect(nextLevel(camp({ tent: 2 }), "tent")).toBeNull();
    expect(nextLevel(camp({ slots: 1 }), "slot")).toBeNull();
    expect(nextPurchase(camp({ tent: 1 }), "tent")).toEqual({ level: 2, price: { dollars: 1200, fragments: 1 } });
    expect(nextPurchase(camp({ wall: 2 }), "wall")).toBeNull();
  });

  it("forges only with a forge, and only up to what it holds", () => {
    expect(nextPurchase(camp(), "policy")).toBeNull();
    expect(nextPurchase(camp({ forge: 1 }), "policy")).toEqual({ level: 1, price: { dollars: 0, fragments: FORGE_FRAGMENTS } });
    expect(nextPurchase(camp({ forge: 1, forgedPolicies: FORGE_HOLD }), "policy")).toBeNull();
  });

  it("reads a row defensively: no row is an empty camp, and nothing past the table's bounds", () => {
    expect(campFromRow(null)).toEqual(EMPTY_CAMP);
    expect(campFromRow({ slots: 1, tent: 2, forge: 1, wall: 1, forged_policies: 2, spent: 2900 })).toEqual({
      slots: 1,
      tent: 2,
      forge: 1,
      wall: 1,
      forgedPolicies: 2,
      spent: 2900,
    });
    expect(campFromRow({ slots: 7, tent: -1, forge: "x", wall: null, forged_policies: 9, spent: -5 })).toEqual({
      ...EMPTY_CAMP,
      slots: CAMP_SLOTS_MAX,
      forgedPolicies: FORGE_HOLD,
    });
  });
});

describe("what a camp does", () => {
  it("lets a second Scouting Run out with the slot, and nothing else", () => {
    expect(scoutSlots(null)).toBe(1);
    expect(scoutSlots(camp())).toBe(1);
    expect(scoutSlots(camp({ slots: 1 }))).toBe(2);
    for (const tier of TIER_ORDER) expect(tierSlots(camp({ slots: 1 }), tier)).toBe(tier === "scout" ? 2 : 1);
  });

  it("covers a night at camp from the first tent, and a toll from the second", () => {
    expect(campCovers(null, "camp")).toBe(false);
    expect(campCovers(camp({ tent: 1 }), "camp")).toBe(true);
    expect(campCovers(camp({ tent: 1 }), "toll")).toBe(false);
    expect(campCovers(camp({ tent: 2 }), "toll")).toBe(true);
  });
});

describe("the words", () => {
  it("states every price plainly", () => {
    expect(priceLine({ dollars: 1500, fragments: 1 })).toBe("$1,500 + 1 map fragment");
    expect(priceLine({ dollars: 600, fragments: 0 })).toBe("$600");
    expect(priceLine({ dollars: 0, fragments: 2 })).toBe("2 map fragments");
  });

  it("says every reason a purchase is out of reach, at once", () => {
    const poor = { balance: 200, fragments: 0 };
    expect(purchaseBlocks(camp(), "slot", poor)).toEqual(["You have $200; this costs $1,500.", "You have 0 map fragments; this needs 1."]);
    expect(purchaseBlocks(camp(), "wall", { balance: 300, fragments: 0 })).toEqual([]);
    expect(purchaseBlocks(camp({ slots: 1 }), "slot", { balance: 9999, fragments: 9 })).toEqual(["Built to the top level."]);
    expect(purchaseBlocks(camp(), "policy", { balance: 0, fragments: 9 })).toEqual(["Build the forge first."]);
    expect(purchaseBlocks(camp({ forge: 1, forgedPolicies: 2 }), "policy", { balance: 0, fragments: 9 })[0]).toContain("the most a forge holds");
    expect(purchaseBlocks(camp({ forge: 1 }), "policy", { balance: 0, fragments: 1 })).toEqual(["You have 1 map fragment; this needs 2."]);
  });

  it("translates the camp's refusals, and leaves the rest to the expedition words", () => {
    const purchases: CampPurchase[] = ["slot", "tent", "forge", "wall", "policy"];
    expect(purchases).toHaveLength(Object.keys(CAMP_PRICES).length);
    for (const message of ["bad price", "already built", "forge not built", "forge is full", "unknown upgrade", "not enough fragments", "insufficient balance"]) {
      expect(friendlyCampError(message), message).toBeTruthy();
    }
    expect(friendlyCampError("not enough fragments")).toBe("You don't have enough map fragments for that.");
    expect(friendlyCampError("unknown user 42")).toBeNull();
  });
});

describe("the forged-policy option on a route", () => {
  const held = camp({ forge: 1, forgedPolicies: 1 });

  it("is offered only when a policy is held and the route can hurt a card", () => {
    expect(forgedPolicyState(null, 0, "raid")).toBeNull();
    expect(forgedPolicyState(camp({ forge: 1 }), 0, "raid")).toBeNull();
    expect(forgedPolicyState(held, 0, "scout")).toBeNull();
    expect(forgedPolicyState(held, 0, "exorcism")).toBeNull();
    expect(forgedPolicyState(held, 0, "legend")).toEqual({ held: 1, reason: null });
  });

  it("says why when this week's forged launch is used, and lets the RPC decide when the count is unknown", () => {
    expect(forgedPolicyState(held, FORGED_PER_WEEK, "raid")?.reason).toContain("Monday");
    expect(forgedPolicyState(held, null, "raid")).toEqual({ held: 1, reason: null });
  });
});

describe("the wall", () => {
  it("hangs every campaign relic on the shelf, and nothing else", () => {
    const copies = [
      { id: 1, playerName: "Kai", card: { name: "Kai", campaign: { key: "broken_map" as const } } },
      { id: 2, playerName: "Dee", card: { name: "Dee" } },
      { id: 3, playerName: "Bo", card: { name: "Bo", campaign: { key: "lost_print" as const } } },
    ];
    expect(wallRelics(copies).map((relic) => relic.id)).toEqual([1, 3]);
    expect(wallRelics(copies)[0].name).toBe("Kai");
  });
});
