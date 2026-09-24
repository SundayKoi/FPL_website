import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// leagueSweep.ts is `import "server-only"` (it posts to Discord); vitest
// resolves that package's throwing default export, so stub it, as
// runs.test.ts does.
vi.mock("server-only", () => ({}));

const { postCardsWebhook } = vi.hoisted(() => ({ postCardsWebhook: vi.fn() }));
vi.mock("@/lib/packs/announce", () => ({ postCardsWebhook, GOLD: 0xe8c14b, LIVE_RED: 0xff5063 }));

const { sweepLeagueGoals, leagueFallEmbed } = await import("./leagueSweep");
const { leagueGoalFor } = await import("./league");

// Wednesday 23 September 2026: this week is the 21st, last week the 14th.
const NOW = new Date("2026-09-23T16:00:00Z");
const THIS_WEEK = "2026-09-21";
const LAST_WEEK = "2026-09-14";

type Row = { season: string; week_start: string; discord_id: string; username: string; miles: number; pushes: number };
type RpcArgs = { p_season: string; p_week: string; p_kind: string; p_target: number };
type RpcReply = { data?: unknown; error?: { message: string } | null };

/** The service client as the sweep uses it: the view and fixtures reads,
 *  and the one RPC. Every call is recorded. */
function createService({
  progress,
  progressError = null,
  fixtures = [],
  rpc = () => ({ data: [{ fell: true, rewarded: 2, top_id: "ann" }] }),
}: {
  progress: Row[];
  progressError?: { message: string } | null;
  fixtures?: { team_a: string | null; team_b: string | null; scheduled_at: string; season: string }[];
  rpc?: (args: RpcArgs) => RpcReply;
}) {
  const reads: { table: string; filters: Record<string, unknown> }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: {} as Record<string, unknown> };
    reads.push(call);
    const result = () =>
      table === "expedition_league_progress"
        ? { data: progressError ? null : progress, error: progressError }
        : table === "fixtures"
          ? { data: fixtures, error: null }
          : { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      in: (column: string, value: unknown) => {
        call.filters[`${column} in`] = value;
        return builder;
      },
      gte: () => builder,
      lt: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return builder;
  });
  const rpcMock = vi.fn(async (name: string, args: RpcArgs) => {
    if (name !== "fell_expedition_league_goal") return { data: null, error: { message: `unexpected rpc ${name}` } };
    const reply = rpc(args);
    return { data: reply.data ?? null, error: reply.error ?? null };
  });
  return { client: { from, rpc: rpcMock } as unknown as SupabaseClient, reads, rpc: rpcMock };
}

/** Rows that put `total` of the week's own unit toward the goal. */
function walked(season: string, week: string, entries: [string, number][]): Row[] {
  const goal = leagueGoalFor(season, week, []);
  return entries.map(([who, n]) => ({
    season,
    week_start: week,
    discord_id: who,
    username: who.toUpperCase(),
    miles: goal.unit === "miles" ? n : 0,
    pushes: goal.unit === "pushes" ? n : 0,
  }));
}

beforeEach(() => {
  postCardsWebhook.mockReset();
  postCardsWebhook.mockResolvedValue(undefined);
});

