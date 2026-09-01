import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  groupUnclaimedByWeek,
  orderFound,
  vaultRoleRank,
  vaultTotals,
  type UnclaimedPrint,
} from "./vault";
import { fetchVault } from "./vaultQueries";

function print(partial: Partial<UnclaimedPrint> & Pick<UnclaimedPrint, "playerName" | "role">): UnclaimedPrint {
  return {
    editionWeek: "2026-08-24",
    slug: partial.playerName.toLowerCase(),
    tier: "gold",
    mintsSigned: false,
    ...partial,
  };
}

describe("groupUnclaimedByWeek", () => {
  it("puts the newest week at the top of the board", () => {
    // The top of the board is what is currently being chased; the old
    // weeks stay in play below it.
    const weeks = groupUnclaimedByWeek([
      print({ playerName: "Doug", role: "Mid", editionWeek: "2026-08-17" }),
      print({ playerName: "Spies", role: "Mid", editionWeek: "2026-08-31" }),
      print({ playerName: "Kez", role: "Mid", editionWeek: "2026-08-24" }),
    ]);

    expect(weeks.map((week) => week.editionWeek)).toEqual(["2026-08-31", "2026-08-24", "2026-08-17"]);
  });

  it("lists a week in map order, not alphabetically", () => {
    // A Card of the Week is one per role, so a week IS a team sheet —
    // reading it in any other order scatters the five names.
    const [week] = groupUnclaimedByWeek([
      print({ playerName: "Adc", role: "Bot" }),
      print({ playerName: "Sup", role: "Support" }),
      print({ playerName: "Top", role: "Top" }),
      print({ playerName: "Mid", role: "Mid" }),
      print({ playerName: "Jgl", role: "Jungle" }),
    ]);

    expect(week.prints.map((entry) => entry.role)).toEqual(["Top", "Jungle", "Mid", "Bot", "Support"]);
  });

  it("sorts a role this list has never heard of to the bottom", () => {
    const [week] = groupUnclaimedByWeek([
      print({ playerName: "Nobody", role: "Coach" }),
      print({ playerName: "Doug", role: "Top" }),
    ]);

    expect(week.prints.map((entry) => entry.playerName)).toEqual(["Doug", "Nobody"]);
    expect(vaultRoleRank("Coach")).toBeGreaterThan(vaultRoleRank("Support"));
  });

  it("breaks a tie inside a role by name, so the order is total", () => {
    const [week] = groupUnclaimedByWeek([
      print({ playerName: "Zed", role: "Mid" }),
      print({ playerName: "Ahri", role: "Mid" }),
    ]);

    expect(week.prints.map((entry) => entry.playerName)).toEqual(["Ahri", "Zed"]);
  });

  it("groups nothing into nothing", () => {
    expect(groupUnclaimedByWeek([])).toEqual([]);
  });

  it("does not reorder the array it was handed", () => {
    const prints = [print({ playerName: "Sup", role: "Support" }), print({ playerName: "Top", role: "Top" })];
    groupUnclaimedByWeek(prints);
    expect(prints.map((entry) => entry.role)).toEqual(["Support", "Top"]);
  });
});

describe("orderFound", () => {
  it("leads with what was found most recently, not with the oldest edition", () => {
    // An Eclipse from an old week can fall tomorrow — the news is when it
    // was PULLED, not which week it prints from.
    const found = orderFound([
      { inventoryId: 1, acquiredAt: "2026-08-24T10:00:00Z" },
      { inventoryId: 2, acquiredAt: "2026-09-01T10:00:00Z" },
    ]);

    expect(found.map((copy) => copy.inventoryId)).toEqual([2, 1]);
  });

  it("breaks a shared timestamp on the id", () => {
    const found = orderFound([
      { inventoryId: 7, acquiredAt: "2026-08-24T10:00:00Z" },
      { inventoryId: 9, acquiredAt: "2026-08-24T10:00:00Z" },
    ]);

    expect(found.map((copy) => copy.inventoryId)).toEqual([9, 7]);
  });
});

describe("vaultTotals", () => {
  it("counts both halves and what they add up to", () => {
    expect(vaultTotals({ found: [1, 2], unclaimed: [1, 2, 3] })).toEqual({ found: 2, unclaimed: 3, total: 5 });
  });

  it("reads an empty season as a season with nothing in it", () => {
    expect(vaultTotals({ found: [], unclaimed: [] })).toEqual({ found: 0, unclaimed: 0, total: 0 });
  });
});

/** A Supabase stand-in that answers per table. Paged reads get their rows on
 *  the first `.range()` and an empty page after, so the readers stop; the
 *  unpaged ones are awaited directly and resolve off `then`. */
