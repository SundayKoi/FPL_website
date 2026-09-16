import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  archiveEdition,
  buildEditionForWeek,
  fetchAllCardSeasons,
  fetchSeasonCards,
  fetchSeasonFixtures,
  fetchWeekCards,
  fetchWeekLineups,
  refreshHigherLowerSnapshot,
  settleGauntletWeek,
} = vi.hoisted(() => ({
  archiveEdition: vi.fn(),
  buildEditionForWeek: vi.fn(),
  fetchAllCardSeasons: vi.fn(),
  fetchSeasonCards: vi.fn(),
  fetchSeasonFixtures: vi.fn(),
  fetchWeekCards: vi.fn(),
  fetchWeekLineups: vi.fn(),
  refreshHigherLowerSnapshot: vi.fn(),
  settleGauntletWeek: vi.fn(),
}));

vi.mock("../src/lib/cards/editions", () => ({ archiveEdition }));
vi.mock("../src/lib/cards/editionBuilder", () => ({ buildEditionForWeek }));
vi.mock("../src/lib/cards/queries", () => ({
  fetchAllCardSeasons,
  fetchLatestGameWeek: vi.fn(),
  fetchSeasonCards,
  fetchSeasonFixtures,
  fetchWeekCards,
}));
vi.mock("../src/lib/fantasy/queries", () => ({
  fetchBettingUsernames: vi.fn(),
  fetchWeekLineups,
}));
vi.mock("../src/lib/gauntlet/settle", () => ({ settleGauntletWeek }));
vi.mock("../src/lib/higher-lower/snapshot", () => ({ refreshHigherLowerSnapshot }));
vi.mock("../src/lib/fantasy/scoring", () => ({
  inventoryIdsIn: vi.fn(() => []),
  scoreLineup: vi.fn(),
  weeklyScoresBySlug: vi.fn(() => new Map()),
}));
vi.mock("../src/lib/fantasy/payouts", () => ({ planPayouts: vi.fn(() => []) }));
vi.mock("../src/lib/stats/weekly", () => ({ WEEKLY_STAT_COLUMNS: [] }));
vi.mock("../src/lib/betting/match-wins", () => ({
  formatMatchWinPayouts: vi.fn(() => ""),
}));

import { processSeason, runWeeklyCardDrop, type HigherLowerRefreshFailure } from "./weekly-card-drop";

const card = {
  slug: "weekly-card",
  name: "Weekly Card",
  overall: 80,
  role: "mid",
  archetype: "carry",
  standout: false,
  tier: { label: "gold" },
};

