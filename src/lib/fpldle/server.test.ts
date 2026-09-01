import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createServerSupabase, fetchStaffTier } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
}));
const { createBettingServiceClient } = vi.hoisted(() => ({ createBettingServiceClient: vi.fn() }));
const { fetchCardSeason } = vi.hoisted(() => ({ fetchCardSeason: vi.fn() }));
const { premiumAccess } = vi.hoisted(() => ({ premiumAccess: vi.fn() }));
const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/premium/access", () => ({ premiumAccess }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));

import { getFpldleGame, FpldleError } from "./server";
import { resetFpldlePuzzleAction, revealFpldleAnswerAction, submitFpldleGuessAction } from "./actions";

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

function createQueryClient(options: {
  candidateRows?: unknown[] | null;
  guessRow?: unknown | null;
  progressRow?: unknown | null;
  recordGuessError?: unknown | null;
  streakRows?: unknown[] | null;
  guessCount?: number;
} = {}) {
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
      if (table === "fpldle_daily_progress") return { data: options.progressRow ?? null, error: null };
      if (table === "fpldle_daily_candidates" && call.columns === "player_slug") {
        return { data: options.candidateRows ?? [{ player_slug: card.slug }], error: null };
      }
      if (table === "fpldle_daily_candidates" && (call.filters.player_slug === "premier-only" || call.filters.player_slug === "wrong-player")) {
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
  const rpc = vi.fn<(name: string, args: unknown) => Promise<QueryResult>>((name) => {
    if (name === "record_fpldle_guess") {
      if (options.recordGuessError) return Promise.resolve({ data: null, error: options.recordGuessError });
      return Promise.resolve({ data: [{ accepted: true, guess_count: options.guessCount ?? 1, reward_amount: options.guessCount === 5 ? 0 : 200, balance: 1200, already_rewarded: false }], error: null });
    }
    if (name === "get_fpldle_streak_snapshot") {
      return Promise.resolve({
        data: options.streakRows ?? [{
          profile_id: "profile-1",
          username: "Tester",
          avatar_url: "https://example.com/tester.png",
          current_streak: 2,
          best_streak: 4,
          rank: 1,
          is_current_user: true,
        }],
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
  return { client: { from, rpc }, selections, rpc };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
  createServerSupabase.mockReset();
  createBettingServiceClient.mockReset();
  fetchCardSeason.mockReset();
  fetchStaffTier.mockReset();
  premiumAccess.mockReset();
  getBettingUser.mockReset();
  fetchCardSeason.mockResolvedValue("A99");
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  premiumAccess.mockResolvedValue({ signedIn: true, allowed: true, inconclusive: false });
  getBettingUser.mockResolvedValue({
    discordId: "discord-1",
    profileId: "profile-1",
    username: "Tester",
    balance: 1000,
    allowed: true,
    staff: false,
  });
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
    await expect(revealFpldleAnswerAction({
      league: "academy",
      puzzleDate: today,
      guesses: ["one", "two", "three", "four", "five", "six"],
    })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Answer reveal requires five guesses.",
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

  it("rejects non-premium callers before loading the puzzle or answer", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    premiumAccess.mockResolvedValue({ signedIn: true, allowed: false, inconclusive: false });
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(
      submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: card.slug }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("allows premium members who are not site admins", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const service = createQueryClient({ candidateRows: [{
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      position: card.role,
    }] });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(getFpldleGame("academy")).resolves.toMatchObject({
      date: today,
      canReset: false,
      candidates: [{ slug: card.slug, name: card.name, tag: card.tag, position: card.role }],
    });
    expect(service.rpc).toHaveBeenCalledWith("get_fpldle_streak_snapshot", {
      p_league: "academy",
      p_puzzle_date: today,
      p_profile_id: "profile-1",
    });
  });

  it("credits the wallet after a server-compared correct guess", async () => {
    const candidateRow = {
      puzzle_date: today,
      league: "academy",
      season: "A99",
      edition_week: "2026-08-24",
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      team: card.teamName,
      team_logo_url: card.teamImageUrl,
      position: card.role,
      champion: card.signature.champion,
      overall: card.overall,
      division: null,
    };
    const service = createQueryClient({ candidateRows: [candidateRow] });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: card.slug })).resolves.toMatchObject({
      feedback: { isCorrect: true },
      reward: { amount: 200, balance: 1200, alreadyClaimed: false },
      streaks: { personal: { currentStreak: 2, bestStreak: 4 } },
    });
    expect(service.rpc).toHaveBeenCalledWith("record_fpldle_guess", {
      p_puzzle_date: today,
      p_league: "academy",
      p_profile_id: "profile-1",
      p_discord_id: "discord-1",
      p_player_slug: card.slug,
      p_is_correct: true,
    });
    expect(service.rpc).toHaveBeenCalledWith("get_fpldle_streak_snapshot", {
      p_league: "academy",
      p_puzzle_date: today,
      p_profile_id: "profile-1",
    });
  });

  it("refreshes streaks after the fifth wrong guess", async () => {
    const targetRow = {
      puzzle_date: today,
      league: "academy",
      season: "A99",
      edition_week: "2026-08-24",
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      team: card.teamName,
      team_logo_url: card.teamImageUrl,
      position: card.role,
      champion: card.signature.champion,
      overall: card.overall,
      division: null,
    };
    const service = createQueryClient({
      candidateRows: [targetRow],
      guessRow: { ...targetRow, player_slug: "wrong-player", player_name: "Wrong Player", team: "Other Team", overall: 70 },
      guessCount: 5,
      streakRows: [{
        profile_id: "profile-1",
        username: "Tester",
        avatar_url: null,
        current_streak: 0,
        best_streak: 4,
        rank: null,
        is_current_user: true,
      }],
    });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: "wrong-player" })).resolves.toMatchObject({
      feedback: { isCorrect: false },
      reward: null,
      streaks: { personal: { currentStreak: 0, bestStreak: 4 } },
    });
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
    const service = createQueryClient({ candidateRows: [{
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      position: card.role,
    }] });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    const game = await getFpldleGame("academy");

    expect(game).toEqual({
      date: today,
      expiresAt: "2026-08-29T04:00:00.000Z",
      canReset: true,
      progress: { guesses: [], status: "playing", answer: null, reward: null },
      candidates: [{
        slug: card.slug,
        name: card.name,
        tag: card.tag,
        position: card.role,
      }],
      streaks: {
        leaderboard: [{
          profileId: "profile-1",
          username: "Tester",
          avatarUrl: "https://example.com/tester.png",
          currentStreak: 2,
          bestStreak: 4,
          rank: 1,
          isCurrentUser: true,
        }],
        personal: {
          profileId: "profile-1",
          username: "Tester",
          avatarUrl: "https://example.com/tester.png",
          currentStreak: 2,
          bestStreak: 4,
          rank: 1,
          isCurrentUser: true,
        },
      },
    });
    expect(service.selections.find((selection) => selection.table === "fpldle_daily_puzzles")?.columns).not.toContain("answer_slug");
  });

  it("rehydrates completed account progress for a second device", async () => {
    const targetRow = {
      puzzle_date: today,
      league: "academy",
      season: "A99",
      edition_week: "2026-08-24",
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      team: card.teamName,
      team_logo_url: card.teamImageUrl,
      position: card.role,
      champion: card.signature.champion,
      overall: card.overall,
      division: null,
    };
    const wrongRow = {
      ...targetRow,
      player_slug: "wrong-player",
      player_name: "Wrong Player",
      team: "Other Team",
      overall: 70,
    };
    const service = createQueryClient({
      candidateRows: [targetRow, wrongRow],
      progressRow: {
        guesses: [wrongRow.player_slug, targetRow.player_slug],
        completed_at: `${today}T12:00:00.000Z`,
        reward_amount: 200,
      },
    });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(getFpldleGame("academy")).resolves.toMatchObject({
      progress: {
        status: "won",
        guesses: [
          { player: { slug: "wrong-player" }, isCorrect: false },
          { player: { slug: card.slug }, isCorrect: true },
        ],
        reward: { amount: 200, balance: 1000, alreadyClaimed: true },
      },
    });
  });

  it("returns authoritative progress when a stale device replays a completed puzzle", async () => {
    const targetRow = {
      puzzle_date: today,
      league: "academy",
      season: "A99",
      edition_week: "2026-08-24",
      player_slug: card.slug,
      player_name: card.name,
      player_tag: card.tag,
      team: card.teamName,
      team_logo_url: card.teamImageUrl,
      position: card.role,
      champion: card.signature.champion,
      overall: card.overall,
      division: null,
    };
    const service = createQueryClient({
      candidateRows: [targetRow],
      progressRow: {
        guesses: [targetRow.player_slug],
        completed_at: `${today}T12:00:00.000Z`,
        reward_amount: 200,
      },
      recordGuessError: { code: "P0001", message: "FPLDLE_PUZZLE_COMPLETE" },
    });
    createBettingServiceClient.mockReturnValue(service.client);
    createServerSupabase.mockResolvedValue({ from: vi.fn() });

    await expect(
      submitFpldleGuessAction({ league: "academy", puzzleDate: today, playerSlug: card.slug }),
    ).resolves.toMatchObject({
      ok: false,
      code: "PROGRESS_CHANGED",
      progress: {
        status: "won",
        guesses: [{ player: { slug: card.slug }, isCorrect: true }],
      },
    });
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
