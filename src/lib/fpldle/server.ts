import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import type { BettingUser } from "@/lib/betting/types";
import { getBettingUser } from "@/lib/betting/wallet";
import { premiumAccess } from "@/lib/premium/access";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  compareFpldleGuess,
  type FpldleCandidate,
  type FpldleDivision,
  type FpldleFeedback,
  type FpldleLeague,
  type FpldlePlayerPreview,
} from "./comparison";

export type { FpldleCandidate, FpldleDivision, FpldleFeedback, FpldleLeague, FpldlePlayerLabel, FpldlePlayerPreview } from "./comparison";

export interface FpldleGame {
  date: string;
  expiresAt: string;
  canReset: boolean;
  /** Whether the signed-in player is currently eligible for the patron rate. */
  patron?: boolean;
  /** Account-backed progress reconstructed from the frozen daily snapshot. */
  progress: FpldleProgress;
  candidates: FpldlePlayerPreview[];
  streaks: FpldleStreakSnapshot;
}

export type FpldleSubmission =
  | {
      ok: true;
      feedback: FpldleFeedback;
      reward: FpldleReward | null;
      streaks: FpldleStreakSnapshot | null;
    }
  | {
      ok: false;
      code: "PROGRESS_CHANGED";
      message: string;
      progress: FpldleProgress;
    };

export type FpldleGameStatus = "playing" | "won" | "lost";

export interface FpldleProgress {
  guesses: FpldleFeedback[];
  status: FpldleGameStatus;
  answer: FpldleAnswerReveal | null;
  reward: FpldleReward | null;
}

export interface FpldleStreakRow {
  profileId: string;
  username: string;
  avatarUrl: string | null;
  currentStreak: number;
  bestStreak: number;
  rank: number | null;
  isCurrentUser: boolean;
}

export interface FpldleStreakSnapshot {
  /** Top five positive rows plus the current user when outside the top five. */
  leaderboard: FpldleStreakRow[];
  personal: FpldleStreakRow | null;
}

export interface FpldleReward {
  amount: number;
  balance: number;
  alreadyClaimed: boolean;
}

export interface FpldleAnswerReveal {
  name: string;
  tag: string;
}

export interface FpldlePuzzleReset {
  date: string;
  league: FpldleLeague;
}

type FpldleCandidateRow = {
  puzzle_date: string;
  league: FpldleLeague;
  season: string;
  edition_week: string;
  player_slug: string;
  player_name: string;
  player_tag: string;
  team: string;
  team_logo_url: string | null;
  position: string;
  champion: string;
  overall: number;
  division: FpldleDivision | null;
};

type PuzzleRow = {
  puzzle_date: string;
  league: FpldleLeague;
  created_at: string;
  reset_at: string;
};

type FpldleServiceClient = ReturnType<typeof createBettingServiceClient>;
type FpldleProgressRpcRow = {
  accepted: boolean;
  guess_count: number;
  reward_amount: number;
  balance: number;
  already_rewarded: boolean;
};

type FpldleProgressRow = {
  guesses: string[] | null;
  completed_at: string | null;
  reward_amount: number | null;
};

type FpldleStreakRpcRow = {
  profile_id: string;
  username: string;
  avatar_url: string | null;
  current_streak: number;
  best_streak: number;
  rank: number | null;
  is_current_user: boolean;
};

const MAX_GUESSES = 5;

function emptyFpldleProgress(): FpldleProgress {
  return { guesses: [], status: "playing", answer: null, reward: null };
}

async function requireFpldlePremium(): Promise<SupabaseClient> {
  const access = await premiumAccess();
  if (!access.allowed) {
    throw new FpldleError("FORBIDDEN", "FPL'dle is available to Premium members.");
  }
  return createServerSupabase();
}

async function requireFpldleAdmin(): Promise<SupabaseClient> {
  const server = await createServerSupabase();
  const { isAdmin } = await fetchStaffTier(server);
  if (!isAdmin) {
    throw new FpldleError("FORBIDDEN", "FPL'dle is available to admins during testing.");
  }
  return server;
}

export type FpldleErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "STALE_PUZZLE"
  | "NO_SEASON"
  | "NO_EDITION"
  | "NO_CANDIDATES"
  | "UNKNOWN_PLAYER"
  | "PUZZLE_UNAVAILABLE";

export class FpldleError extends Error {
  constructor(
    public readonly code: FpldleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FpldleError";
  }
}