function createSupabase(): SupabaseClient {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "in", "order", "limit", "gte", "lt", "filter"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.upsert = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: table === "fixtures" ? [] : [], error: null }).then(resolve, reject);
    return builder;
  });
  return { from, rpc: vi.fn() } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
  process.env.SKIP_INGEST_CHECK = "true";
  delete process.env.SHOWCASE;
  archiveEdition.mockReset();
  buildEditionForWeek.mockReset();
  fetchAllCardSeasons.mockReset();
  fetchSeasonCards.mockReset();
  fetchSeasonFixtures.mockReset();
  fetchWeekCards.mockReset();
  fetchWeekLineups.mockReset();
  refreshHigherLowerSnapshot.mockReset();
  settleGauntletWeek.mockReset();
  archiveEdition.mockResolvedValue({ error: null, pruned: 0 });
  buildEditionForWeek.mockResolvedValue({ kind: "weekly", cards: [card], plan: null });
  fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
  fetchSeasonCards.mockResolvedValue([card]);
  fetchSeasonFixtures.mockResolvedValue([]);
  fetchWeekCards.mockResolvedValue([card]);
  fetchWeekLineups.mockResolvedValue([]);
  refreshHigherLowerSnapshot.mockResolvedValue({ editionWeeks: ["2026-09-07"], candidateCount: 1 });
  settleGauntletWeek.mockResolvedValue({ settled: false, reason: "not settled" });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.SKIP_INGEST_CHECK;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("weekly card-drop Higher or Lower refresh", () => {
  it("refreshes immediately after a successful nonempty archive", async () => {
    const client = createSupabase();
    const failures: HigherLowerRefreshFailure[] = [];

    await processSeason(client, "premier", "S5", null, null, failures);

    expect(archiveEdition).toHaveBeenCalledOnce();
    expect(refreshHigherLowerSnapshot).toHaveBeenCalledWith(client, "premier", "S5", "2026-09-07");
    expect(failures).toEqual([]);
  });

  it("skips refresh for empty cards or an archive failure", async () => {
    const client = createSupabase();
    fetchSeasonCards.mockResolvedValueOnce([]);
    buildEditionForWeek.mockResolvedValueOnce({ kind: "weekly", cards: [], plan: null });
    await processSeason(client, "premier", "S5", null, null);
    expect(refreshHigherLowerSnapshot).not.toHaveBeenCalled();

    fetchSeasonCards.mockResolvedValue([card]);
    archiveEdition.mockResolvedValue({ error: "prune failed", pruned: 0 });
    await processSeason(client, "premier", "S5", null, null);
    expect(refreshHigherLowerSnapshot).not.toHaveBeenCalled();
  });

  it("reports a refresh failure and continues with the other league", async () => {
    const client = createSupabase();
    const failures: HigherLowerRefreshFailure[] = [];
    refreshHigherLowerSnapshot
      .mockRejectedValueOnce(new Error("snapshot RPC unavailable"))
      .mockResolvedValueOnce({ editionWeeks: ["2026-09-07"], candidateCount: 1 });

    await processSeason(client, "premier", "S5", null, null, failures);
    await processSeason(client, "academy", "A5", null, null, failures);

    expect(refreshHigherLowerSnapshot).toHaveBeenCalledTimes(2);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ league: "premier", season: "S5", puzzleDate: "2026-09-07" });
  });

  it("fails after both leagues finish when a refresh was incomplete", async () => {
    const client = createSupabase();
    fetchAllCardSeasons.mockResolvedValue([
      { league: "premier", season: "S5" },
      { league: "academy", season: "A5" },
    ]);
    refreshHigherLowerSnapshot
      .mockRejectedValueOnce(new Error("snapshot RPC unavailable"))
      .mockResolvedValueOnce({ editionWeeks: ["2026-09-07"], candidateCount: 1 });

    await expect(runWeeklyCardDrop(client, null, null)).rejects.toThrow("Higher or Lower refresh incomplete");
    expect(refreshHigherLowerSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("weekly card-drop send-off editions", () => {
  /** The finals, 8 PM ET on Monday 2026-09-07 — what dates the vault. */
  const finals = {
    stage: "finals",
    team_a: "Storm",
    team_b: "Ember",
    score_a: 3,
    score_b: 1,
    scheduled_at: "2026-09-08T00:00:00.000Z",
  };
  const sendoffCard = { ...card, slug: "ember-star", name: "Ember Star", sendoff: { stage: "finalist" } };
  const plan = {
    week: "2026-09-07",
    eliminations: [
      { team: "Ember", stage: "finalist", exit: "finals", series: "1–3", opponent: "Storm", week: "2026-09-07" },
      { team: "Storm", stage: "champion", exit: "finals", series: "3–1", opponent: "Ember", week: "2026-09-07" },
    ],
    cards: [sendoffCard],
    unmatched: ["Ghost Squad"],
    exits: ["finals"],
  };

  /** Every embed the run posted, in order. */
  function captureEmbeds(): { title: string; description: string }[] {
    const embeds: { title: string; description: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { embeds?: { title: string; description: string }[] };
      embeds.push(...(body.embeds ?? []));
      return new Response(null, { status: 204 });
    });
    return embeds;
  }

  it("archives what the plan printed and announces it", async () => {
    const client = createSupabase();
    const embeds = captureEmbeds();
    buildEditionForWeek.mockResolvedValue({ kind: "sendoff", cards: plan.cards, plan });
    fetchSeasonFixtures.mockResolvedValue([finals]);

    await processSeason(client, "premier", "S5", "https://discord.test/hook", null);

    // The season build is handed IN: a send-off is rated on the whole split,
    // and re-fetching it would be a second read of the same cards.
    expect(buildEditionForWeek).toHaveBeenCalledWith(client, "S5", "2026-09-07", expect.any(Function));
    expect(archiveEdition).toHaveBeenCalledWith(client, "S5", "2026-09-07", plan.cards, expect.any(String));

    const sendoff = embeds.find((embed) => embed.title.includes("Send-off"));
    expect(sendoff?.title).toBe("🎓 Premier — The Send-off · Finals");
    expect(sendoff?.description).toContain("**Ember** — Finalist · fell 1–3 to Storm");
    // The one team that leaves the bracket without being knocked out of it.
    expect(sendoff?.description).toContain("**Storm** — Champion · beat Ember 3–1");
    expect(sendoff?.description).toContain("rated on the whole split");
    expect(sendoff?.description).toContain("Vault shuts Sep 21");
  });

  it("warns about an eliminated team no card matched", async () => {
    // A name the fixtures spell differently from raw_stats prints nobody,
    // and the edition would just come out short with nothing to say why.
    const client = createSupabase();
    captureEmbeds();
    buildEditionForWeek.mockResolvedValue({ kind: "sendoff", cards: plan.cards, plan });

    await processSeason(client, "premier", "S5", null, null);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[WARN] No cards matched these eliminated teams: Ghost Squad"));
  });

  it("leaves an undecided playoff week unarchived", async () => {
    // Nothing prints until the scores land — a weekly fallback would archive
    // the ten people who played the final, rated against each other.
    const client = createSupabase();
    buildEditionForWeek.mockResolvedValue({ kind: "sendoff", cards: [], plan: { ...plan, cards: [], eliminations: [] } });

    await processSeason(client, "premier", "S5", null, null);

    expect(archiveEdition).not.toHaveBeenCalled();
  });

  it("says nothing extra on an ordinary week", async () => {
    const client = createSupabase();
    const embeds = captureEmbeds();

    await processSeason(client, "premier", "S5", "https://discord.test/hook", null);

    expect(archiveEdition).toHaveBeenCalledWith(client, "S5", "2026-09-07", [card], expect.any(String));
    expect(embeds.some((embed) => embed.title.includes("Send-off"))).toBe(false);
  });
});
