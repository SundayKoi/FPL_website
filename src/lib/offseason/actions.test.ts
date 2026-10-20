import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, revalidatePath, loadOffseason } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  revalidatePath: vi.fn(),
  loadOffseason: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./queries", () => ({ loadOffseason }));

const ingestRun = vi.hoisted(() => ({
  latestIngestRun: vi.fn(),
  startIngest: vi.fn(),
  IngestError: class IngestError extends Error {},
  INGEST_WORKFLOW_URL: "https://github.com/workflow",
}));
vi.mock("./ingestRun", () => ingestRun);

import {
  addMatchCodesAction,
  createMatchesAction,
  createWeekDraftAction,
  importWeekDraftAction,
  ingestStatusAction,
  lockInAction,
  openOffseasonPackAction,
  removeMatchCodeAction,
  runIngestAction,
  setMvpNomineesAction,
  setGameAction,
  setLockInAction,
  signCardAction,
  signUpAction,
  setWeekStatusAction,
  updateEventAction,
  voteMvpAction,
} from "./actions";

type Result = { data?: unknown; error: { message: string; code?: string } | null };

function client({ rpc = { error: null } as Result, write = { error: null } as Result, lastSortOrder = null as number | null } = {}) {
  const rpcFn = vi.fn(async () => rpc);
  const insert = vi.fn(async () => write);
  const eq = vi.fn(async () => write);
  const update = vi.fn(() => ({ eq }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: lastSortOrder === null ? null : { sort_order: lastSortOrder }, error: null })),
    insert,
    update,
  };
  const from = vi.fn(() => query);
  createServerSupabase.mockResolvedValue({ rpc: rpcFn, from });
  return { rpcFn, from, insert, update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** A client whose reads answer per table, recording what gets inserted. */
function tableClient(tables: Record<string, unknown>, rpc: Result = { error: null }) {
  const inserted: { table: string; rows: unknown }[] = [];
  const from = vi.fn((table: string) => {
    const result = { data: tables[table] ?? null, error: null };
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      insert: vi.fn(async (rows: unknown) => {
        inserted.push({ table, rows });
        return { error: null };
      }),
    };
    for (const method of ["select", "eq", "order", "limit"]) query[method] = vi.fn(() => query);
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    return query;
  });
  createServerSupabase.mockResolvedValue({ rpc: vi.fn(async () => rpc), from });
  return { inserted };
}

