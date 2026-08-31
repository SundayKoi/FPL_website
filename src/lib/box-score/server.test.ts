import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createServerSupabase, fetchStaffTier, fetchCardSeason, getBettingUser, createBettingServiceClient } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
  fetchCardSeason: vi.fn(),
  getBettingUser: vi.fn(),
  createBettingServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));

import { BoxScoreError, getBoxScoreGame, submitBoxScoreGuess } from "./server";

const today = "2026-08-31";

const targetStats = {
  role: "Mid",
  champion: "Ahri",
  kills: 8,
  deaths: 2,
  assists: 11,
  kda: 9.5,
  killParticipationPct: 72.4,
  totalDamage: 28400,
  damagePerMin: 812.6,
  damageSharePct: 31.2,
  cs: 245,
  csPerMin: 7,
  gold: 13200,
  goldPerMin: 377.1,
  csAt10: 82,
  goldAt10: 3450,
  team: "Solaris",
  date: "2026-08-29T19:30:00.000Z",
  result: "win",
  side: "Blue",
  durationMin: 35.2,
  visionScore: 24,
  objectives: 3,
  damageTaken: 18100,
  damageMitigated: 9500,
  healing: 1240,
  multikills: { doubles: 2, triples: 1, quadras: 0, pentas: 0 },
  soloKills: 3,
  turretDamage: 1800,
  objectiveDamage: 750,
};

const rawRow = {
  match_id: "match-1",
  game_date: "2026-08-29T19:30:00.000Z",
  game_duration_min: 35.2,
  team_side: "Blue",
  team_name: "Solaris",
  summoner_name: "Target",
  tag: "NA1",
  champion: "Ahri",
  role: "MID",
  champion_level: 18,
  kills: 8,
  deaths: 2,
  assists: 11,
  kda: 9.5,
  solo_kills: 3,
  kill_participation_pct: 72.4,
  double_kills: 2,
  triple_kills: 1,
  quadra_kills: 0,
  penta_kills: 0,
  total_damage_to_champions: 28400,
  damage_per_min: 812.6,
  damage_share_pct: 31.2,
  damage_taken: 18100,
  damage_mitigated: 9500,
  total_healing: 1240,
  gold_earned: 13200,
  gold_per_min: 377.1,
  cs: 245,
  cs_per_min: 7,
  cs_at_10: 82,
  gold_at_10: 3450,
  vision_score: 24,
  dragon_kills: 1,
  baron_kills: 0,
  objectives_stolen: 0,
  objective_damage: 750,
  turret_damage: 1800,
  game_ended_in_early_surrender: false,
  win: true,
};

type QueryResult = { data: unknown; error: unknown };

function createService(options: { progress?: unknown; record?: unknown } = {}) {
  let puzzleProbe = 0;
  let progress = options.progress ?? null;
  const rpc = vi.fn(async (name: string) => {
    if (name === "record_box_score_guess") {
      progress = options.record ?? {
        guesses: ["target-na1"],
        status: "won",
        reward_amount: 200,
        reward_already_claimed: false,
      };
      return {
        data: [{ accepted: true, correct: true, guess_count: 1, status: "won", reward_amount: 200, balance: 1200, already_rewarded: false }],
        error: null,
      };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    let columns = "";
    const filters: Record<string, unknown> = {};
    const settle = (): QueryResult => {
      if (table === "box_score_daily_puzzles" && columns === "puzzle_date") {
        puzzleProbe += 1;
        return { data: puzzleProbe === 1 ? null : { puzzle_date: today }, error: null };
      }
      if (table === "raw_stats") return { data: [rawRow], error: null };
      if (table === "box_score_daily_puzzles") {
        return {
          data: {
            puzzle_date: today,
            league: "premier",
            answer_slug: "target-na1",
            target_stats: targetStats,
            reset_at: "2026-09-01T00:00:00.000Z",
          },
          error: null,
        };
      }
      if (table === "box_score_daily_candidates") {
        return {
          data: [
            { player_slug: "target-na1", player_name: "Target", player_tag: "NA1", role: "Mid" },
            { player_slug: "other-na1", player_name: "Other", player_tag: "NA1", role: "Top" },
          ],
          error: null,
        };
      }
      if (table === "box_score_daily_progress") return { data: progress, error: null };
      return { data: null, error: null };
    };
    const builder = {
      select(value: string) {
        columns = value;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      not() {
        return builder;
      },
      gte() {
        return builder;
      },
      order() {
        return builder;
      },
      maybeSingle: async () => settle(),
      then: (resolve: (result: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  return { client: { from, rpc }, rpc };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
  createServerSupabase.mockReset();
  fetchStaffTier.mockReset();
  fetchCardSeason.mockReset();
  getBettingUser.mockReset();
  createBettingServiceClient.mockReset();
  createServerSupabase.mockResolvedValue({});
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  fetchCardSeason.mockResolvedValue("S4");
  getBettingUser.mockResolvedValue({ profileId: "profile-1", discordId: "discord-1", balance: 1000, allowed: false });
});

afterEach(() => vi.useRealTimers());

describe("Box Score server module", () => {
  it("rejects malformed and stale submissions before touching privileged clients", async () => {
    await expect(submitBoxScoreGuess({ league: "nope", puzzleDate: today, playerSlug: "x" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitBoxScoreGuess({ league: "premier", puzzleDate: "2026-08-30", playerSlug: "target-na1" })).rejects.toMatchObject({ code: "STALE_PUZZLE" });
    expect(createServerSupabase).not.toHaveBeenCalled();
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("keeps the route admin-only even when the caller has a betting wallet", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });

    await expect(getBoxScoreGame("premier")).rejects.toEqual(expect.objectContaining({
      code: "FORBIDDEN",
      message: "Box Score is available to admins during testing.",
    } satisfies Partial<BoxScoreError>));
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("freezes one current-season game and returns role without locked answer data", async () => {
    const service = createService();
    createBettingServiceClient.mockReturnValue(service.client);

    const game = await getBoxScoreGame("premier");

    expect(fetchCardSeason).toHaveBeenCalledWith(expect.anything(), "premier");
    expect(service.rpc).toHaveBeenCalledWith("ensure_box_score_daily_puzzle", expect.objectContaining({
      p_season: "S4",
      p_league: "premier",
      p_candidates: [expect.objectContaining({ player_slug: "target-na1", player_name: "Target", player_tag: "NA1" })],
    }));
    expect(game).toMatchObject({ date: today, league: "premier", adminTesting: true, status: "playing" });
    expect(game.reveal).toMatchObject({ stage: "role", role: "Mid", champion: null, combat: null, final: null });
    expect(JSON.stringify(game.reveal)).not.toContain("Target");
  });

  it("submits a player reference to the server comparison and restores completed reward state", async () => {
    const service = createService();
    createBettingServiceClient.mockReturnValue(service.client);

    const result = await submitBoxScoreGuess({ league: "premier", puzzleDate: today, playerSlug: "target-na1" });

    expect(service.rpc).toHaveBeenCalledWith("record_box_score_guess", {
      p_puzzle_date: today,
      p_league: "premier",
      p_profile_id: "profile-1",
      p_discord_id: "discord-1",
      p_player_slug: "target-na1",
    });
    expect(result).toMatchObject({ ok: true, correct: true, game: { status: "won", reward: { amount: 200 } } });
    expect(result.game.reveal).toMatchObject({ stage: "final", canFlip: true, final: { name: "Target" }, cardBack: { visionScore: 24 } });
  });
});
