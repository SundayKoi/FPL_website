import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoDustPulls, dustCopies } from "./autoDustServer";
import { describePull } from "./autoDust";

vi.mock("server-only", () => ({}));

/**
 * The shipped bug this file exists for: a pack minted a Shiny, and the
 * rule that said "leave my finishes alone" melted it anyway.
 *
 * The finishes are stamped LAST when a pack opens, over whatever the print
 * already was. The on-rip hook described each pull to the rule by hand and
 * that description stopped at signed — so every pull arrived looking like a
 * plain card, `skipFinishes` had nothing to act on, and a Shiny or a
 * StatTrak copy that happened to be a duplicate went straight to dust. The
 * collection sweep never had the bug: it reads the frozen json, where the
 * finishes are.
 *
 * Both halves of the fix are checked here — the description now carries
 * them, and the melt re-checks the row as the database has it.
 */

interface Row {
  id: number;
  discord_id: string;
  season: string;
  tier: string;
  foil: boolean;
  foil_type: string | null;
  signed: boolean | null;
  mutation: string | null;
  shiny?: boolean | null;
  stattrak?: unknown;
  secret?: unknown;
  slab?: unknown;
}

function row(id: number, extra: Partial<Row> = {}): Row {
  return {
    id,
    discord_id: "42",
    season: "S5",
    tier: "bronze",
    foil: false,
    foil_type: null,
    signed: false,
    mutation: null,
    ...extra,
  };
}

const RULE = {
  enabled: true,
  maxTier: "silver" as const,
  maxOverall: 99,
  keepCopies: 0,
  perEdition: false,
  onRip: true,
  skipFoil: false,
  skipSigned: false,
  skipFinishes: true,
};

/**
 * Enough of PostgREST and the RPC door to run a dust. `inventory` answers
 * the reads; `dusted` records every id the RPC was actually asked to melt.
 */
function client(opts: { inventory: Row[]; rule?: Partial<typeof RULE> | null; dusted: number[] }): SupabaseClient {
  const rule = opts.rule === null ? null : { ...RULE, ...opts.rule };
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const rows =
        table === "card_inventory"
          ? opts.inventory
          : table === "card_auto_dust"
            ? rule
              ? [
                  {
                    enabled: rule.enabled,
                    max_tier: rule.maxTier,
                    max_overall: rule.maxOverall,
                    keep_copies: rule.keepCopies,
                    per_edition: rule.perEdition,
                    on_rip: rule.onRip,
                    skip_foil: rule.skipFoil,
                    skip_signed: rule.skipSigned,
                    skip_finishes: rule.skipFinishes,
                  },
                ]
              : []
            : [];
      for (const method of ["select", "eq", "in", "order", "range", "gte", "lte", "not", "is", "neq", "filter"]) chain[method] = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return chain;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name === "dust_card") opts.dusted.push(args.p_inventory as number);
      return Promise.resolve({ data: 100, error: null });
    },
  } as unknown as SupabaseClient;
}