describe("offseason server actions", () => {
  it("signs up through the RPC and refreshes the offseason pages", async () => {
    const { rpcFn } = client();
    const result = await signUpAction({
      eventId: "event-1",
      displayName: "Faker",
      riotId: "Hide on bush#KR1",
      opggUrl: "",
      currentRank: "Challenger",
      primaryRole: "mid",
      secondaryRole: null,
    });
    expect(result).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_sign_up", {
      p_event_id: "event-1",
      p_display_name: "Faker",
      p_riot_id: "Hide on bush#KR1",
      p_opgg_url: "",
      p_current_rank: "Challenger",
      p_primary_role: "mid",
      p_secondary_role: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");
  });

  it("turns a coded RPC error into its message", async () => {
    client({ rpc: { error: { message: "RIOT_ID_TAKEN: that Riot ID is already signed up" } } });
    const result = await setGameAction("match-1", 1, "NA1_123", null);
    expect(result).toEqual({ ok: false, error: "that Riot ID is already signed up" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains a row-level security refusal", async () => {
    client({ write: { error: { message: 'new row violates row-level security policy for table "offseason_events"', code: "42501" } } });
    const result = await updateEventAction("event-1", { signups_open: false });
    expect(result).toEqual({ ok: false, error: "Only offseason staff can do that." });
  });

  it("locks in through the RPC, claiming by Riot ID only when one is given", async () => {
    const { rpcFn } = client();
    expect(await lockInAction({ eventId: "event-1", role: "top" })).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenLastCalledWith("offseason_lock_in", { p_event_id: "event-1", p_role: "top", p_riot_id: null });
    await lockInAction({ eventId: "event-1", role: "top", riotId: " Pat Doe#NA1 " });
    expect(rpcFn).toHaveBeenLastCalledWith("offseason_lock_in", { p_event_id: "event-1", p_role: "top", p_riot_id: "Pat Doe#NA1" });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");
  });

  it("lets staff record or clear a lock-in", async () => {
    const { update, eq } = client();
    await setLockInAction("entrant-1", "mid");
    expect(update).toHaveBeenLastCalledWith({ locked_in_role: "mid", locked_in_at: expect.any(String) });
    expect(eq).toHaveBeenLastCalledWith("id", "entrant-1");
    await setLockInAction("entrant-1", null);
    expect(update).toHaveBeenLastCalledWith({ locked_in_role: null, locked_in_at: null });
  });

  it("creates a week's draft with no round minimums and a cost per captain", async () => {
    const { rpcFn } = client();
    expect(await createWeekDraftAction("week-1", "main", { budget: 100, countdownSeconds: 15, captainCosts: { a: 20, b: 12 } })).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_create_week_draft", {
      p_week_id: "week-1",
      p_tier: "main",
      p_budget: 100,
      p_countdown_seconds: 15,
      p_round_minimums: [1],
      p_captain_costs: { a: 20, b: 12 },
    });
  });

  it("numbers new matches after the week's last one", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const { insert } = client({ lastSortOrder: 4 });
    const result = await createMatchesAction("week-1", "round_robin", 1, [
      { teamA: "a", teamB: "b" },
      { teamA: "c", teamB: "d" },
    ]);
    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith([
      { week_id: "week-1", stage: "round_robin", best_of: 1, team_a_id: "a", team_b_id: "b", sort_order: 5 },
      { week_id: "week-1", stage: "round_robin", best_of: 1, team_a_id: "c", team_b_id: "d", sort_order: 6 },
    ]);
  });

  it("puts each new match on random sides", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { insert } = client();
    await createMatchesAction("week-1", "final", 5, [{ teamA: "a", teamB: "b" }]);
    expect(insert).toHaveBeenCalledWith([{ week_id: "week-1", stage: "final", best_of: 5, team_a_id: "b", team_b_id: "a", sort_order: 1 }]);
  });

  it("schedules a tier as soon as its teams are imported", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const { inserted } = tableClient({
      offseason_weeks: { week_number: 3, elimination_draft_id: "draft-e" },
      offseason_teams: [
        { id: "m1", tier: "main" },
        { id: "e1", tier: "elimination" },
        { id: "e2", tier: "elimination" },
        { id: "e3", tier: "elimination" },
        { id: "e4", tier: "elimination" },
      ],
      offseason_matches: [],
    });
    expect(await importWeekDraftAction("week-1", "elimination")).toEqual({ ok: true });
    expect(inserted).toEqual([
      {
        table: "offseason_matches",
        rows: [
          { week_id: "week-1", stage: "elimination", best_of: 5, team_a_id: "e1", team_b_id: "e2", sort_order: 1 },
          { week_id: "week-1", stage: "elimination", best_of: 5, team_a_id: "e3", team_b_id: "e4", sort_order: 2 },
        ],
      },
    ]);
  });

  it("does not schedule a tier twice, and reports a failed import", async () => {
    const { inserted } = tableClient({
      offseason_weeks: { week_number: 1, elimination_draft_id: null },
      offseason_teams: [
        { id: "m1", tier: "main" },
        { id: "m2", tier: "main" },
      ],
      offseason_matches: [{ stage: "round_robin" }],
    });
    expect(await importWeekDraftAction("week-1", "main")).toEqual({ ok: true });
    expect(inserted).toEqual([]);

    tableClient({}, { error: { message: "DRAFT_NOT_FINISHED: every team needs all five roles first" } });
    expect(await importWeekDraftAction("week-1", "main")).toEqual({ ok: false, error: "every team needs all five roles first" });
  });
});

