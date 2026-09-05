import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => harness.client }));
import { GET } from "./route";

it("pages player identities and fetches both leagues' teams in one request", async () => {
  const urls: URL[] = [];
  harness.client = createClient("http://127.0.0.1:54321", "test-anon", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        let data: unknown;
        if (url.pathname.endsWith("stats_player_agg")) {
          data = url.searchParams.get("offset") === "1000"
            ? [{ summoner_name: "Shared", tag: "B" }]
            : Array.from({ length: 1000 }, () => ({ summoner_name: "Shared", tag: "A" }));
        } else if (url.pathname.endsWith("league_settings")) {
          data = { featured_draft_id: "premier-id", academy_draft_id: "academy-id" };
        } else {
          data = [{ name: "Main Team", draft_id: "premier-id" }, { name: "Academy Team", draft_id: "academy-id" }];
        }
        return new Response(JSON.stringify(data), { status: 200 });
      },
    },
  });
  const result = await (await GET()).json();
  expect(result.players).toHaveLength(2);
  expect(result.players.map((player: { hint: string }) => player.hint)).toEqual(["#A", "#B"]);
  expect(result.teams.map((team: { href: string }) => team.href)).toEqual(["/teams/main-team", "/academy/teams/academy-team"]);
  const teamQueries = urls.filter((url) => url.pathname.endsWith("/teams"));
  expect(teamQueries).toHaveLength(1);
  expect(teamQueries[0].searchParams.get("draft_id")).toBe("in.(premier-id,academy-id)");
});