describe("sweepLeagueGoals", () => {
  it("reads every season's this week and last, and asks nothing while no goal is reached", async () => {
    const service = createService({ progress: walked("S5", THIS_WEEK, [["ann", 3], ["bo", 4]]) });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result).toEqual({ checked: 1, fell: 0, rewarded: 0, errors: [] });
    expect(service.reads[0]).toEqual({ table: "expedition_league_progress", filters: { "week_start in": [THIS_WEEK, LAST_WEEK] } });
    expect(service.rpc).not.toHaveBeenCalled();
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });

  it("asks the RPC to fell a reached goal with the week's own kind and size, and announces the fall once", async () => {
    const goal = leagueGoalFor("S5", LAST_WEEK, []);
    const service = createService({
      progress: walked("S5", LAST_WEEK, [["ann", goal.target - 5], ["bo", 5]]),
      fixtures: [{ team_a: "Lions", team_b: "Tigers", scheduled_at: "2026-09-15T00:00:00Z", season: "S5" }],
      rpc: () => ({ data: [{ fell: true, rewarded: 2, top_id: "ann" }] }),
    });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result).toEqual({ checked: 1, fell: 1, rewarded: 2, errors: [] });
    expect(service.rpc).toHaveBeenCalledTimes(1);
    expect(service.rpc).toHaveBeenCalledWith("fell_expedition_league_goal", {
      p_season: "S5",
      p_week: LAST_WEEK,
      p_kind: goal.kind,
      p_target: goal.target,
    });
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    const embed = postCardsWebhook.mock.calls[0][0] as { title: string; description: string };
    expect(embed.title).toContain(goal.kind === "landmark" ? "The Lions–Tigers Ridge" : "The Tigers Colossus");
    expect(embed.title).toContain("(S5)");
    expect(embed.description).toContain(`the goal was ${goal.target}`);
    expect(embed.description).toContain("each of the 2 collectors");
    expect(embed.description).toContain("<@ann>");
  });

  it("stays quiet about a goal that fell on an earlier pass", async () => {
    const goal = leagueGoalFor("S5", THIS_WEEK, []);
    const service = createService({
      progress: walked("S5", THIS_WEEK, [["ann", goal.target]]),
      rpc: () => ({ data: [{ fell: true, rewarded: 0, top_id: "ann" }] }),
    });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result).toEqual({ checked: 1, fell: 0, rewarded: 0, errors: [] });
    expect(service.rpc).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });

  it("keeps the leagues apart: one league's walking never tips the other's goal", async () => {
    const premier = leagueGoalFor("S5", THIS_WEEK, []);
    const academy = leagueGoalFor("A1", THIS_WEEK, []);
    // Premier reached; Academy one short — and Academy's collector also
    // walked plenty for Premier, which must not count for Academy.
    const progress = [
      ...walked("S5", THIS_WEEK, [["ann", premier.target], ["dee", 20]]),
      ...walked("A1", THIS_WEEK, [["dee", academy.target - 1]]),
    ];
    const service = createService({ progress });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result.checked).toBe(2);
    expect(service.rpc).toHaveBeenCalledTimes(1);
    expect(service.rpc.mock.calls[0][1]).toMatchObject({ p_season: "S5", p_week: THIS_WEEK });
  });

  it("reports and skips when the league view is not there yet (the migration unapplied)", async () => {
    const service = createService({ progress: [], progressError: { message: 'relation "public.expedition_league_progress" does not exist' } });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result).toEqual({
      checked: 0,
      fell: 0,
      rewarded: 0,
      errors: ['league: relation "public.expedition_league_progress" does not exist'],
    });
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it("reports an RPC refusal and carries on to the next goal", async () => {
    const thisGoal = leagueGoalFor("S5", THIS_WEEK, []);
    const lastGoal = leagueGoalFor("S5", LAST_WEEK, []);
    const service = createService({
      progress: [...walked("S5", THIS_WEEK, [["ann", thisGoal.target]]), ...walked("S5", LAST_WEEK, [["bo", lastGoal.target]])],
      rpc: (args) =>
        args.p_week === LAST_WEEK
          ? { error: { message: "Could not find the function public.fell_expedition_league_goal" } }
          : { data: [{ fell: true, rewarded: 1, top_id: "ann" }] },
    });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(service.rpc).toHaveBeenCalledTimes(2);
    expect(result.fell).toBe(1);
    expect(result.rewarded).toBe(1);
    expect(result.errors).toEqual([`league S5 ${LAST_WEEK}: Could not find the function public.fell_expedition_league_goal`]);
  });

  it("does not count a goal the RPC's own recount says still stands", async () => {
    const goal = leagueGoalFor("S5", THIS_WEEK, []);
    const service = createService({
      progress: walked("S5", THIS_WEEK, [["ann", goal.target]]),
      rpc: () => ({ data: [{ fell: false, rewarded: 0, top_id: null }] }),
    });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result).toEqual({ checked: 1, fell: 0, rewarded: 0, errors: [] });
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });

  it("a Discord failure is reported, never undoes the fall", async () => {
    postCardsWebhook.mockRejectedValue(new Error("webhook down"));
    const goal = leagueGoalFor("S5", THIS_WEEK, []);
    const service = createService({ progress: walked("S5", THIS_WEEK, [["ann", goal.target]]) });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result.fell).toBe(1);
    expect(result.errors).toEqual([`league announce S5 ${THIS_WEEK}: webhook down`]);
  });

  it("ignores a row outside the two weeks it watches", async () => {
    const service = createService({ progress: walked("S5", "2026-09-07", [["ann", 999]]) });
    const result = await sweepLeagueGoals(service.client, NOW);
    expect(result.checked).toBe(0);
    expect(service.rpc).not.toHaveBeenCalled();
  });
});

describe("leagueFallEmbed", () => {
  it("names the goal, the season, the count and the Vanguard", () => {
    const landmark = { ...leagueGoalFor("S5", THIS_WEEK, []), kind: "landmark" as const, unit: "miles" as const, target: 40, title: "The Cairn of the Week" };
    expect(leagueFallEmbed(landmark, 43, 12, "ann")).toEqual({
      title: "League goal reached — The Cairn of the Week (S5)",
      description:
        "The league walked 43 miles this week — the goal was 40. A map fragment to each of the 12 collectors who helped. <@ann> did the most and is the week's Vanguard.",
      color: 0xe8c14b,
    });
    const boss = { ...landmark, kind: "boss" as const, unit: "pushes" as const, target: 24, title: "The Tigers Colossus" };
    expect(leagueFallEmbed(boss, 24, 1, null).description).toBe(
      "The league landed 24 pushes this week — the goal was 24. A map fragment to the 1 collector who helped.",
    );
    expect(leagueFallEmbed(boss, 24, 1, null).title).toBe("League goal brought down — The Tigers Colossus (S5)");
  });
});
