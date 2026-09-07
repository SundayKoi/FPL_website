import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { fetchCardEditionWeeks } = vi.hoisted(() => ({
  fetchCardEditionWeeks: vi.fn(),
}));

vi.mock("@/lib/cards/queries", () => ({ fetchCardEditionWeeks }));

import { HigherLowerSnapshotError, refreshHigherLowerSnapshot } from "./snapshot";

function createClient(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as unknown as SupabaseClient;
}

beforeEach(() => {
  fetchCardEditionWeeks.mockReset();
  fetchCardEditionWeeks.mockResolvedValue(["2026-09-07", "2026-08-31", "2026-08-24"]);
});

describe("refreshHigherLowerSnapshot", () => {
  it("selects the newest two archived weeks", async () => {
    const client = createClient({ data: 124, error: null });

    await expect(refreshHigherLowerSnapshot(client, "premier", "S5", "2026-09-08")).resolves.toEqual({
      editionWeeks: ["2026-09-07", "2026-08-31"],
      candidateCount: 124,
    });
    expect(fetchCardEditionWeeks).toHaveBeenCalledWith(client, "S5", { throwOnError: true });
    expect(client.rpc).toHaveBeenCalledWith("ensure_higher_lower_daily_candidates_weeks", {
      p_puzzle_date: "2026-09-08",
      p_league: "premier",
      p_season: "S5",
      p_edition_weeks: ["2026-09-07", "2026-08-31"],
    });
  });

  it("falls back to one week when only one archive is available", async () => {
    fetchCardEditionWeeks.mockResolvedValue(["2026-09-07"]);
    const client = createClient({ data: 61, error: null });

    await expect(refreshHigherLowerSnapshot(client, "academy", "A5", "2026-09-08")).resolves.toEqual({
      editionWeeks: ["2026-09-07"],
      candidateCount: 61,
    });
    expect(client.rpc).toHaveBeenCalledWith("ensure_higher_lower_daily_candidates_weeks", expect.objectContaining({
      p_league: "academy",
      p_season: "A5",
      p_edition_weeks: ["2026-09-07"],
    }));
  });

  it("distinguishes an empty archive from a database failure", async () => {
    const emptyClient = createClient({ data: 0, error: null });
    fetchCardEditionWeeks.mockResolvedValue([]);
    await expect(refreshHigherLowerSnapshot(emptyClient, "premier", "S5", "2026-09-08"))
      .rejects.toMatchObject({ code: "NO_EDITION" });
    expect(emptyClient.rpc).not.toHaveBeenCalled();

    const failedClient = createClient({ data: null, error: new Error("RPC unavailable") });
    fetchCardEditionWeeks.mockRejectedValue(new Error("card_editions unavailable"));
    await expect(refreshHigherLowerSnapshot(failedClient, "premier", "S5", "2026-09-08"))
      .rejects.toMatchObject({ code: "DATABASE_ERROR" });
  });

  it("reports an RPC failure as a database error", async () => {
    const rpcError = new Error("permission denied");
    const client = createClient({ data: null, error: rpcError });

    const result = refreshHigherLowerSnapshot(client, "premier", "S5", "2026-09-08");
    await expect(result).rejects.toMatchObject({
      code: "DATABASE_ERROR",
      cause: rpcError,
    } satisfies Partial<HigherLowerSnapshotError>);
  });
});