function isFpldleLeague(value: unknown): value is FpldleLeague {
  return value === "premier" || value === "academy";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function utcDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function parseLeague(league: unknown): FpldleLeague {
  if (!isFpldleLeague(league)) {
    throw new FpldleError("INVALID_INPUT", "Choose a valid FPL'dle league.");
  }
  return league;
}

function rowToCandidate(row: FpldleCandidateRow): FpldleCandidate {
  return {
    slug: row.player_slug,
    name: row.player_name,
    tag: row.player_tag,
    team: row.team,
    teamLogoUrl: row.team_logo_url ?? null,
    position: row.position,
    champion: row.champion,
    overall: Number(row.overall),
    division: row.division ?? null,
  };
}

async function recordFpldleGuess(
  service: FpldleServiceClient,
  league: FpldleLeague,
  puzzleDate: string,
  playerSlug: string,
  isCorrect: boolean,
  user: BettingUser | null,
): Promise<
  | { kind: "saved"; reward: FpldleReward | null; guessCount: number; profileId: string }
  | { kind: "conflict" }
  | null
> {
  if (!user?.allowed) return null;

  const { data, error } = await service.rpc("record_fpldle_guess", {
    p_puzzle_date: puzzleDate,
    p_league: league,
    p_profile_id: user.profileId,
    p_discord_id: user.discordId,
    p_player_slug: playerSlug,
    p_is_correct: isCorrect,
  });
  if (error) {
    const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
    if (message.includes("FPLDLE_PUZZLE_COMPLETE") || message.includes("FPLDLE_DUPLICATE_GUESS")) {
      return { kind: "conflict" };
    }
    throw error;
  }
  const row = (data as FpldleProgressRpcRow[] | null)?.[0];
  if (!row) throw new FpldleError("PUZZLE_UNAVAILABLE", "FPL'dle progress could not be saved.");
  const reward = Number(row.reward_amount) > 0
    ? {
        amount: Number(row.reward_amount),
        balance: Number(row.balance),
        alreadyClaimed: row.already_rewarded,
      }
    : null;
  return { kind: "saved", reward, guessCount: Number(row.guess_count), profileId: user.profileId };
}

async function loadFpldleProgress(
  service: FpldleServiceClient,
  league: FpldleLeague,
  puzzleDate: string,
  user: BettingUser | null,
): Promise<FpldleProgress> {
  if (!user?.allowed) return emptyFpldleProgress();

  const { data, error } = await service
    .from("fpldle_daily_progress")
    .select("guesses, completed_at, reward_amount")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("profile_id", user.profileId)
    .maybeSingle();
  if (error) throw error;

  const row = data as FpldleProgressRow | null;
  const guessSlugs = row?.guesses?.filter((slug): slug is string => typeof slug === "string") ?? [];
  if (guessSlugs.length === 0) return emptyFpldleProgress();

  const { data: puzzleData, error: puzzleError } = await service
    .from("fpldle_daily_puzzles")
    .select("answer_slug")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .maybeSingle();
  if (puzzleError) throw puzzleError;
  const answerSlug = (puzzleData as { answer_slug: string } | null)?.answer_slug;
  if (!answerSlug) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle answer is unavailable.");

  const candidateSlugs = [...new Set([...guessSlugs, answerSlug])];
  const { data: candidateData, error: candidateError } = await service
    .from("fpldle_daily_candidates")
    .select("puzzle_date, league, season, edition_week, player_slug, player_name, player_tag, team, team_logo_url, position, champion, overall, division")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .in("player_slug", candidateSlugs);
  if (candidateError) throw candidateError;

  const candidates = new Map(
    ((candidateData as FpldleCandidateRow[] | null) ?? []).map((candidate) => [candidate.player_slug, rowToCandidate(candidate)]),
  );
  const target = candidates.get(answerSlug);
  if (!target || guessSlugs.some((slug) => !candidates.has(slug))) {
    throw new FpldleError("PUZZLE_UNAVAILABLE", "Saved FPL'dle progress could not be restored.");
  }

  const guesses = guessSlugs.map((slug) => compareFpldleGuess(candidates.get(slug)!, target));
  const won = guesses.some((guess) => guess.isCorrect);
  const lost = !won && (Boolean(row?.completed_at) || guesses.length >= MAX_GUESSES);
  const rewardAmount = Number(row?.reward_amount ?? 0);

  return {
    guesses,
    status: won ? "won" : lost ? "lost" : "playing",
    answer: lost ? { name: target.name, tag: target.tag } : null,
    reward: won && rewardAmount > 0
      ? { amount: rewardAmount, balance: user.balance, alreadyClaimed: true }
      : null,
  };
}

async function loadFpldleStreakSnapshot(
  service: FpldleServiceClient,
  league: FpldleLeague,
  puzzleDate: string,
  profileId: string | null,
): Promise<FpldleStreakSnapshot> {
  const { data, error } = await service.rpc("get_fpldle_streak_snapshot", {
    p_league: league,
    p_puzzle_date: puzzleDate,
    p_profile_id: profileId,
  });
  if (error) throw error;

  const rows = ((data as FpldleStreakRpcRow[] | null) ?? []).map((row) => ({
    profileId: row.profile_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    currentStreak: Number(row.current_streak),
    bestStreak: Number(row.best_streak),
    rank: row.rank === null ? null : Number(row.rank),
    isCurrentUser: row.is_current_user,
  }));
  return {
    leaderboard: rows,
    personal: rows.find((row) => row.isCurrentUser) ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cardToCandidate(
  value: unknown,
  divisionByTeam: Map<string, FpldleDivision>,
  league: FpldleLeague,
): FpldleCandidate | null {
  if (!isRecord(value)) return null;
  const signature = isRecord(value.signature) ? value.signature : null;
  const fields = {
    slug: value.slug,
    name: value.name,
    tag: value.tag,
    team: value.teamName,
    teamLogoUrl: typeof value.teamImageUrl === "string" ? value.teamImageUrl : null,
    position: value.role,
    champion: signature?.champion,
    overall: value.overall,
  };
  if (
    typeof fields.slug !== "string" ||
    typeof fields.name !== "string" ||
    typeof fields.tag !== "string" ||
    typeof fields.team !== "string" ||
    typeof fields.position !== "string" ||
    typeof fields.champion !== "string" ||
    typeof fields.overall !== "number" ||
    !Number.isInteger(fields.overall) ||
    fields.overall < 1 ||
    fields.overall > 99 ||
    !fields.slug.trim() ||
    !fields.name.trim() ||
    !fields.tag.trim() ||
    !fields.team.trim() ||
    !fields.position.trim() ||
    !fields.champion.trim()
  ) {
    return null;
  }
  return {
    slug: fields.slug,
    name: fields.name,
    tag: fields.tag,
    team: fields.team,
    teamLogoUrl: fields.teamLogoUrl,
    position: fields.position,
    champion: fields.champion,
    overall: fields.overall,
    division: league === "premier" ? divisionByTeam.get(teamKey(fields.team)) ?? null : null,
  };
}

function teamKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

async function fpldleDivisions(
  service: FpldleServiceClient,
  league: FpldleLeague,
  season: string,
): Promise<Map<string, FpldleDivision>> {
  const divisions = new Map<string, FpldleDivision>();
  if (league === "academy") return divisions;

  const { data: settings, error: settingsError } = await service
    .from("league_settings")
    .select("current_season, featured_draft_id")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) throw settingsError;
  const row = settings as { current_season: string | null; featured_draft_id: string | null } | null;
  if (!row?.featured_draft_id || row.current_season !== season) return divisions;

  const { data: teamRows, error: teamsError } = await service
    .from("teams")
    .select("name, division")
    .eq("draft_id", row.featured_draft_id);
  if (teamsError) throw teamsError;

  for (const team of (teamRows as { name: string; division: string | null }[]) ?? []) {
    if (team.division === "Solari" || team.division === "Lunari") {
      divisions.set(teamKey(team.name), team.division);
    }
  }
  return divisions;
}

async function latestEdition(
  service: FpldleServiceClient,
  season: string,
): Promise<string | null> {
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

async function ensurePuzzle(
  server: SupabaseClient,
  service: FpldleServiceClient,
  league: FpldleLeague,
  puzzleDate: string,
): Promise<PuzzleRow> {
  const season = await fetchCardSeason(server, league as CardLeague);
  if (!season) throw new FpldleError("NO_SEASON", "This league has no active season.");

  const editionWeek = await latestEdition(service, season);
  if (!editionWeek) {
    throw new FpldleError("NO_EDITION", "No frozen card edition is available yet.");
  }

  const divisionByTeam = await fpldleDivisions(service, league, season);

  const { data: cardRows, error: cardsError } = await service
    .from("card_editions")
    .select("slug, card")
    .eq("season", season)
    .eq("edition_week", editionWeek);
  if (cardsError) throw cardsError;

  const candidates = ((cardRows as { slug: string; card: unknown }[]) ?? [])
    .map((row) => cardToCandidate(row.card, divisionByTeam, league))
    .filter((candidate): candidate is FpldleCandidate => candidate !== null)
    .map((candidate) => ({
      player_slug: candidate.slug,
      player_name: candidate.name,
      player_tag: candidate.tag,
      team: candidate.team,
      team_logo_url: candidate.teamLogoUrl,
      position: candidate.position,
      champion: candidate.champion,
      overall: candidate.overall,
      division: candidate.division,
    }));

  if (candidates.length === 0) {
    throw new FpldleError("NO_CANDIDATES", "No complete player cards are available yet.");
  }

  const { error: ensureError } = await service.rpc("ensure_fpldle_daily_puzzle", {
    p_puzzle_date: puzzleDate,
    p_league: league,
    p_season: season,
    p_edition_week: editionWeek,
    p_candidates: candidates,
  });
  if (ensureError) throw ensureError;

  const { data, error } = await service
    .from("fpldle_daily_puzzles")
    .select("puzzle_date, league, created_at, reset_at")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle could not be created.");
  return data as PuzzleRow;
}

async function publicCandidates(
  service: FpldleServiceClient,
  league: FpldleLeague,
  puzzleDate: string,
): Promise<FpldlePlayerPreview[]> {
  const { data, error } = await service
    .from("fpldle_daily_candidates")
    .select("player_slug, player_name, player_tag, position")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .order("player_name", { ascending: true });
  if (error) throw error;
  return ((data as Pick<FpldleCandidateRow, "player_slug" | "player_name" | "player_tag" | "position">[]) ?? []).map((row) => ({
    slug: row.player_slug,
    name: row.player_name,
    tag: row.player_tag,
    position: row.position,
  }));
}

/** Ensure today's stable puzzle, then return only public labels and state. */
export async function getFpldleGame(league: FpldleLeague): Promise<FpldleGame> {
  const validLeague = parseLeague(league);
  const date = utcDate();
  const server = await requireFpldlePremium();
  const { isAdmin } = await fetchStaffTier(server);
  const service = createBettingServiceClient();
  const puzzle = await ensurePuzzle(server, service, validLeague, date);
  const user = await getBettingUser();
  const [candidates, streaks, progress] = await Promise.all([
    publicCandidates(service, validLeague, date),
    loadFpldleStreakSnapshot(service, validLeague, date, user?.profileId ?? null),
    loadFpldleProgress(service, validLeague, date, user),
  ]);
  return {
    date: puzzle.puzzle_date,
    expiresAt: puzzle.reset_at,
    canReset: isAdmin,
    ...(user?.patron ? { patron: true } : {}),
    progress,
    candidates,
    streaks,
  };
}

function parsePuzzleReference(input: unknown): { league: FpldleLeague; puzzleDate: string } {
  if (!isRecord(input)) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle puzzle.");
  }
  const league = parseLeague(input.league);
  if (!isIsoDate(input.puzzleDate)) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle puzzle date.");
  }
  return { league, puzzleDate: input.puzzleDate };
}

function parseSubmission(input: unknown): {
  league: FpldleLeague;
  puzzleDate: string;
  playerSlug: string;
} {
  if (!isRecord(input)) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle guess.");
  }
  const league = parseLeague(input.league);
  if (!isIsoDate(input.puzzleDate)) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle puzzle date.");
  }
  if (
    typeof input.playerSlug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.playerSlug) ||
    input.playerSlug.length > 180
  ) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle player.");
  }
  return { league, puzzleDate: input.puzzleDate, playerSlug: input.playerSlug };
}

