import { describe, expect, it, vi } from "vitest";
import { makeSupabaseFrom } from "@/test-utils/supabaseQuery";

// share.ts is `import "server-only"` — same stub as queries.test.ts/wallet.test.ts
// (vitest resolves that package's default "throws by design" export, not the
// "react-server" condition Next.js's bundler swaps it for).
vi.mock("server-only", () => ({}));

const fromImpl = { current: vi.fn() };
vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ from: (...args: [string]) => fromImpl.current(...args) })),
}));

import { shareModel, resultSummaryLine, resultHeadline } from "./share";

const teamA = { id: 11, name: "Alpha FC", short_code: "ALP", color: "#111111", logo_url: null };
const teamB = { id: 12, name: "Bravo United", short_code: "BRA", color: "#222222", logo_url: null };

const openMarket = {
  id: 1,
  team_a_id: 11,
  team_b_id: 12,
  title: "Matchday 1",
  status: "OPEN",
  draw_enabled: true,
  drawn: false,
  winning_team_id: null,
};

describe("shareModel", () => {
  it("returns null for an unknown market id", async () => {
    fromImpl.current = makeSupabaseFrom({ betting_markets: [{ data: null }] });
    expect(await shareModel(999)).toBeNull();
  });

  it("shapes an OPEN market's title/teams/pools with no resolve summary", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: openMarket }],
      betting_teams: [{ data: [teamA, teamB] }],
      betting_bets: [
        {
          data: [
            { discord_id: "u1", team_id: 11, is_draw: false, amount: 100, payout: null },
            { discord_id: "u2", team_id: 12, is_draw: false, amount: 40, payout: null },
          ],
        },
      ],
    });

    const model = await shareModel(1);

    expect(model).not.toBeNull();
    expect(model!.title).toBe("Matchday 1");
    expect(model!.status).toBe("OPEN");
    expect(model!.team_a).toEqual(teamA);
    expect(model!.team_b).toEqual(teamB);
    expect(model!.pool_a).toBe(100);
    expect(model!.pool_b).toBe(40);
    expect(model!.pool_draw).toBe(0);
    expect(model!.resolve).toBeNull();
  });

  it("falls back to 'A vs B' when the market has no title", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: { ...openMarket, title: null } }],
      betting_teams: [{ data: [teamA, teamB] }],
      betting_bets: [{ data: [] }],
    });

    const model = await shareModel(1);
    expect(model!.title).toBe("Alpha FC vs Bravo United");
  });

  it("computes a resolved market's winner + payout summary", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: { ...openMarket, status: "RESOLVED", winning_team_id: 11 } }],
      betting_teams: [{ data: [teamA, teamB] }],
      betting_bets: [
        {
          data: [
            { discord_id: "winner1", team_id: 11, is_draw: false, amount: 100, payout: 180 },
            { discord_id: "winner2", team_id: 11, is_draw: false, amount: 20, payout: 36 },
            { discord_id: "loser1", team_id: 12, is_draw: false, amount: 40, payout: 0 },
          ],
        },
      ],
      betting_profiles: [{ data: { username: "TopBettor" } }],
    });

    const model = await shareModel(1);

    expect(model!.resolve).not.toBeNull();
    expect(model!.resolve!.drawn).toBe(false);
    expect(model!.resolve!.winner).toEqual(teamA);
    expect(model!.resolve!.pool).toBe(160);
    expect(model!.resolve!.winners).toBe(2);
    expect(model!.resolve!.topUsername).toBe("TopBettor");
    expect(model!.resolve!.topProfit).toBe(80);
  });

  it("computes a drawn market's summary with no winning team", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: { ...openMarket, status: "RESOLVED", drawn: true, winning_team_id: null } }],
      betting_teams: [{ data: [teamA, teamB] }],
      betting_bets: [
        {
          data: [
            { discord_id: "drawbacker", team_id: null, is_draw: true, amount: 50, payout: 90 },
            { discord_id: "loser1", team_id: 11, is_draw: false, amount: 40, payout: 0 },
          ],
        },
      ],
      betting_profiles: [{ data: { username: "DrawFan" } }],
    });

    const model = await shareModel(1);

    expect(model!.resolve!.drawn).toBe(true);
    expect(model!.resolve!.winner).toBeNull();
    expect(model!.resolve!.winners).toBe(1);
    expect(model!.resolve!.topUsername).toBe("DrawFan");
    expect(model!.resolve!.topProfit).toBe(40);
  });

  it("handles a resolved market where nobody backed the winning side", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: { ...openMarket, status: "RESOLVED", winning_team_id: 11 } }],
      betting_teams: [{ data: [teamA, teamB] }],
      betting_bets: [{ data: [{ discord_id: "loser1", team_id: 12, is_draw: false, amount: 40, payout: 40 }] }],
    });

    const model = await shareModel(1);

    expect(model!.resolve!.winners).toBe(0);
    expect(model!.resolve!.topUsername).toBeNull();
    expect(model!.resolve!.topProfit).toBeNull();
    expect(model!.resolve!.winner).toEqual(teamA);
  });

  it("returns null when a team referenced by the market is missing", async () => {
    fromImpl.current = makeSupabaseFrom({
      betting_markets: [{ data: openMarket }],
      betting_teams: [{ data: [teamA] }],
    });

    expect(await shareModel(1)).toBeNull();
  });
});

describe("resultSummaryLine", () => {
  it("reports winners splitting the pool, with the top win called out", () => {
    const line = resultSummaryLine({ drawn: false, winner: teamA, pool: 160, winners: 2, topUsername: "TopBettor", topProfit: 80 });
    expect(line).toBe("2 winners split $160 — biggest win: TopBettor +$80");
  });

  it("uses singular 'winner' for exactly one", () => {
    const line = resultSummaryLine({ drawn: false, winner: teamA, pool: 90, winners: 1, topUsername: "Solo", topProfit: 40 });
    expect(line).toContain("1 winner split");
  });

  it("falls back to a refund message when nobody backed the winning side", () => {
    const line = resultSummaryLine({ drawn: false, winner: teamA, pool: 40, winners: 0, topUsername: null, topProfit: null });
    expect(line).toBe("Nobody backed the winning side — every stake was refunded.");
  });
});

describe("resultHeadline", () => {
  it("announces the winning team by name", () => {
    expect(resultHeadline({ drawn: false, winner: teamA, pool: 100, winners: 1, topUsername: null, topProfit: null })).toBe("ALPHA FC WINS");
  });

  it("announces a draw", () => {
    expect(resultHeadline({ drawn: true, winner: null, pool: 100, winners: 1, topUsername: null, topProfit: null })).toBe("IT'S A DRAW");
  });
});
