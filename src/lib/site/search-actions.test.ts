import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc }) }));

import { logSiteSearchAction } from "./search-actions";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
});

describe("logSiteSearchAction", () => {
  it("passes the search to the logging function with a clean count and league", async () => {
    await logSiteSearchAction("standings", 4.4, "academy");
    expect(rpc).toHaveBeenCalledWith("log_site_search", { p_query: "standings", p_results: 4, p_league: "academy" });
    await logSiteSearchAction("duels", "junk", "elsewhere");
    expect(rpc).toHaveBeenLastCalledWith("log_site_search", { p_query: "duels", p_results: 0, p_league: "premier" });
  });

  it("does not call the database for a non-string or one-letter search", async () => {
    await logSiteSearchAction("s", 1, "premier");
    await logSiteSearchAction({ query: "x" }, 1, "premier");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws, whatever the database does", async () => {
    rpc.mockRejectedValue(new Error("down"));
    await expect(logSiteSearchAction("standings", 1, "premier")).resolves.toBeUndefined();
  });
});
