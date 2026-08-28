import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createServerSupabase, fetchStaffTier } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
}));
const { createBettingServiceClient } = vi.hoisted(() => ({ createBettingServiceClient: vi.fn() }));
const { fetchCardSeason } = vi.hoisted(() => ({ fetchCardSeason: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));

import { getFpldleGame, FpldleError } from "./server";
import { resetFpldlePuzzleAction, submitFpldleGuessAction } from "./actions";

const today = "2026-08-28";

const card = {
  slug: "academy-player",
  name: "Academy Player",
  tag: "NA1",
  teamName: "Academy",
  teamImageUrl: "https://example.com/academy.png",
  role: "Mid",
  overall: 82,
  signature: { champion: "Ahri", games: 10 },
};

type QueryResult = { data: unknown; error: unknown };

function createQueryClient(options: { candidateRows?: unknown[] | null; guessRow?: unknown | null } = {}) {
  const selections: { table: string; columns: string; filters: Record<string, unknown> }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, columns: "", filters: {} as Record<string, unknown> };
    selections.push(call);
    const settle = (): QueryResult => {
      if (table === "card_editions" && call.columns === "edition_week") {
        return { data: { edition_week: "2026-08-24" }, error: null };
      }
      if (table === "card_editions") {
        return { data: [{ slug: card.slug, card }], error: null };
      }
      if (table === "league_settings") {
        return { data: { current_season: "A99", featured_draft_id: "draft-1" }, error: null };
      }
      if (table === "teams") {
        return { data: [{ name: "Academy", division: "Solari" }], error: null };
      }
      if (table === "fpldle_daily_puzzles" && call.columns.includes("created_at")) {
        return {
          data: {
            puzzle_date: today,
            league: "academy",
            created_at: `${today}T00:00:00.000Z`,
            reset_at: "2026-08-29T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (table === "fpldle_daily_puzzles") return { data: { answer_slug: "academy-player" }, error: null };
      if (table === "fpldle_daily_candidates" && call.columns === "player_slug") {
        return { data: options.candidateRows ?? [{ player_slug: card.slug }], error: null };
      }
      if (table === "fpldle_daily_candidates" && call.filters.player_slug === "premier-only") {
        return { data: options.guessRow ?? null, error: null };
      }
      return { data: options.candidateRows ?? null, error: null };
    };
    const builder = {
      select(columns: string) {
        call.columns = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters[column] = value;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      in(column: string, value: unknown) {
        call.filters[column] = value;
        return builder;
      },
      maybeSingle: async () => settle(),
      then: (resolve: (result: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { client: { from, rpc }, selections, rpc };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
  createServerSupabase.mockReset();
  createBettingServiceClient.mockReset();
  fetchCardSeason.mockReset();
  fetchStaffTier.mockReset();
  fetchCardSeason.mockResolvedValue("A99");
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
});

afterEach(() => vi.useRealTimers());

describe("FPL'dle server adapter", () => {
  it("rejects malformed requests before touching Supabase", async () => {
    await expect(submitFpldleGuessAction({ league: "nope", puzzleDate: today, playerSlug: "x" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: "not a slug" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("rejects stale dates independently of the browser state", async () => {
    await expect(submitFpldleGuessAction({ league: "academy", puzzleDate: "2026-08-27", playerSlug: card.slug })).rejects.toMatchObject({
      code: "STALE_PUZZLE",
    });
    expect(createServerSupabase).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers before loading the puzzle or answer", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(
      submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: card.slug }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("scopes candidate membership to the submitted league", async () => {
    const service = createQueryClient({ guessRow: null });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(
      submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: "premier-only" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PLAYER" });

    const guessLookup = service.selections.find(
      (selection) => selection.table === "fpldle_daily_candidates" && selection.filters.player_slug === "premier-only",
    );
    expect(guessLookup?.filters.league).toBe("academy");
    expect(service.selections.filter((selection) => selection.table === "fpldle_daily_puzzles").at(-1)?.columns).not.toContain("answer_slug");
  });

  it("does not return the hidden answer from the game loader", async () => {
    const service = createQueryClient();
    const publicClient = createQueryClient({ candidateRows: [{
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
    }] });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue(publicClient.client);

    const game = await getFpldleGame("academy");

    expect(game).toEqual({
      date: today,
      expiresAt: "2026-08-29T00:00:00.000Z",
      previousGuesses: [],
      candidates: [{
        slug: card.slug,
        name: card.name,
        tag: card.tag,
      }],
    });
    expect(service.selections.find((selection) => selection.table === "fpldle_daily_puzzles")?.columns).not.toContain("answer_slug");
  });

  it("resets only the current admin puzzle and recreates it", async () => {
    const service = createQueryClient();
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(resetFpldlePuzzleAction({ league: "premier", puzzleDate: today })).resolves.toEqual({
      date: today,
      league: "premier",
    });
    expect(service.rpc).toHaveBeenCalledWith("reset_fpldle_daily_puzzle", {
      p_puzzle_date: today,
      p_league: "premier",
    });
    const ensureCall = service.rpc.mock.calls.find(([name]) => name === "ensure_fpldle_daily_puzzle");
    expect(ensureCall?.[1]).toMatchObject({
      p_candidates: [{ team_logo_url: "https://example.com/academy.png", division: "Solari" }],
    });
  });
});

it("keeps the exported error type identifiable", () => {
  expect(new FpldleError("INVALID_INPUT", "bad")).toBeInstanceOf(Error);
});
