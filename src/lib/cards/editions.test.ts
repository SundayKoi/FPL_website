import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import { ALL_WEEKS, archiveEdition, weeksToArchive } from "./editions";

const CURRENT = "2026-08-24";
const ARCHIVED = ["2026-08-17", "2026-08-10"];

describe("weeksToArchive", () => {
  it("archives just the current week when nothing was asked for", () => {
    expect(weeksToArchive("", ARCHIVED, CURRENT)).toEqual([CURRENT]);
  });

  it("archives exactly the week that was asked for", () => {
    expect(weeksToArchive("2026-07-06", ARCHIVED, CURRENT)).toEqual(["2026-07-06"]);
  });

  it("rebuilds every archived week on 'all'", () => {
    expect(weeksToArchive(ALL_WEEKS, ARCHIVED, CURRENT)).toContain("2026-08-10");
  });

  it("includes the current week even when it was never archived", () => {
    // The pack shop offers the newest ARCHIVED week by default. Rebuilding
    // the back catalogue while leaving that one out would fix every
    // edition except the one most people are actually buying.
    expect(weeksToArchive(ALL_WEEKS, ARCHIVED, CURRENT)).toContain(CURRENT);
  });

  it("does not queue the current week twice when it is already archived", () => {
    const weeks = weeksToArchive(ALL_WEEKS, [CURRENT, ...ARCHIVED], CURRENT);
    expect(weeks.filter((week) => week === CURRENT)).toHaveLength(1);
  });

  it("returns weeks newest first", () => {
    expect(weeksToArchive(ALL_WEEKS, ["2026-08-10", "2026-08-17"], CURRENT)).toEqual([
      "2026-08-24",
      "2026-08-17",
      "2026-08-10",
    ]);
  });

  it("still archives the current week on 'all' with an empty archive", () => {
    expect(weeksToArchive(ALL_WEEKS, [], CURRENT)).toEqual([CURRENT]);
  });
});


/** Just the fields archiveEdition reads off a card. */
function card(slug: string): PlayerCardData {
  return {
    slug,
    name: slug,
    role: "Mid",
    overall: 70,
    tier: { key: "gold", label: "Gold" },
  } as PlayerCardData;
}

/** A card_editions stand-in that records what was written and deleted, and
 *  reads back whatever slugs the week already holds. */
function editionsClient(existingSlugs: string[], errors: { upsert?: string; read?: string; prune?: string } = {}) {
  const calls = { upserted: [] as string[], deleted: [] as string[][] };
  const client = {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.upsert = (rows: { slug: string }[]) => {
        calls.upserted = rows.map((row) => row.slug);
        return Promise.resolve({ error: errors.upsert ? { message: errors.upsert } : null });
      };
      chain.select = () => chain;
      chain.delete = () => {
        chain.isDelete = true;
        return chain;
      };
      chain.eq = () => chain;
      chain.in = (_column: string, values: string[]) => {
        calls.deleted.push(values);
        return Promise.resolve({ error: errors.prune ? { message: errors.prune } : null });
      };
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({
          data: errors.read ? null : existingSlugs.map((slug) => ({ slug })),
          error: errors.read ? { message: errors.read } : null,
        }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("archiveEdition", () => {
  it("reports how many it removed, so a silent no-op cannot pass for success", async () => {
    // The run that failed to prune looked identical in its log to one that
    // worked. Only a hand-written query told them apart.
    const { client } = editionsClient(["stayed", "left-last-week", "also-left"]);

    expect(await archiveEdition(client, "S5", "2026-08-24", [card("stayed")])).toEqual({
      error: null,
      pruned: 2,
    });
  });

  it("removes a player who is no longer in the week's pool", async () => {
    // The bug this exists to stop: an upsert is additive, so re-archiving a
    // week whose roster shrank wrote the new cards over the old and left
    // everyone else behind — and packs kept minting them.
    const { client, calls } = editionsClient(["stayed", "left-last-week"]);

    await archiveEdition(client, "S5", "2026-08-24", [card("stayed")]);

    expect(calls.deleted).toEqual([["left-last-week"]]);
  });

  it("still writes the current roster", async () => {
    const { client, calls } = editionsClient(["stayed", "gone"]);

    await archiveEdition(client, "S5", "2026-08-24", [card("stayed"), card("joined")]);

    expect(calls.upserted).toEqual(["stayed", "joined"]);
  });

  it("deletes nothing when the roster is unchanged", async () => {
    const { client, calls } = editionsClient(["a", "b"]);

    await archiveEdition(client, "S5", "2026-08-24", [card("a"), card("b")]);

    expect(calls.deleted).toEqual([]);
  });

  it("leaves an existing edition alone when the week fetched no cards", async () => {
    // A week that read no games must not wipe its archive: losing an
    // archived week to a transient read is worse than leaving it stale,
    // and the caller cannot tell those two apart.
    const { client, calls } = editionsClient(["a", "b"]);

    expect(await archiveEdition(client, "S5", "2026-08-24", [])).toEqual({ error: null, pruned: 0 });
    expect(calls.deleted).toEqual([]);
    expect(calls.upserted).toEqual([]);
  });

  it("does not prune when the write itself failed", async () => {
    const { client, calls } = editionsClient(["a"], { upsert: "permission denied" });

    expect(await archiveEdition(client, "S5", "2026-08-24", [card("b")])).toEqual({ error: "permission denied", pruned: 0 });
    expect(calls.deleted).toEqual([]);
  });

  it("reports a failed read without undoing the cards it wrote", async () => {
    const { client, calls } = editionsClient(["a"], { read: "timeout" });

    expect(await archiveEdition(client, "S5", "2026-08-24", [card("b")])).toEqual({ error: "timeout", pruned: 0 });
    // Correct-but-wide beats wrong: the new cards stay.
    expect(calls.upserted).toEqual(["b"]);
  });

  it("reports a failed prune", async () => {
    const { client } = editionsClient(["a", "b"], { prune: "deadlock" });

    expect(await archiveEdition(client, "S5", "2026-08-24", [card("a")])).toEqual({ error: "deadlock", pruned: 0 });
  });
});