function parseReveal(input: unknown): { league: FpldleLeague; puzzleDate: string; guesses: string[] } {
  if (!isRecord(input) || !isFpldleLeague(input.league) || !isIsoDate(input.puzzleDate)) {
    throw new FpldleError("INVALID_INPUT", "Invalid FPL'dle answer reveal.");
  }
  if (!Array.isArray(input.guesses) || input.guesses.length !== MAX_GUESSES) {
    throw new FpldleError("INVALID_INPUT", "Answer reveal requires five guesses.");
  }
  const guesses = input.guesses.filter(
    (guess): guess is string =>
      typeof guess === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guess) && guess.length <= 180,
  );
  if (guesses.length !== input.guesses.length || new Set(guesses).size !== guesses.length) {
    throw new FpldleError("INVALID_INPUT", "Answer reveal requires five distinct players.");
  }
  return { league: input.league, puzzleDate: input.puzzleDate, guesses };
}

/** Validate request independently, load hidden answer server-side, and return clue feedback only. */
export async function submitFpldleGuess(input: unknown): Promise<FpldleSubmission> {
  const { league, puzzleDate, playerSlug } = parseSubmission(input);
  if (puzzleDate !== utcDate()) {
    throw new FpldleError("STALE_PUZZLE", "That puzzle has expired. Refresh for today's game.");
  }

  const server = await requireFpldlePremium();
  const service = createBettingServiceClient();
  await ensurePuzzle(server, service, league, puzzleDate);

  const { data: guessRow, error: guessError } = await service
    .from("fpldle_daily_candidates")
    .select("puzzle_date, league, season, edition_week, player_slug, player_name, player_tag, team, team_logo_url, position, champion, overall, division")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("player_slug", playerSlug)
    .maybeSingle();
  if (guessError) throw guessError;
  if (!guessRow) throw new FpldleError("UNKNOWN_PLAYER", "That player is not in today's puzzle.");

  const { data: puzzleRow, error: puzzleError } = await service
    .from("fpldle_daily_puzzles")
    .select("answer_slug")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .maybeSingle();
  if (puzzleError) throw puzzleError;
  const answerSlug = (puzzleRow as { answer_slug: string } | null)?.answer_slug;
  if (!answerSlug) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle answer is unavailable.");

  const { data: targetRow, error: targetError } = await service
    .from("fpldle_daily_candidates")
    .select("puzzle_date, league, season, edition_week, player_slug, player_name, player_tag, team, team_logo_url, position, champion, overall, division")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("player_slug", answerSlug)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle target is unavailable.");

  const feedback = compareFpldleGuess(rowToCandidate(guessRow as FpldleCandidateRow), rowToCandidate(targetRow as FpldleCandidateRow));
  const user = await getBettingUser();
  const progress = await recordFpldleGuess(service, league, puzzleDate, playerSlug, feedback.isCorrect, user);
  if (progress?.kind === "conflict") {
    return {
      ok: false,
      code: "PROGRESS_CHANGED",
      message: "Progress synced from another device.",
      progress: await loadFpldleProgress(service, league, puzzleDate, user),
    };
  }
  const streaks = feedback.isCorrect || (progress?.kind === "saved" && progress.guessCount === MAX_GUESSES)
    ? await loadFpldleStreakSnapshot(service, league, puzzleDate, progress?.kind === "saved" ? progress.profileId : null)
    : null;
  return {
    ok: true,
    feedback,
    reward: progress?.kind === "saved" ? progress.reward : null,
    streaks,
  };
}

