import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";

vi.mock("server-only", () => ({}));

const { createServerSupabase, createBettingServiceClient, fetchCardEditionWeeks, fetchCardSeason, fetchStaffTier, premiumAccess, getBettingUser } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  createBettingServiceClient: vi.fn(),
  fetchCardEditionWeeks: vi.fn(),
  fetchCardSeason: vi.fn(),
  fetchStaffTier: vi.fn(),
  premiumAccess: vi.fn(),
  getBettingUser: vi.fn(),
}));

vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardEditionWeeks, fetchCardSeason }));
vi.mock("@/lib/premium/access", () => ({ premiumAccess }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));

import { getHigherLowerGame, startHigherLowerRun, submitHigherLowerChoice } from "./server";

const today = "2026-08-29";
const referenceCard = {
  slug: "reference-player",
  name: "Reference Player",
  overall: 82,
  teamName: "Blue Team",
  teamAbbr: "BLU",
  teamImageUrl: null,
  signature: { champion: "Ahri", games: 10 },
} as unknown as PlayerCardData;
const challengerCard = {
  slug: "challenger-player",
  name: "Challenger Player",
  overall: 91,
  teamName: "Red Team",
  teamAbbr: "RED",
  teamImageUrl: null,
  signature: { champion: "Jinx", games: 10 },
} as unknown as PlayerCardData;

type Run = Record<string, unknown>;