function vaultSupabase(tables: Record<string, unknown[]>) {
  const client = {
    from(table: string) {
      const rows = () => ({ data: tables[table] ?? [], error: null });
      const chain: Record<string, unknown> = {};
      const same = () => chain;
      chain.select = same;
      chain.eq = same;
      chain.in = same;
      chain.not = same;
      chain.filter = same;
      chain.order = same;
      chain.limit = same;
      chain.range = (from: number) => Promise.resolve(from === 0 ? rows() : { data: [], error: null });
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
  return client;
}

const doug = {
  id: 4,
  discord_id: "1",
  slug: "doug-na1",
  player_name: "Doug",
  role: "Mid",
  edition_week: "2026-08-24",
  overall: 91,
  tier: "challenger",
  signed: true,
  card: { slug: "doug-na1", name: "Doug" },
  acquired_at: "2026-08-25T12:00:00Z",
};

describe("fetchVault", () => {
  it("takes a found print off the unclaimed board and leaves the rest on it", async () => {
    const client = vaultSupabase({
      card_inventory: [doug],
      card_editions: [
        { edition_week: "2026-08-24", slug: "doug-na1", player_name: "Doug", role: "Mid", tier: "challenger" },
        { edition_week: "2026-08-24", slug: "spies-eu", player_name: "Spies", role: "Top", tier: "master" },
        // Same player, different week: a print is claimed per WEEK, so
        // Doug's older crown is still out there.
        { edition_week: "2026-08-17", slug: "doug-na1", player_name: "Doug", role: "Mid", tier: "challenger" },
      ],
      card_art_prefs: [{ summoner_name: "Spies", tag: "EU", signature: "data:image/png;base64,x" }],
      betting_profiles: [{ discord_id: "1", username: "Doug", avatar_url: "http://a", patron_until: null, patron_flame: null }],
      card_provenance: [
        { id: 1, event: "minted", from_discord: null, to_discord: "1", ref_table: null, ref_id: null, at: "2026-08-25T12:00:00Z" },
      ],
    });

    const vault = await fetchVault(client, "S5");

    expect(vault.found.map((copy) => copy.inventoryId)).toEqual([4]);
    expect(vault.unclaimed.map((entry) => `${entry.editionWeek}|${entry.slug}`)).toEqual([
      "2026-08-24|spies-eu",
      "2026-08-17|doug-na1",
    ]);
    expect(vaultTotals(vault)).toEqual({ found: 1, unclaimed: 2, total: 3 });
  });

  it("says which unclaimed prints would mint signed", async () => {
    // The ink is the difference between the two grades of one-of-one, and
    // the slug is computed here rather than joined in SQL so the board
    // works in an environment without card_slug().
    const client = vaultSupabase({
      card_inventory: [],
      card_editions: [
        { edition_week: "2026-08-24", slug: "spies-eu", player_name: "Spies", role: "Top", tier: "master" },
        { edition_week: "2026-08-24", slug: "doug-na1", player_name: "Doug", role: "Mid", tier: "challenger" },
      ],
      card_art_prefs: [{ summoner_name: "Spies", tag: "EU", signature: "data:image/png;base64,x" }],
      betting_profiles: [],
      card_provenance: [],
    });

    const vault = await fetchVault(client, "S5");

    expect(vault.unclaimed.find((entry) => entry.slug === "spies-eu")?.mintsSigned).toBe(true);
    expect(vault.unclaimed.find((entry) => entry.slug === "doug-na1")?.mintsSigned).toBe(false);
  });

  it("names the holder, and burns their flame only while their patronage lasts", async () => {
    const rows = (patronUntil: string | null) => ({
      card_inventory: [doug],
      card_editions: [],
      card_art_prefs: [],
      betting_profiles: [
        { discord_id: "1", username: "Doug", avatar_url: "http://a", patron_until: patronUntil, patron_flame: "gilded" },
        { discord_id: "2", username: "Spies", avatar_url: null, patron_until: null, patron_flame: null },
      ],
      card_provenance: [
        { id: 1, event: "minted", from_discord: null, to_discord: "2", ref_table: null, ref_id: null, at: "2026-08-25T12:00:00Z" },
        { id: 2, event: "transferred", from_discord: "2", to_discord: "1", ref_table: "card_trades", ref_id: 3, at: "2026-08-30T12:00:00Z" },
      ],
    });
    const now = new Date("2026-09-01T00:00:00Z");

    const burning = await fetchVault(vaultSupabase(rows("2026-10-01T00:00:00Z")), "S5", now);
    const lapsed = await fetchVault(vaultSupabase(rows("2026-08-01T00:00:00Z")), "S5", now);

    expect(burning.found[0].owner.name).toBe("Doug");
    expect(burning.found[0].owner.avatarUrl).toBe("http://a");
    expect(burning.found[0].owner.flame).toBeTruthy();
    expect(lapsed.found[0].owner.flame).toBeNull();
    // The chain is the point of a registry — it comes back said out loud.
    expect(burning.found[0].chain).toEqual(["Pulled by Spies · Aug 25", "Traded to Doug · Aug 30"]);
  });

  it("renders as an empty registry when the tables are not there yet", async () => {
    const client = {
      from: () => {
        const chain: Record<string, unknown> = {};
        const same = () => chain;
        chain.select = same;
        chain.eq = same;
        chain.in = same;
        chain.not = same;
        chain.filter = same;
        chain.order = same;
        chain.limit = same;
        const failed = { data: null, error: { message: "relation does not exist" } };
        chain.range = () => Promise.resolve(failed);
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(failed).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;

    expect(await fetchVault(client, "S5")).toEqual({ found: [], unclaimed: [] });
  });
});
