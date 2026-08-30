import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import type { PlayerCardData } from "@/lib/cards/build";
import { premiumAccess } from "@/lib/premium/access";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  concealHigherLowerCard,
  HIGHER_LOWER_ROUNDS,
  HIGHER_LOWER_TIMER_SECONDS,
  rankHigherLowerWeek,
  utcWeekStart,
} from "./rules";
import type {
  HigherLowerChoice,
  HigherLowerCompletionReason,
  HigherLowerGame,
  HigherLowerLastChoice,
  HigherLowerLeague,
  HigherLowerRunState,
  HigherLowerSettlement,
} from "./types";

export type {
  ConcealedHigherLowerCard,
  HigherLowerChoice,
  HigherLowerCompletionReason,
  HigherLowerGame,
  HigherLowerLeaderboardRow,
  HigherLowerLastChoice,
  HigherLowerLeague,
  HigherLowerRunState,
  HigherLowerSettlement,
} from "./types";

const RUN_COLUMNS =
  "id, puzzle_date, league, profile_id, discord_id, random_seed, run_state, run_score, reference_player_slug, challenger_player_slug, recent_player_history, round_number, run_version, higher_answers, lower_answers, last_choice, last_correct, round_expires_at, started_at, completed_at, completion_reason";

type HigherLowerRunRow = {
  id: number;
  puzzle_date: string;
  league: HigherLowerLeague;
  profile_id: string;
  discord_id: string;
  random_seed: number;
  run_state: HigherLowerRunState;
  run_score: number;
  reference_player_slug: string | null;
  challenger_player_slug: string | null;
  recent_player_history: string[];
  round_number: number;
  run_version: number;
  higher_answers: number;
  lower_answers: number;
  last_choice: HigherLowerLastChoice | null;
  last_correct: boolean | null;
  round_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_reason: HigherLowerCompletionReason | null;
};

type CandidateRow = {
  player_slug: string;
  player_name: string;
  overall: number;
  card: unknown;
};

type LeaderboardRunRow = { profile_id: string; run_score: number; league: HigherLowerLeague; puzzle_date: string };
type WalletRow = { profile_id: string; username: string | null; avatar_url: string | null };
type SettlementRpcRow = {
  week_start: string;
  top_score: number;
  prize_pool: number;
  winner_count: number;
  settled_at: string | null;
  status: "settled";
};

export type HigherLowerErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "STALE_PUZZLE"
  | "NO_SEASON"
  | "NO_EDITION"
  | "NO_CANDIDATES"
  | "RUN_NOT_FOUND"
  | "SNAPSHOT_UNAVAILABLE"
  | "PUZZLE_UNAVAILABLE";

