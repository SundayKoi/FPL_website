import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const { derive } = vi.hoisted(() => ({ derive: vi.fn((rows, fixtures, season, league, options) => ({ rows, fixtures, season, league, options })) }));
vi.mock("./derive", () => ({ deriveSeasonEnd: derive }));
import { loadSeasonEnd } from "./queries";

function client(fail = false, currentRoster = false) {
  const calls: { table: string; filters: Record<string, string>; from: number; to: number; order: string }[] = [];
  const db = { from(table: string) {
    const filters: Record<string,string> = {}; let order = "";
    const query = {
      select: () => query,
      eq: (k: string, v: string) => { filters[k] = v; return query; },
      order: (k: string) => { order = k; return query; },
      single: async () => {
        calls.push({ table, filters, from: -1, to: -1, order });
        return { data: { current_season: "S5", academy_season: "A1", featured_draft_id: "premier-draft", academy_draft_id: "academy-draft" }, error: null };
      },
      range: async (from: number, to: number) => {
        calls.push({table, filters, from, to, order});
        if (fail && from > 0) return { data: null, error: { message: "Read failed" } };
        if (table === "teams") {
          const data = currentRoster && filters.draft_id === "academy-draft" ? [{ id: "team-bears", name: "Bears", division: "Lunari" }] : [];
          return { data: data.slice(from, to + 1), error: null };
        }
        if (table === "players") {
          const data = currentRoster && filters.draft_id === "academy-draft" ? [{ display_name: "A0", team_id: "team-bears" }] : [];
          return { data: data.slice(from, to + 1), error: null };
        }
        if (table === "roster_memberships") {
          const data = currentRoster ? [{
            riot_accounts: { game_name: "A0", tag_line: "NA1" },
            league_teams: { name: "Bears" },
          }] : [];
          return {
            data: data.slice(from, to + 1),
            error: null,
          };
        }
        const count = table === "raw_stats" ? 2350 : 2;
        // Simulate a server configured with a lower-than-requested cap.
        const data = Array.from({length: count}, (_, id) => ({
          id,
          ...(currentRoster && table === "raw_stats" && id === 0 ? { summoner_name: "A0", tag: "NA1" } : {}),
        }));
        return { data: data.slice(from, Math.min(to + 1, from + 500)), error: null };
      },
    }; return query;
  }};
  return { db: db as unknown as SupabaseClient, calls };
}
describe("season-end data loading", () => {
  it("reads all pages using stable order and scopes every query", async () => {
    const {db, calls} = client();
    await loadSeasonEnd(db, "academy", "A1");
    const [rows, fixtures, season, league] = derive.mock.lastCall!;
    expect(rows).toHaveLength(2350); expect(fixtures).toHaveLength(2);
    expect([season, league]).toEqual(["A1", "academy"]);
    const seasonDataCalls = calls.filter((call) => call.table === "raw_stats" || call.table === "fixtures");
    expect(seasonDataCalls.every(c => c.filters.season === "A1" && c.order === "id")).toBe(true);
    expect(calls.filter(c => c.table === "raw_stats").every(c => c.filters.season_phase === "Regular")).toBe(true);
    expect(calls.filter(c => c.table === "raw_stats").map(c => c.from)).toEqual([0,500,1000,1500,2000,2350]);
  });
  it("passes the current roster division map to season-end derivation", async () => {
    derive.mockClear();
    await loadSeasonEnd(client(false, true).db, "academy", "A1");
    const options = derive.mock.lastCall?.[4] as { currentPlayerDivisions: Map<string, string> };
    expect(options.currentPlayerDivisions.get("a0#na1")).toBe("Lunari");
  });
  it("fails the whole read if a later page fails", async () => {
    derive.mockClear();
    await expect(loadSeasonEnd(client(true).db, "premier", "S5")).rejects.toThrow("Read failed");
    expect(derive).not.toHaveBeenCalled();
  });
  it("rejects a cross-league season before querying", async () => {
    const {db,calls} = client();
    await expect(loadSeasonEnd(db, "academy", "S5")).rejects.toThrow(/belong/);
    expect(calls).toHaveLength(0);
  });
});
