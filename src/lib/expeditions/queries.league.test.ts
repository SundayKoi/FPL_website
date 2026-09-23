import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLeagueBoard, fetchLeagueFixtures, fetchLeagueGoals, fetchLeagueProgress } from "./queries";

// The league goal's reads (20261103000001), kept apart from queries.test.ts
// so the phases that share queries.ts do not share a test file too.

type QueryCall = { table: string; columns?: string; filters: Record<string, unknown>; order?: string; limit?: number };
type Respond = (call: QueryCall) => { data?: unknown; error?: unknown };

/** A chainable, awaitable PostgREST stand-in that records every filter,
 *  so a test can prove a read is scoped to its league and its weeks. */
function createClient(respond: Respond) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: {} };
    calls.push(call);
    const settle = () => {
      const result = respond(call) ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    };
    const builder = {
      select: (columns: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown) => {
        call.filters[`${column} in`] = values;
        return builder;
      },
      gte: (column: string, value: unknown) => {
        call.filters[`${column}>=`] = value;
        return builder;
      },
      lt: (column: string, value: unknown) => {
        call.filters[`${column}<`] = value;
        return builder;
      },
      order: (column: string) => {
        call.order = column;
        return builder;
      },
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

const WEEKS = ["2026-09-21", "2026-09-14"];

describe("fetchLeagueProgress", () => {
  it("reads one league's weeks off the view and maps the rows", async () => {
    const { client, calls } = createClient(() => ({
      data: [
        { season: "S5", week_start: "2026-09-21", discord_id: "ann", username: "Ann", miles: 6, pushes: 2 },
        { season: "S5", week_start: "2026-09-14", discord_id: "bo", username: null, miles: null, pushes: null },
      ],
    }));
    await expect(fetchLeagueProgress(client, "S5", WEEKS)).resolves.toEqual([
      { season: "S5", weekStart: "2026-09-21", discordId: "ann", username: "Ann", miles: 6, pushes: 2 },
      { season: "S5", weekStart: "2026-09-14", discordId: "bo", username: "Unknown", miles: 0, pushes: 0 },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("expedition_league_progress");
    expect(calls[0].filters).toEqual({ season: "S5", "week_start in": WEEKS });
  });

  it("reads every season when asked for none (the sweep)", async () => {
    const { client, calls } = createClient(() => ({ data: [] }));
    await expect(fetchLeagueProgress(client, null, WEEKS)).resolves.toEqual([]);
    expect(calls[0].filters).toEqual({ "week_start in": WEEKS });
  });

  it("is null — hidden — when the view cannot be read, and says why to whoever asks", async () => {
    const { client } = createClient(() => ({ error: { message: 'relation "public.expedition_league_progress" does not exist' } }));
    const onError = vi.fn();
    await expect(fetchLeagueProgress(client, "S5", WEEKS, onError)).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith('relation "public.expedition_league_progress" does not exist');
    await expect(fetchLeagueProgress(client, "S5", WEEKS)).resolves.toBeNull();
  });

  it("asks nothing for no weeks", async () => {
    const { client, calls } = createClient(() => ({ data: [] }));
    await expect(fetchLeagueProgress(client, "S5", [])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("fetchLeagueGoals", () => {
  it("reads the goals that fell with who was paid, each reward on its own league's goal", async () => {
    const { client, calls } = createClient((call) => {
      if (call.table === "expedition_league_goals") {
        return {
          data: [
            { season: "S5", week_start: "2026-09-14", kind: "boss", target: 24, fell_at: "2026-09-17T18:00:00Z", top_id: "bo" },
            { season: "S5", week_start: "2026-09-21", kind: "dragon", target: 5, fell_at: "2026-09-22T18:00:00Z", top_id: null },
          ],
        };
      }
      return {
        data: [
          { season: "S5", week_start: "2026-09-14", discord_id: "bo", fragments: 1, top: true },
          { season: "S5", week_start: "2026-09-14", discord_id: "ann", fragments: 1, top: false },
          // A stray row from the other league's same week is not this goal's.
          { season: "A1", week_start: "2026-09-14", discord_id: "cy", fragments: 1, top: true },
        ],
      };
    });
    await expect(fetchLeagueGoals(client, "S5", WEEKS)).resolves.toEqual([
      {
        season: "S5",
        weekStart: "2026-09-14",
        kind: "boss",
        target: 24,
        fellAt: "2026-09-17T18:00:00Z",
        topId: "bo",
        rewards: [
          { discordId: "bo", fragments: 1, top: true },
          { discordId: "ann", fragments: 1, top: false },
        ],
      },
    ]);
    expect(calls.map((call) => call.table)).toEqual(["expedition_league_goals", "expedition_league_rewards"]);
    expect(calls[0].filters).toEqual({ season: "S5", "week_start in": WEEKS });
    expect(calls[1].filters).toEqual({ season: "S5", "week_start in": ["2026-09-14"] });
  });

  it("is an empty list, without a rewards read, when nothing has fallen", async () => {
    const { client, calls } = createClient(() => ({ data: [] }));
    await expect(fetchLeagueGoals(client, "S5", WEEKS)).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("is null when the goals cannot be read, and keeps a fallen goal when only the rewards cannot", async () => {
    const broken = createClient(() => ({ error: { message: "missing" } }));
    await expect(fetchLeagueGoals(broken.client, "S5", WEEKS)).resolves.toBeNull();

    const halfBroken = createClient((call) =>
      call.table === "expedition_league_goals"
        ? { data: [{ season: "S5", week_start: "2026-09-14", kind: "landmark", target: 40, fell_at: "2026-09-17T18:00:00Z", top_id: "bo" }] }
        : { error: { message: "missing" } },
    );
    const goals = await fetchLeagueGoals(halfBroken.client, "S5", WEEKS);
    expect(goals).toHaveLength(1);
    expect(goals![0].rewards).toEqual([]);
  });
});

describe("fetchLeagueFixtures", () => {
  it("reads a day either side of the weeks in UTC, for one league", async () => {
    const { client, calls } = createClient(() => ({ data: [{ team_a: "Lions", team_b: "Tigers", scheduled_at: "2026-09-22T00:00:00Z", season: "S5" }] }));
    await expect(fetchLeagueFixtures(client, "S5", WEEKS)).resolves.toHaveLength(1);
    expect(calls[0].table).toBe("fixtures");
    expect(calls[0].filters).toEqual({
      "scheduled_at>=": "2026-09-13T00:00:00.000Z",
      "scheduled_at<": "2026-09-29T00:00:00.000Z",
      season: "S5",
    });
    expect(calls[0].columns).toContain("season");
  });

  it("fails soft to none", async () => {
    const { client } = createClient(() => ({ error: { message: "down" } }));
    await expect(fetchLeagueFixtures(client, null, WEEKS)).resolves.toEqual([]);
  });
});

describe("fetchLeagueBoard", () => {
  it("builds the board from its own league's reads", async () => {
    const { client, calls } = createClient((call) => {
      if (call.table === "expedition_league_progress") {
        return { data: [{ season: "S5", week_start: "2026-09-21", discord_id: "ann", username: "Ann", miles: 6, pushes: 6 }] };
      }
      return { data: [] };
    });
    const board = await fetchLeagueBoard(client, "S5", "ann", new Date("2026-09-23T16:00:00Z"));
    expect(board?.season).toBe("S5");
    expect(board?.thisWeek.goal.weekStart).toBe("2026-09-21");
    expect(board?.thisWeek.progress.total).toBe(6);
    expect(board?.thisWeek.me).toEqual({ stat: 6, rank: 1, of: 1 });
    for (const call of calls) expect(call.filters.season).toBe("S5");
  });

  it("is null — the panel hidden — before the migration", async () => {
    const { client } = createClient((call) =>
      call.table === "fixtures" ? { data: [] } : { error: { message: "relation does not exist" } },
    );
    await expect(fetchLeagueBoard(client, "S5", "ann", new Date("2026-09-23T16:00:00Z"))).resolves.toBeNull();
  });
});