export class HigherLowerError extends Error {
  constructor(
    public readonly code: HigherLowerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HigherLowerError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLeague(value: unknown): HigherLowerLeague {
  if (value !== "premier" && value !== "academy") {
    throw new HigherLowerError("INVALID_INPUT", "Choose a valid Higher or Lower league.");
  }
  return value;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseRunInput(input: unknown, action: "choice" | "advance"): {
  league: HigherLowerLeague;
  puzzleDate: string;
  runVersion: number;
  choice?: HigherLowerChoice | "timeout";
} {
  if (!isRecord(input)) throw new HigherLowerError("INVALID_INPUT", "Invalid Higher or Lower run.");
  const league = parseLeague(input.league);
  if (!isIsoDate(input.puzzleDate)) {
    throw new HigherLowerError("INVALID_INPUT", "Invalid Higher or Lower puzzle date.");
  }
  const runVersion = input.runVersion;
  if (typeof runVersion !== "number" || !Number.isInteger(runVersion) || runVersion < 0) {
    throw new HigherLowerError("INVALID_INPUT", "Invalid Higher or Lower run version.");
  }
  if (action === "choice") {
    if (input.choice !== "higher" && input.choice !== "lower" && input.choice !== "timeout") {
      throw new HigherLowerError("INVALID_INPUT", "Choose Higher, Lower, or let the timer expire.");
    }
    return { league, puzzleDate: input.puzzleDate, runVersion, choice: input.choice };
  }
  return { league, puzzleDate: input.puzzleDate, runVersion };
}

function throwRpcError(error: unknown): never {
  const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
  if (message.includes("NO_CANDIDATES")) {
    throw new HigherLowerError("NO_CANDIDATES", "This card edition has no valid comparison yet.");
  }
  if (message.includes("RUN_NOT_FOUND")) {
    throw new HigherLowerError("RUN_NOT_FOUND", "Start this Daily run before submitting a choice.");
  }
  if (message.includes("SNAPSHOT_UNAVAILABLE")) {
    throw new HigherLowerError("SNAPSHOT_UNAVAILABLE", "This Daily run snapshot is unavailable.");
  }
  throw error instanceof Error ? error : new Error("Higher or Lower mutation failed.");
}

async function requirePremiumPlayer(): Promise<{
  server: SupabaseClient;
  service: ReturnType<typeof createBettingServiceClient>;
  profileId: string;
  discordId: string;
  isOwner: boolean;
}> {
  const server = await createServerSupabase();
  const staffTier = await fetchStaffTier(server);
  if (!staffTier.isAdmin && !staffTier.isOwner) {
    throw new HigherLowerError("FORBIDDEN", "Higher or Lower is currently available to admins and owners only.");
  }

  const access = await premiumAccess();
  if (!access.allowed) {
    throw new HigherLowerError("FORBIDDEN", "Higher or Lower is available to Premium members.");
  }
  const user = await getBettingUser();
  if (!user) {
    throw new HigherLowerError("FORBIDDEN", "Sign in with Discord to play Higher or Lower.");
  }
  return {
    server,
    service: createBettingServiceClient(),
    profileId: user.profileId,
    discordId: user.discordId,
    isOwner: staffTier.isOwner,
  };
}

async function latestEdition(service: ReturnType<typeof createBettingServiceClient>, season: string): Promise<string | null> {
  const { data, error } = await service
    .from("card_editions")
    .select("edition_week")
    .eq("season", season)
    .order("edition_week", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { edition_week: string } | null)?.edition_week ?? null;
}

async function ensureSnapshot(
  server: SupabaseClient,
  service: ReturnType<typeof createBettingServiceClient>,
  league: HigherLowerLeague,
  puzzleDate: string,
): Promise<void> {
  const season = await fetchCardSeason(server, league as CardLeague);
  if (!season) throw new HigherLowerError("NO_SEASON", "This league has no active card season.");
  const editionWeek = await latestEdition(service, season);
  if (!editionWeek) throw new HigherLowerError("NO_EDITION", "No frozen card edition is available yet.");

  const { error } = await service.rpc("ensure_higher_lower_daily_candidates", {
    p_puzzle_date: puzzleDate,
    p_league: league,
    p_season: season,
    p_edition_week: editionWeek,
  });
  if (error) throwRpcError(error);
}

async function loadRun(
  service: ReturnType<typeof createBettingServiceClient>,
  puzzleDate: string,
  league: HigherLowerLeague,
  profileId: string,
): Promise<HigherLowerRunRow | null> {
  const { data, error } = await service
    .from("higher_lower_daily_runs")
    .select(RUN_COLUMNS)
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("profile_id", profileId)
    .order("id", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data as HigherLowerRunRow | null;
}

async function loadCandidates(
  service: ReturnType<typeof createBettingServiceClient>,
  puzzleDate: string,
  league: HigherLowerLeague,
  slugs: string[],
): Promise<Map<string, CandidateRow>> {
  const uniqueSlugs = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))];
  if (uniqueSlugs.length === 0) return new Map();
  const { data, error } = await service
    .from("higher_lower_daily_candidates")
    .select("player_slug, player_name, overall, card")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .in("player_slug", uniqueSlugs);
  if (error) throw error;
  return new Map(((data as CandidateRow[] | null) ?? []).map((row) => [row.player_slug, row]));
}

function frozenCard(row: CandidateRow | undefined): PlayerCardData {
  if (!row || !isRecord(row.card) || typeof row.card.overall !== "number" || typeof row.card.name !== "string") {
    throw new HigherLowerError("SNAPSHOT_UNAVAILABLE", "A frozen player card could not be restored.");
  }
  return row.card as unknown as PlayerCardData;
}

async function loadLeaderboard(
  service: ReturnType<typeof createBettingServiceClient>,
  weekStart: string,
  currentProfileId: string,
): Promise<HigherLowerGame["weeklyLeaderboard"]> {
  const endDate = new Date(`${weekStart}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const { data: runData, error: runError } = await service
    .from("higher_lower_daily_runs")
    .select("profile_id, run_score, league, puzzle_date")
    .gte("puzzle_date", weekStart)
    .lt("puzzle_date", endDate.toISOString().slice(0, 10));
  if (runError) throw runError;

  const runs = (runData as LeaderboardRunRow[] | null) ?? [];
  const profileIds = [...new Set(runs.map((run) => run.profile_id))];
  if (profileIds.length === 0) return [];
  const { data: walletData, error: walletError } = await service
    .from("betting_profiles")
    .select("profile_id, username, avatar_url")
    .in("profile_id", profileIds);
  if (walletError) throw walletError;
  const usernames = new Map(
    ((walletData as WalletRow[] | null) ?? []).map((wallet) => [wallet.profile_id, wallet]),
  );
  return rankHigherLowerWeek(
    runs
      .filter((run) => usernames.has(run.profile_id))
      .map((run) => {
        const wallet = usernames.get(run.profile_id)!;
        return {
          profileId: run.profile_id,
          username: wallet.username ?? "Anonymous member",
          avatarUrl: wallet.avatar_url ?? null,
          score: Number(run.run_score),
          league: run.league,
          puzzleDate: run.puzzle_date,
        };
      }),
    currentProfileId,
  );
}

async function buildGame(
  service: ReturnType<typeof createBettingServiceClient>,
  league: HigherLowerLeague,
  puzzleDate: string,
  profileId: string,
  canReplay: boolean,
): Promise<HigherLowerGame> {
  const weekStart = utcWeekStart(new Date(`${puzzleDate}T12:00:00.000Z`));
  const [run, weeklyLeaderboard] = await Promise.all([
    loadRun(service, puzzleDate, league, profileId),
    loadLeaderboard(service, weekStart, profileId),
  ]);
  if (!run || run.run_state === "not_started") {
    return {
      date: puzzleDate,
      weekStart,
      league,
      state: "not_started",
      score: 0,
      round: 0,
      totalRounds: HIGHER_LOWER_ROUNDS,
      runVersion: run?.run_version ?? 0,
      canReplay,
      roundExpiresAt: null,
      referenceCard: null,
      challengerCard: null,
      challenger: null,
      lastChoice: null,
      lastCorrect: null,
      completionReason: null,
      weeklyLeaderboard,
    };
  }

  const candidates = await loadCandidates(service, puzzleDate, league, [
    run.reference_player_slug ?? "",
    run.challenger_player_slug ?? "",
  ]);
  const referenceCard = frozenCard(candidates.get(run.reference_player_slug ?? ""));
  const challengerCard = frozenCard(candidates.get(run.challenger_player_slug ?? ""));
  const concealed = concealHigherLowerCard(challengerCard);
  const awaitingChoice = run.run_state === "awaiting_choice";
  return {
    date: puzzleDate,
    weekStart,
    league,
    state: run.run_state,
    score: Number(run.run_score),
    round: Number(run.round_number),
    totalRounds: HIGHER_LOWER_ROUNDS,
    runVersion: Number(run.run_version),
    canReplay,
    roundExpiresAt: awaitingChoice ? run.round_expires_at : null,
    referenceCard,
    challengerCard: awaitingChoice ? null : challengerCard,
    challenger: awaitingChoice ? concealed : null,
    lastChoice: run.last_choice,
    lastCorrect: run.last_correct,
    completionReason: run.completion_reason,
    weeklyLeaderboard,
  };
}

export async function getHigherLowerGame(league: HigherLowerLeague): Promise<HigherLowerGame> {
  const validLeague = parseLeague(league);
  const { server, service, profileId, isOwner } = await requirePremiumPlayer();
  const puzzleDate = todayUtc();
  await ensureSnapshot(server, service, validLeague, puzzleDate);
  return buildGame(service, validLeague, puzzleDate, profileId, isOwner);
}

export async function startHigherLowerRun(league: HigherLowerLeague): Promise<HigherLowerGame> {
  const validLeague = parseLeague(league);
  const { server, service, profileId, discordId, isOwner } = await requirePremiumPlayer();
  const puzzleDate = todayUtc();
  await ensureSnapshot(server, service, validLeague, puzzleDate);
  const { error } = await service.rpc(isOwner ? "start_higher_lower_owner_run" : "start_higher_lower_run", {
    p_puzzle_date: puzzleDate,
    p_league: validLeague,
    p_profile_id: profileId,
    p_discord_id: discordId,
  });
  if (error) throwRpcError(error);
  return buildGame(service, validLeague, puzzleDate, profileId, isOwner);
}

export async function submitHigherLowerChoice(input: unknown): Promise<HigherLowerGame> {
  const parsed = parseRunInput(input, "choice");
  if (parsed.puzzleDate !== todayUtc()) {
    throw new HigherLowerError("STALE_PUZZLE", "That Daily run has expired. Refresh for today's game.");
  }
  const { service, profileId, isOwner } = await requirePremiumPlayer();
  const { error } = await service.rpc("submit_higher_lower_choice", {
    p_puzzle_date: parsed.puzzleDate,
    p_league: parsed.league,
    p_profile_id: profileId,
    p_run_version: parsed.runVersion,
    p_choice: parsed.choice,
  });
  if (error) throwRpcError(error);
  return buildGame(service, parsed.league, parsed.puzzleDate, profileId, isOwner);
}

export async function advanceHigherLowerRound(input: unknown): Promise<HigherLowerGame> {
  const parsed = parseRunInput(input, "advance");
  if (parsed.puzzleDate !== todayUtc()) {
    throw new HigherLowerError("STALE_PUZZLE", "That Daily run has expired. Refresh for today's game.");
  }
  const { service, profileId, isOwner } = await requirePremiumPlayer();
  const { error } = await service.rpc("advance_higher_lower_round", {
    p_puzzle_date: parsed.puzzleDate,
    p_league: parsed.league,
    p_profile_id: profileId,
    p_run_version: parsed.runVersion,
  });
  if (error) throwRpcError(error);
  return buildGame(service, parsed.league, parsed.puzzleDate, profileId, isOwner);
}

export async function settleHigherLowerWeek(weekStart: string): Promise<HigherLowerSettlement> {
  if (!isIsoDate(weekStart) || utcWeekStart(new Date(`${weekStart}T12:00:00.000Z`)) !== weekStart) {
    throw new HigherLowerError("INVALID_INPUT", "Higher or Lower settlement requires a Monday UTC date.");
  }
  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("settle_higher_lower_week", { p_week_start: weekStart });
  if (error) throwRpcError(error);
  const row = (data as SettlementRpcRow[] | null)?.[0];
  if (!row) throw new HigherLowerError("PUZZLE_UNAVAILABLE", "Weekly settlement did not return a result.");
  return {
    weekStart: row.week_start,
    topScore: Number(row.top_score),
    prizePool: Number(row.prize_pool),
    winnerCount: Number(row.winner_count),
    settledAt: row.settled_at,
    status: "settled",
  };
}

export { HIGHER_LOWER_TIMER_SECONDS };