function createClient(run: Run | null, candidateRows = [
  { player_slug: referenceCard.slug, player_name: referenceCard.name, overall: referenceCard.overall, edition_week: "2026-08-24", card: referenceCard },
  { player_slug: challengerCard.slug, player_name: challengerCard.name, overall: challengerCard.overall, edition_week: "2026-08-17", card: challengerCard },
], runRows = run ? [run] : []) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "start_higher_lower_run") {
      return { data: run ? [run] : null, error: null };
    }
    return { data: run ? [run] : null, error: null };
  });

  const from = vi.fn((table: string) => {
    let columns = "";
    let limited = false;
    const builder = {
      select(nextColumns: string) {
        columns = nextColumns;
        return builder;
      },
      eq() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        limited = true;
        return builder;
      },
      gte() {
        return builder;
      },
      lt() {
        return builder;
      },
      in() {
        return builder;
      },
      range() {
        return builder;
      },
      maybeSingle: async () => {
        if (table === "card_editions") return { data: { edition_week: "2026-08-24" }, error: null };
        if (table === "higher_lower_daily_runs") {
          if (!limited && runRows.length > 1) {
            return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
          }
          return { data: runRows.at(-1) ?? null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const data =
          table === "card_editions"
            ? [{ edition_week: "2026-08-24" }, { edition_week: "2026-08-17" }]
            : table === "higher_lower_daily_candidates"
            ? candidateRows
            : table === "higher_lower_daily_runs" && columns === "profile_id, run_score"
              ? run
                ? [{ profile_id: run.profile_id, run_score: run.run_score }]
                : []
              : table === "betting_profiles"
                ? [{ profile_id: "profile-1", username: "Tester", avatar_url: null }]
                : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  });

  return { from, rpc };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
  createServerSupabase.mockReset();
  createBettingServiceClient.mockReset();
  fetchCardSeason.mockReset();
  fetchCardEditionWeeks.mockReset();
  fetchStaffTier.mockReset();
  premiumAccess.mockReset();
  getBettingUser.mockReset();
  createServerSupabase.mockResolvedValue(createClient(null));
  fetchCardSeason.mockResolvedValue("S99");
  fetchCardEditionWeeks.mockResolvedValue(["2026-08-24", "2026-08-17"]);
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  premiumAccess.mockResolvedValue({ allowed: true });
  getBettingUser.mockResolvedValue({ profileId: "profile-1", discordId: "discord-1", allowed: true });
});

describe("Higher or Lower server module", () => {
  it("rejects malformed and stale mutations before auth or database access", async () => {
    await expect(submitHigherLowerChoice({ league: "nope", puzzleDate: today, runVersion: 1, choice: "higher" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitHigherLowerChoice({ league: "premier", puzzleDate: "2026-08-28", runVersion: 1, choice: "higher" })).rejects.toMatchObject({ code: "STALE_PUZZLE" });
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("keeps non-premium members out of the game", async () => {
    premiumAccess.mockResolvedValue({ allowed: false });
    await expect(getHigherLowerGame("premier")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("keeps premium members out until they are admins or owners", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });

    await expect(getHigherLowerGame("premier")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Higher or Lower is currently available to admins and owners only.",
    });
    expect(premiumAccess).not.toHaveBeenCalled();
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("allows owners through the temporary staff gate", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });
    getBettingUser.mockResolvedValue({ profileId: "profile-1", discordId: "discord-1", allowed: false });
    const client = createClient(null);
    createBettingServiceClient.mockReturnValue(client);

    await expect(getHigherLowerGame("premier")).resolves.toMatchObject({
      league: "premier",
      state: "not_started",
      canReplay: true,
    });
  });

  it("uses the owner replay RPC for new attempts", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });
    const client = createClient(null);
    createBettingServiceClient.mockReturnValue(client);

    const game = await startHigherLowerRun("premier");

    expect(game.canReplay).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("start_higher_lower_owner_run", {
      p_puzzle_date: today,
      p_league: "premier",
      p_profile_id: "profile-1",
      p_discord_id: "discord-1",
    });
  });

  it("loads the latest owner attempt when completed replays create multiple rows", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });
    const completedRun = {
      puzzle_date: today,
      league: "premier",
      profile_id: "profile-1",
      discord_id: "discord-1",
      random_seed: 42,
      run_state: "lost",
      run_score: 2,
      reference_player_slug: referenceCard.slug,
      challenger_player_slug: challengerCard.slug,
      recent_player_history: [referenceCard.slug],
      round_number: 3,
      run_version: 4,
      higher_answers: 2,
      lower_answers: 1,
      last_choice: "higher",
      last_correct: false,
      round_expires_at: null,
      started_at: `${today}T12:00:00.000Z`,
      completed_at: `${today}T12:01:00.000Z`,
      completion_reason: "incorrect",
    } satisfies Run;
    const replayRun = { ...completedRun, run_state: "awaiting_choice", run_score: 0, run_version: 1, round_number: 1, completed_at: null, completion_reason: null } satisfies Run;
    const client = createClient(replayRun, undefined, [completedRun, replayRun]);
    createBettingServiceClient.mockReturnValue(client);

    await expect(getHigherLowerGame("premier")).resolves.toMatchObject({
      state: "awaiting_choice",
      score: 0,
      canReplay: true,
    });
  });

  it("returns only concealed challenger fields while a round is active", async () => {
    const run = {
      puzzle_date: today,
      league: "premier",
      profile_id: "profile-1",
      discord_id: "discord-1",
      random_seed: 1,
      run_state: "awaiting_choice",
      run_score: 0,
      reference_player_slug: referenceCard.slug,
      challenger_player_slug: challengerCard.slug,
      recent_player_history: [referenceCard.slug],
      round_number: 1,
      run_version: 1,
      higher_answers: 0,
      lower_answers: 0,
      last_choice: null,
      last_correct: null,
      round_expires_at: `${today}T12:00:20.000Z`,
      started_at: `${today}T12:00:00.000Z`,
      completed_at: null,
      completion_reason: null,
    } satisfies Run;
    const client = createClient(run);
    createBettingServiceClient.mockReturnValue(client);

    const game = await getHigherLowerGame("premier");

    expect(game.state).toBe("awaiting_choice");
    expect(game.canReplay).toBe(false);
    expect(game.challenger).toMatchObject({ slug: challengerCard.slug, name: challengerCard.name });
    expect(game.challenger).not.toHaveProperty("overall");
    expect(game.challenger).not.toHaveProperty("signature");
    expect(game.challengerCard).toBeNull();
  });

  it("starts the stable daily run through the trusted RPC", async () => {
    const run = {
      puzzle_date: today,
      league: "premier",
      profile_id: "profile-1",
      discord_id: "discord-1",
      random_seed: 42,
      run_state: "awaiting_choice",
      run_score: 0,
      reference_player_slug: referenceCard.slug,
      challenger_player_slug: challengerCard.slug,
      recent_player_history: [referenceCard.slug],
      round_number: 1,
      run_version: 1,
      higher_answers: 0,
      lower_answers: 0,
      last_choice: null,
      last_correct: null,
      round_expires_at: `${today}T12:00:20.000Z`,
      started_at: `${today}T12:00:00.000Z`,
      completed_at: null,
      completion_reason: null,
    } satisfies Run;
    const client = createClient(run);
    createBettingServiceClient.mockReturnValue(client);

    const game = await startHigherLowerRun("premier");

    expect(game.state).toBe("awaiting_choice");
    expect(client.rpc).toHaveBeenCalledWith("start_higher_lower_run", {
      p_puzzle_date: today,
      p_league: "premier",
      p_profile_id: "profile-1",
      p_discord_id: "discord-1",
    });
  });

  it("passes the selected direction and expected version to the authoritative RPC", async () => {
    const run = {
      puzzle_date: today,
      league: "premier",
      profile_id: "profile-1",
      discord_id: "discord-1",
      random_seed: 42,
      run_state: "correct_reveal",
      run_score: 1,
      reference_player_slug: referenceCard.slug,
      challenger_player_slug: challengerCard.slug,
      recent_player_history: [referenceCard.slug],
      round_number: 1,
      run_version: 2,
      higher_answers: 1,
      lower_answers: 0,
      last_choice: "higher",
      last_correct: true,
      round_expires_at: null,
      started_at: `${today}T12:00:00.000Z`,
      completed_at: null,
      completion_reason: null,
    } satisfies Run;
    const client = createClient(run);
    createBettingServiceClient.mockReturnValue(client);

    const game = await submitHigherLowerChoice({ league: "premier", puzzleDate: today, runVersion: 1, choice: "higher" });

    expect(game.state).toBe("correct_reveal");
    expect(game.challengerCard).toMatchObject({ slug: challengerCard.slug, overall: challengerCard.overall });
    expect(client.rpc).toHaveBeenCalledWith("submit_higher_lower_choice", {
      p_puzzle_date: today,
      p_league: "premier",
      p_profile_id: "profile-1",
      p_run_version: 1,
      p_choice: "higher",
    });
  });
});
