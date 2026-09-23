import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom, type SupabaseFilterCall } from "@/test-utils/supabaseQuery";
import { fetchSeasonEndRecovery } from "./release-queries";

vi.mock("server-only", () => ({}));

const release = {
  id: "00000000-0000-0000-0000-000000000201",
  league: "premier",
  season: "S5",
  state: "public",
  price: 500,
  catalog_hash: "",
  rules_version: "",
  catalog_version: 1,
  withheld_awards: [],
  signing_book: [],
};

describe("fetchSeasonEndRecovery", () => {
  it("scopes the pending opening before recency", async () => {
    const log: SupabaseFilterCall[] = [];
    const from = makeSupabaseFrom({
      season_end_releases: [
        { data: [{ id: release.id }, { id: "00000000-0000-0000-0000-000000000202" }] },
        { data: release },
      ],
      season_end_openings: [{
        data: {
          release_id: release.id,
          request_id: "00000000-0000-0000-0000-000000000211",
        },
      }],
    }, log);

    const recovered = await fetchSeasonEndRecovery({ from } as unknown as SupabaseClient, "collector", "premier");

    expect(recovered?.release.id).toBe(release.id);
    expect(recovered?.requestId).toBe("00000000-0000-0000-0000-000000000211");
    expect(from).toHaveBeenCalledTimes(3);
    const openingScope = log.find((call) => call.table === "season_end_openings" && call.method === "in");
    expect(openingScope?.args).toEqual(["release_id", [release.id, "00000000-0000-0000-0000-000000000202"]]);
    const statuses = log.filter((call) => call.table === "season_end_openings" && call.method === "eq" && call.args[0] === "status");
    expect(statuses).toEqual([{ table: "season_end_openings", method: "eq", args: ["status", "pending"] }]);
  });

  it("does not route a terminal refund back into recovery", async () => {
    const log: SupabaseFilterCall[] = [];
    const from = makeSupabaseFrom({
      season_end_releases: [{ data: [{ id: release.id }] }],
      season_end_openings: [{ data: null }],
    }, log);

    await expect(fetchSeasonEndRecovery({ from } as unknown as SupabaseClient, "collector", "premier")).resolves.toBeNull();
    expect(log.filter((call) => call.table === "season_end_openings" && call.method === "eq" && call.args[0] === "status")).toEqual([
      { table: "season_end_openings", method: "eq", args: ["status", "pending"] },
    ]);
  });
});