describe("offseason card sets and packs", () => {
  /** Completing or reopening a week: update(...).eq(...).select(...).single(). */
  function weekClient(rpc: Result = { error: null }) {
    const single = vi.fn(async () => ({ data: { event_id: "event-1", week_number: 2 }, error: null }));
    const eq = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const update = vi.fn(() => ({ eq }));
    const rpcFn = vi.fn(async () => rpc);
    createServerSupabase.mockResolvedValue({ rpc: rpcFn, from: vi.fn(() => ({ update })) });
    return { rpcFn, update };
  }

  const view = {
    event: { id: "event-1" },
    entrants: [{ id: "rated" }, { id: "unrated" }],
    ratings: new Map([
      ["rated", { card: { name: "Rated", tag: "NA1", season: "S6", shiny: true, autograph: "ink" } }],
      ["unrated", { card: null }],
    ]),
  };

  it("publishes the week's set when the week completes, without finishes", async () => {
    const { rpcFn, update } = weekClient();
    loadOffseason.mockResolvedValue(view);
    expect(await setWeekStatusAction("week-2", "complete")).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ status: "complete" });
    expect(rpcFn).toHaveBeenCalledWith("offseason_publish_card_set", {
      p_event_id: "event-1",
      p_week_number: 2,
      p_cards: [{ entrant_id: "rated", card: { name: "Rated", tag: "NA1", season: "Offseason", shiny: null, autograph: null } }],
    });
  });

  it("still completes the week when its cards can't publish, and says so", async () => {
    weekClient({ error: { message: "CARDS_EMPTY: nobody has a rated game yet" } });
    loadOffseason.mockResolvedValue(view);
    const result = await setWeekStatusAction("week-2", "complete");
    expect(result).toEqual({
      ok: false,
      error: "Week complete, but its cards weren't published: nobody has a rated game yet. Use Publish cards to try again.",
    });
  });

  it("does not publish when a week is reopened", async () => {
    const { rpcFn } = weekClient();
    expect(await setWeekStatusAction("week-2", "playing")).toEqual({ ok: true });
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it("opens a pack and hands back its copies with the week they came from", async () => {
    const { rpcFn } = client({
      rpc: {
        data: { week_number: 1, remaining: 1900, cards: [{ id: 7, slot: 1, foil: true, shiny: false, signed: true, card: { name: "Rated" } }] },
        error: null,
      },
    });
    const result = await openOffseasonPackAction("request-1");
    expect(rpcFn).toHaveBeenCalledWith("offseason_open_pack", { p_request_id: "request-1" });
    expect(result).toEqual({
      ok: true,
      remaining: 1900,
      weekNumber: 1,
      copies: [{ id: 7, slot: 1, foil: true, shiny: false, signed: true, card: { name: "Rated" }, weekNumber: 1 }],
    });
  });

  it("says why a pack won't open", async () => {
    client({ rpc: { error: { message: "ALLOWANCE_SPENT: this week's $2,000 is spent; it resets on Monday" } } });
    expect(await openOffseasonPackAction("request-2")).toEqual({ ok: false, error: "this week's $2,000 is spent; it resets on Monday" });
  });
});

