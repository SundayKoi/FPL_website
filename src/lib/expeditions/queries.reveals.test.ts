import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseQuery, type SupabaseQueryResult } from "@/test-utils/supabaseQuery";
import { fetchReveals } from "./queries";

/** One expedition_reveals read, recording its filters. */
function client(result: SupabaseQueryResult) {
  const log: { method: string; args: unknown[] }[] = [];
  const from = vi.fn(() => supabaseQuery(result, (method, args) => log.push({ method, args })));
  return { supabase: { from } as unknown as SupabaseClient, from, log };
}

describe("fetchReveals", () => {
  it("reads this collector's runs and the convoy partners' in one query", async () => {
    const { supabase, from, log } = client({
      data: [
        { run_id: 11, discord_id: "me" },
        { run_id: 21, discord_id: "rio" },
      ],
      error: null,
    });
    const reads = await fetchReveals(supabase, "me", [11, 12], [{ discordId: "rio", runId: 21 }]);
    expect(from).toHaveBeenCalledWith("expedition_reveals");
    expect(log).toContainEqual({ method: "in", args: ["run_id", [11, 12, 21]] });
    expect(reads).toEqual({ mine: new Set([11]), partner: new Set([21]) });
  });

  it("matches every row back to the collector who owns the run it names", async () => {
    // A row for one of my run ids in somebody else's name, and a partner's
    // run revealed by a third collector, reveal nothing to me.
    const { supabase } = client({
      data: [
        { run_id: "11", discord_id: "someone" },
        { run_id: 21, discord_id: "someone" },
        { run_id: "12", discord_id: "me" },
      ],
      error: null,
    });
    expect(await fetchReveals(supabase, "me", [11, 12], [{ discordId: "rio", runId: 21 }])).toEqual({ mine: new Set([12]), partner: new Set() });
  });

  it("fails soft to null when the table cannot be read", async () => {
    const { supabase } = client({ data: null, error: { message: 'relation "public.expedition_reveals" does not exist' } });
    expect(await fetchReveals(supabase, "me", [11])).toBeNull();
  });

  it("asks nothing when there is nothing to ask about", async () => {
    const { supabase, from } = client({ data: [], error: null });
    expect(await fetchReveals(supabase, "me", [], [])).toEqual({ mine: new Set(), partner: new Set() });
    expect(from).not.toHaveBeenCalled();
  });
});
