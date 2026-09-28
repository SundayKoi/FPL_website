import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { homeRedirect, leagueChoiceCookie, parseLeagueChoice, teamLeague } from "./preference";

type Tables = {
  user?: { id: string } | null;
  links?: { league: string; season: string; league_team_id: string | null }[];
  captains?: { season: string }[];
  fail?: boolean;
};

function client({ user = { id: "u1" }, links = [], captains = [], fail = false }: Tables = {}): SupabaseClient {
  const settings = { current_season: "S6", academy_season: "A2" };
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      const data = table === "league_settings" ? settings : table === "player_identity_links" ? links : captains;
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data, error: fail ? { message: "down" } : null });
      chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data, error: fail ? { message: "down" } : null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("teamLeague", () => {
  it("names Academy for a player on an Academy team this season", async () => {
    expect(await teamLeague(client({ links: [{ league: "academy", season: "A2", league_team_id: "t1" }] }))).toBe("academy");
  });

  it("names Academy for an Academy captain", async () => {
    expect(await teamLeague(client({ captains: [{ season: "A2" }] }))).toBe("academy");
  });

  it("prefers Premier for someone on both", async () => {
    expect(
      await teamLeague(client({ links: [{ league: "academy", season: "A2", league_team_id: "t1" }, { league: "premier", season: "S6", league_team_id: "t2" }] })),
    ).toBe("premier");
  });

  it("ignores last season's team and an unrostered link", async () => {
    expect(await teamLeague(client({ links: [{ league: "academy", season: "A1", league_team_id: "t1" }] }))).toBeNull();
    expect(await teamLeague(client({ links: [{ league: "academy", season: "A2", league_team_id: null }] }))).toBeNull();
  });

  it("stays out of the way when signed out or when a read fails", async () => {
    expect(await teamLeague(client({ user: null }))).toBeNull();
    expect(await teamLeague(client({ links: [{ league: "academy", season: "A2", league_team_id: "t1" }], fail: true }))).toBeNull();
  });
});

describe("homeRedirect", () => {
  const academyPlayer = client({ links: [{ league: "academy", season: "A2", league_team_id: "t1" }] });

  it("sends an Academy player to the Academy home when they have not chosen", async () => {
    expect(await homeRedirect(undefined, academyPlayer)).toBe("/academy");
  });

  it("lets an explicit choice win in either direction", async () => {
    expect(await homeRedirect("premier", academyPlayer)).toBeNull();
    expect(await homeRedirect("academy", client({ user: null }))).toBe("/academy");
  });

  it("keeps everyone else on the Premier home", async () => {
    expect(await homeRedirect(undefined, client({ user: null }))).toBeNull();
    expect(await homeRedirect("nonsense", client())).toBeNull();
  });
});

describe("the league cookie", () => {
  it("parses only the two leagues", () => {
    expect(parseLeagueChoice("academy")).toBe("academy");
    expect(parseLeagueChoice("premier")).toBe("premier");
    expect(parseLeagueChoice("ACADEMY")).toBeNull();
    expect(parseLeagueChoice(undefined)).toBeNull();
  });

  it("lasts a year across the whole site", () => {
    expect(leagueChoiceCookie("academy")).toBe("fpl_league=academy; path=/; max-age=31536000; samesite=lax");
  });
});