describe("offseason card signing and MVP votes", () => {
  const INK = "data:image/png;base64,iVBORw0KGgo=";

  it("signs the player's card, claiming by Riot ID when one is given", async () => {
    const { rpcFn } = client();
    expect(await signCardAction({ eventId: "event", signature: INK, riotId: " Claimer#OS1 " })).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_sign_card", { p_event_id: "event", p_signature: INK, p_riot_id: "Claimer#OS1" });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");

    await signCardAction({ eventId: "event", signature: INK });
    expect(rpcFn).toHaveBeenLastCalledWith("offseason_sign_card", { p_event_id: "event", p_signature: INK, p_riot_id: null });
  });

  it("never sends anything but a PNG data URL", async () => {
    const { rpcFn } = client();
    expect(await signCardAction({ eventId: "event", signature: "javascript:alert(1)" })).toEqual({ ok: false, error: "Draw your signature again." });
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it("casts a vote and shows the database's reason when it refuses", async () => {
    const { rpcFn } = client();
    expect(await voteMvpAction("week", "entrant")).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_vote_mvp", { p_week_id: "week", p_entrant_id: "entrant" });

    client({ rpc: { error: { message: "SELF_VOTE: you can't vote for yourself" } } });
    expect(await voteMvpAction("week", "me")).toEqual({ ok: false, error: "you can't vote for yourself" });
  });
});

describe("offseason tournament codes", () => {
  it("adds codes through the RPC and reports where they went", async () => {
    const { rpcFn } = client({ rpc: { data: { added: 18, skipped: 0, assigned: 12, pooled: 6 }, error: null } });
    expect(await addMatchCodesAction("event", ["NA0-a", "NA0-b"])).toEqual({ ok: true, added: 18, skipped: 0, assigned: 12, pooled: 6 });
    expect(rpcFn).toHaveBeenCalledWith("offseason_add_match_codes", { p_event_id: "event", p_codes: ["NA0-a", "NA0-b"] });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");

    client({ rpc: { error: { message: "NOT_ADMIN: offseason staff access required" } } });
    expect(await addMatchCodesAction("event", ["NA0-a"])).toEqual({ ok: false, error: "offseason staff access required" });
  });

  it("removes a code through the RPC", async () => {
    const { rpcFn } = client();
    expect(await removeMatchCodeAction("code")).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_remove_match_code", { p_code_id: "code" });
  });
});

describe("offseason MVP nominees", () => {
  it("saves a week's nominees through the RPC, in order", async () => {
    const { rpcFn } = client();
    expect(await setMvpNomineesAction("week", ["c", "a", "b"])).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_set_mvp_nominees", { p_week_id: "week", p_entrant_ids: ["c", "a", "b"] });

    client({ rpc: { error: { message: "NOMINEES_INVALID: nominate two to five players" } } });
    expect(await setMvpNomineesAction("week", ["a"])).toEqual({ ok: false, error: "nominate two to five players" });
  });
});

describe("offseason Ingest now", () => {
  const finished = { id: 1, status: "completed", conclusion: "success", createdAt: "2026-10-20T03:00:00Z", url: "https://github.com/run/1" };

  beforeEach(() => {
    vi.stubEnv("GITHUB_ACTIONS_TOKEN", "tok");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("checks the caller is staff before touching GitHub", async () => {
    const { rpcFn } = client({ rpc: { data: false, error: null } });
    expect(await runIngestAction()).toEqual({ ok: false, error: "Only offseason staff can do that." });
    expect(await ingestStatusAction()).toEqual({ ok: false, error: "Only offseason staff can do that." });
    expect(rpcFn).toHaveBeenCalledWith("offseason_is_staff");

    client({ rpc: { data: null, error: { message: "boom" } } });
    expect(await runIngestAction()).toEqual({ ok: false, error: "Only offseason staff can do that." });
    expect(ingestRun.latestIngestRun).not.toHaveBeenCalled();
    expect(ingestRun.startIngest).not.toHaveBeenCalled();
  });

  it("starts a run with the server's token, but not while one is going", async () => {
    client({ rpc: { data: true, error: null } });
    ingestRun.latestIngestRun.mockResolvedValue(finished);
    expect(await runIngestAction()).toEqual({ ok: true });
    expect(ingestRun.startIngest).toHaveBeenCalledWith("tok");

    ingestRun.startIngest.mockClear();
    ingestRun.latestIngestRun.mockResolvedValue({ ...finished, id: 2, status: "queued", conclusion: null });
    expect(await runIngestAction()).toEqual({ ok: false, error: "An ingest is already running." });
    expect(ingestRun.startIngest).not.toHaveBeenCalled();
  });

  it("reports the latest run, or that the button has no token", async () => {
    client({ rpc: { data: true, error: null } });
    ingestRun.latestIngestRun.mockResolvedValue(finished);
    expect(await ingestStatusAction()).toEqual({ ok: true, configured: true, run: finished, workflowUrl: "https://github.com/workflow" });

    vi.stubEnv("GITHUB_ACTIONS_TOKEN", "");
    expect(await ingestStatusAction()).toEqual({ ok: true, configured: false, run: null, workflowUrl: "https://github.com/workflow" });
    expect(await runIngestAction()).toEqual({
      ok: false,
      error: "The Ingest now button isn't set up yet: the site needs GITHUB_ACTIONS_TOKEN.",
    });
  });

  it("words GitHub's refusals and lost connections", async () => {
    client({ rpc: { data: true, error: null } });
    ingestRun.latestIngestRun.mockRejectedValue(new ingestRun.IngestError("GitHub refused the token (401)."));
    expect(await ingestStatusAction()).toEqual({ ok: false, error: "GitHub refused the token (401)." });
    ingestRun.latestIngestRun.mockRejectedValue(new TypeError("fetch failed"));
    expect(await runIngestAction()).toEqual({ ok: false, error: "Couldn't reach GitHub. Try again in a minute." });
  });
});