/** Admin-only testing reset: remove today's snapshot and immediately choose a new stable answer. */
export async function resetFpldlePuzzle(input: unknown): Promise<FpldlePuzzleReset> {
  const { league, puzzleDate } = parsePuzzleReference(input);
  if (puzzleDate !== utcDate()) {
    throw new FpldleError("STALE_PUZZLE", "Only today's puzzle can be reset.");
  }

  const server = await requireFpldleAdmin();
  const service = createBettingServiceClient();
  const { error } = await service.rpc("reset_fpldle_daily_puzzle", {
    p_puzzle_date: puzzleDate,
    p_league: league,
  });
  if (error) throw error;
  await ensurePuzzle(server, service, league, puzzleDate);
  return { date: puzzleDate, league };
}

/** Reveal answer only after five distinct, current-puzzle guesses. */
export async function revealFpldleAnswer(input: unknown): Promise<FpldleAnswerReveal> {
  const { league, puzzleDate, guesses } = parseReveal(input);
  if (puzzleDate !== utcDate()) {
    throw new FpldleError("STALE_PUZZLE", "That puzzle has expired. Refresh for today's game.");
  }

  const server = await requireFpldlePremium();
  const service = createBettingServiceClient();
  await ensurePuzzle(server, service, league, puzzleDate);

  const { data: guessRows, error: guessError } = await service
    .from("fpldle_daily_candidates")
    .select("player_slug")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .in("player_slug", guesses);
  if (guessError) throw guessError;
  if (((guessRows as { player_slug: string }[]) ?? []).length !== guesses.length) {
    throw new FpldleError("UNKNOWN_PLAYER", "Every reveal guess must be in today's puzzle.");
  }

  const { data: puzzleRow, error: puzzleError } = await service
    .from("fpldle_daily_puzzles")
    .select("answer_slug")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .maybeSingle();
  if (puzzleError) throw puzzleError;
  const answerSlug = (puzzleRow as { answer_slug: string } | null)?.answer_slug;
  if (!answerSlug) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle answer is unavailable.");

  const { data: answerRow, error: answerError } = await service
    .from("fpldle_daily_candidates")
    .select("player_name, player_tag")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("player_slug", answerSlug)
    .maybeSingle();
  if (answerError) throw answerError;
  if (!answerRow) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle target is unavailable.");
  const row = answerRow as { player_name: string; player_tag: string };
  return { name: row.player_name, tag: row.player_tag };
}
