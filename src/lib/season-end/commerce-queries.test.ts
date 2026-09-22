import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom, type SupabaseFilterCall } from "@/test-utils/supabaseQuery";
import { fetchSeasonEndMarket } from "./commerce-queries";

vi.mock("server-only", () => ({}));

describe("fetchSeasonEndMarket", () => {
  it("does not show pending trades after their expiry", async () => {
    const log: SupabaseFilterCall[] = [];
    const client = {
      from: makeSupabaseFrom({
        season_end_listings: [{ data: [] }],
        season_end_wants: [{ data: [] }],
        season_end_trades: [{ data: [] }],
        betting_profiles: [{ data: [] }],
      }, log),
    } as unknown as SupabaseClient;

    await fetchSeasonEndMarket(client, "release-1");

    const expiryFilter = log.find((call) => call.table === "season_end_trades" && call.method === "gt");
    expect(expiryFilter?.args[0]).toBe("expires_at");
    expect(typeof expiryFilter?.args[1]).toBe("string");
  });
});