describe("dustCopies", () => {
  it("keeps a Shiny and a StatTrak copy when the rule says to, whatever the selection was told", async () => {
    // The rule is handed in as the guard, so this is the melt re-reading
    // the row rather than trusting the description it was given.
    const dusted: number[] = [];
    const inventory = [row(1), row(2, { shiny: true }), row(3, { stattrak: { points: 12 } })];
    const result = await dustCopies(client({ inventory, dusted }), "42", [1, 2, 3], RULE);
    expect(dusted).toEqual([1]);
    expect(result.dusted).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("melts them when the collector has turned the finish guard off", async () => {
    const dusted: number[] = [];
    const inventory = [row(1), row(2, { shiny: true }), row(3, { stattrak: { points: 12 } })];
    await dustCopies(client({ inventory, dusted }), "42", [1, 2, 3], { ...RULE, skipFinishes: false });
    expect(dusted).toEqual([1, 2, 3]);
  });

  it("never melts a Secret, a slab, an Eclipse or a mutated copy, guard or no guard", async () => {
    const dusted: number[] = [];
    const inventory = [
      row(1),
      row(2, { secret: { number: 121, of: 120 } }),
      row(3, { slab: { grade: "gem" } }),
      row(4, { foil_type: "eclipse" }),
      row(5, { mutation: "gilded" }),
    ];
    await dustCopies(client({ inventory, dusted }), "42", [1, 2, 3, 4, 5], { ...RULE, skipFinishes: false });
    expect(dusted).toEqual([1]);
  });

  it("melts nothing it does not own", async () => {
    const dusted: number[] = [];
    const inventory = [row(1, { discord_id: "someone-else" })];
    const result = await dustCopies(client({ inventory, dusted }), "42", [1], RULE);
    expect(dusted).toEqual([]);
    expect(result.skipped).toBe(1);
  });
});

describe("autoDustPulls", () => {
  const pull = (id: number, extra: Record<string, unknown> = {}) => ({
    inventoryId: id,
    slug: `p-${id}`,
    tier: "bronze",
    overall: 40,
    foil: false,
    foilType: null,
    signed: false,
    relic: false,
    editionWeek: "2026-08-24",
    ...extra,
  });

  it("leaves a Shiny and a StatTrak pull on the shelf when the rule keeps finishes", async () => {
    // Every pull here is a duplicate the rule would otherwise take
    // (keepCopies 0), so only the finish guard can save them.
    const dusted: number[] = [];
    const inventory = [row(1), row(2, { shiny: true }), row(3, { stattrak: { points: 0 } })];
    const service = client({ inventory, dusted });
    await autoDustPulls(service, "42", "S5", [
      pull(1),
      pull(2, { shiny: true }),
      pull(3, { stattrak: true }),
    ]);
    expect(dusted).toEqual([1]);
  });

  it("does nothing when the rule is off, or off for rips, or the pack was empty", async () => {
    for (const rule of [{ enabled: false }, { onRip: false }]) {
      const dusted: number[] = [];
      const service = client({ inventory: [row(1)], rule, dusted });
      expect(await autoDustPulls(service, "42", "S5", [pull(1)])).toBeNull();
      expect(dusted).toEqual([]);
    }
    const dusted: number[] = [];
    expect(await autoDustPulls(client({ inventory: [], dusted }), "42", "S5", [])).toBeNull();
  });
});

describe("describePull", () => {
  const pull = (card: Record<string, unknown>) => ({
    inventoryId: 1,
    foil: false,
    foilType: null,
    signed: false,
    card: { slug: "a", overall: 40, tier: { key: "bronze" }, ...card },
  });

  it("carries the finishes the pack stamped last", () => {
    // The regression: these three were invisible to the rule, because the
    // description written at the call site stopped at `signed`.
    expect(describePull(pull({ shiny: true }), "2026-08-24")).toMatchObject({ shiny: true, stattrak: false, secret: false });
    expect(describePull(pull({ stattrak: { points: 0 } }), "2026-08-24")).toMatchObject({ stattrak: true });
    expect(describePull(pull({ secret: { number: 121, of: 120 } }), "2026-08-24")).toMatchObject({ secret: true });
  });

  it("files every one-of under relic, the Dribb included", () => {
    for (const card of [{ moment: {} }, { champWin: {} }, { team: {} }, { dribb: { number: 2, of: 5 } }]) {
      expect(describePull(pull(card), "2026-08-24").relic).toBe(true);
    }
    expect(describePull(pull({}), "2026-08-24").relic).toBe(false);
  });

  it("describes an ordinary pull as ordinary, on the pack's week", () => {
    expect(describePull(pull({}), "2026-08-24")).toEqual({
      inventoryId: 1,
      slug: "a",
      tier: "bronze",
      overall: 40,
      foil: false,
      foilType: null,
      signed: false,
      relic: false,
      shiny: false,
      stattrak: false,
      secret: false,
      editionWeek: "2026-08-24",
    });
  });
});
