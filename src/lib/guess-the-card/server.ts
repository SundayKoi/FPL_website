import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { cardSlug } from "@/lib/cards/build";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { championSplashUrl } from "@/lib/match-draft/champions";
import { createServerSupabase } from "@/lib/supabase/server";
import { dailyGameDate } from "@/lib/dailyDay";
import {
  revealGuessTheCard,
  type GuessTheCardCandidate,
  type GuessTheCardReveal,
  type GuessTheCardSnapshot,
  type GuessTheCardStatus,
  type GuessTheCardTarget,
} from "./reveal";

export type { GuessTheCardCandidate, GuessTheCardReveal, GuessTheCardSnapshot, GuessTheCardStatus } from "./reveal";
export type GuessTheCardLeague = "premier" | "academy";

export interface GuessTheCardGuess extends GuessTheCardCandidate {
  correct: boolean;
}

export interface GuessTheCardReward {
  amount: number;
  balance: number;
  alreadyClaimed: boolean;
}

export interface GuessTheCardGame {
  date: string;
  expiresAt: string;
  league: GuessTheCardLeague;
  canReset: boolean;
  /** Testing gate marker. This is presentation only; server actions re-check. */
  adminTesting: true;
  candidates: GuessTheCardCandidate[];
  guesses: GuessTheCardGuess[];
  status: GuessTheCardStatus;
  reveal: GuessTheCardReveal;
  reward: GuessTheCardReward | null;
}

export interface GuessTheCardSubmission {
  ok: true;
  correct: boolean;
  game: GuessTheCardGame;
}

export interface GuessTheCardPuzzleReset {
  date: string;
  league: GuessTheCardLeague;
}

type ServiceClient = ReturnType<typeof createBettingServiceClient>;

type RawGuessTheCardRow = {
  match_id: string | null;
  game_date: string | null;
  game_duration_min: number | null;
  team_side: string | null;
  team_name: string | null;
  summoner_name: string | null;
  tag: string | null;
  champion: string | null;
  role: string | null;
  champion_level: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kda: number | null;
  solo_kills: number | null;
  kill_participation_pct: number | null;
  double_kills: number | null;
  triple_kills: number | null;
  quadra_kills: number | null;
  penta_kills: number | null;
  total_damage_to_champions: number | null;
  damage_per_min: number | null;
  damage_share_pct: number | null;
  damage_taken: number | null;
  damage_mitigated: number | null;
  total_healing: number | null;
  gold_earned: number | null;
  gold_per_min: number | null;
  cs: number | null;
  cs_per_min: number | null;
  cs_at_10: number | null;
  gold_at_10: number | null;
  vision_score: number | null;
  dragon_kills: number | null;
  baron_kills: number | null;
  objectives_stolen: number | null;
  objective_damage: number | null;
  turret_damage: number | null;
  game_ended_in_early_surrender: boolean | null;
  win: boolean | null;
};

type CandidateRow = {
  player_slug: string;
  player_name: string;
  player_tag: string;
  role: string;
};

type PuzzleRow = {
  puzzle_date: string;
  league: GuessTheCardLeague;
  answer_slug: string;
  target_stats: Record<string, unknown>;
  reset_at: string;
};

type ProgressRow = {
  guesses: string[] | null;
  status: GuessTheCardStatus | null;
  reward_amount: number | null;
  reward_already_claimed: boolean | null;
};

type RecordGuessRow = {
  accepted: boolean;
  correct: boolean;
  guess_count: number;
  status: GuessTheCardStatus;
  reward_amount: number;
  balance: number;
  already_rewarded: boolean;
};

const MIN_GAME_DURATION = 15;
const GUESS_THE_CARD_RAW_COLUMNS = [
  "match_id",
  "game_date",
  "game_duration_min",
  "team_side",
  "team_name",
  "summoner_name",
  "tag",
  "champion",
  "role",
  "kills",
  "deaths",
  "assists",
  "kda",
  "solo_kills",
  "kill_participation_pct",
  "double_kills",
  "triple_kills",
  "quadra_kills",
  "penta_kills",
  "total_damage_to_champions",
  "damage_per_min",
  "damage_share_pct",
  "damage_taken",
  "damage_mitigated",
  "total_healing",
  "gold_earned",
  "gold_per_min",
  "cs",
  "cs_per_min",
  "cs_at_10",
  "gold_at_10",
  "vision_score",
  "dragon_kills",
  "baron_kills",
  "objectives_stolen",
  "objective_damage",
  "turret_damage",
  "game_ended_in_early_surrender",
  "win",
].join(",");

export type GuessTheCardErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "STALE_PUZZLE"
  | "NO_SEASON"
  | "NO_CANDIDATES"
  | "PUZZLE_UNAVAILABLE"
  | "UNKNOWN_PLAYER"
  | "DUPLICATE_GUESS"
  | "GAME_COMPLETE";

export class GuessTheCardError extends Error {
  constructor(public readonly code: GuessTheCardErrorCode, message: string) {
    super(message);
    this.name = "GuessTheCardError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLeague(value: unknown): value is GuessTheCardLeague {
  return value === "premier" || value === "academy";
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseLeague(value: unknown): GuessTheCardLeague {
  if (!isLeague(value)) throw new GuessTheCardError("INVALID_INPUT", "Choose a valid Guess the Card league.");
  return value;
}

function parseReference(input: unknown): { league: GuessTheCardLeague; puzzleDate: string } {
  if (!isRecord(input) || !isIsoDate(input.puzzleDate)) {
    throw new GuessTheCardError("INVALID_INPUT", "Invalid Guess the Card puzzle.");
  }
  return { league: parseLeague(input.league), puzzleDate: input.puzzleDate };
}

function parseGuess(input: unknown): { league: GuessTheCardLeague; puzzleDate: string; playerSlug: string } {
  if (!isRecord(input) || !isIsoDate(input.puzzleDate)) {
    throw new GuessTheCardError("INVALID_INPUT", "Invalid Guess the Card guess.");
  }
  const league = parseLeague(input.league);
  if (
    typeof input.playerSlug !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.playerSlug) ||
    input.playerSlug.length > 180
  ) {
    throw new GuessTheCardError("INVALID_INPUT", "Invalid Guess the Card player.");
  }
  return { league, puzzleDate: input.puzzleDate, playerSlug: input.playerSlug };
}

async function requireGuessTheCardAdmin(): Promise<{
  server: SupabaseClient;
  service: ServiceClient;
  profileId: string;
  discordId: string;
  patron: boolean;
}> {
  const server = await createServerSupabase();
  const { isAdmin } = await fetchStaffTier(server);
  if (!isAdmin) {
    throw new GuessTheCardError("FORBIDDEN", "Guess the Card is available to admins during testing.");
  }
  const user = await getBettingUser();
  if (!user) {
    throw new GuessTheCardError("FORBIDDEN", "Sign in with Discord to test Guess the Card.");
  }
  return {
    server,
    service: createBettingServiceClient(),
    profileId: user.profileId,
    discordId: user.discordId,
    patron: Boolean(user.patron),
  };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function eligibleRow(row: RawGuessTheCardRow): boolean {
  return (
    hasText(row.match_id) &&
    hasText(row.game_date) &&
    hasNumber(row.game_duration_min) &&
    row.game_duration_min >= MIN_GAME_DURATION &&
    row.game_ended_in_early_surrender !== true &&
    hasText(row.team_side) &&
    hasText(row.team_name) &&
    hasText(row.summoner_name) &&
    hasText(row.tag) &&
    hasText(row.champion) &&
    hasText(row.role) &&
    row.win !== null &&
    hasNumber(row.kills) &&
    hasNumber(row.deaths) &&
    hasNumber(row.assists) &&
    hasNumber(row.kda) &&
    hasNumber(row.solo_kills) &&
    hasNumber(row.kill_participation_pct) &&
    hasNumber(row.double_kills) &&
    hasNumber(row.triple_kills) &&
    hasNumber(row.quadra_kills) &&
    hasNumber(row.penta_kills) &&
    hasNumber(row.total_damage_to_champions) &&
    hasNumber(row.damage_per_min) &&
    hasNumber(row.damage_share_pct) &&
    hasNumber(row.damage_taken) &&
    hasNumber(row.damage_mitigated) &&
    hasNumber(row.total_healing) &&
    hasNumber(row.gold_earned) &&
    hasNumber(row.gold_per_min) &&
    hasNumber(row.cs) &&
    hasNumber(row.cs_per_min) &&
    hasNumber(row.cs_at_10) &&
    hasNumber(row.gold_at_10) &&
    hasNumber(row.vision_score) &&
    hasNumber(row.dragon_kills) &&
    hasNumber(row.baron_kills) &&
    hasNumber(row.objectives_stolen) &&
    hasNumber(row.objective_damage) &&
    hasNumber(row.turret_damage)
  );
}

function displayRole(role: string): string {
  const labels: Record<string, string> = {
    top: "Top",
    jungle: "Jungle",
    jg: "Jungle",
    mid: "Mid",
    middle: "Mid",
    adc: "Bot",
    bot: "Bot",
    bottom: "Bot",
    support: "Support",
    sup: "Support",
    utility: "Support",
  };
  return labels[role.trim().toLowerCase()] ?? role;
}

function toCandidate(row: RawGuessTheCardRow): CandidateRow {
  return {
    player_slug: cardSlug(row.summoner_name!, row.tag!),
    player_name: row.summoner_name!,
    player_tag: row.tag!,
    role: displayRole(row.role!),
  };
}

function uniqueCandidates(rows: RawGuessTheCardRow[]): { candidate: CandidateRow; sourceMatchId: string }[] {
  const seen = new Set<string>();
  const candidates: { candidate: CandidateRow; sourceMatchId: string }[] = [];
  for (const row of rows) {
    if (!eligibleRow(row)) continue;
    const candidate = toCandidate(row);
    if (seen.has(candidate.player_slug)) continue;
    seen.add(candidate.player_slug);
    candidates.push({ candidate, sourceMatchId: row.match_id! });
  }
  return candidates;
}

async function puzzleExists(service: ServiceClient, date: string, league: GuessTheCardLeague): Promise<boolean> {
  const { data, error } = await service
    .from("box_score_daily_puzzles")
    .select("puzzle_date")
    .eq("puzzle_date", date)
    .eq("league", league)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function ensurePuzzle(
  server: SupabaseClient,
  service: ServiceClient,
  league: GuessTheCardLeague,
  date: string,
): Promise<void> {
  if (await puzzleExists(service, date, league)) return;
  const season = await fetchCardSeason(server, league as CardLeague);
  if (!season) throw new GuessTheCardError("NO_SEASON", "This league has no active season.");

  const { data, error } = await service
    .from("raw_stats")
    .select(GUESS_THE_CARD_RAW_COLUMNS)
    .eq("season", season)
    .not("match_id", "is", null)
    .not("game_date", "is", null)
    .not("game_duration_min", "is", null)
    .gte("game_duration_min", MIN_GAME_DURATION)
    .order("game_date", { ascending: false })
    .order("match_id", { ascending: false });
  if (error) throw error;
  const candidates = uniqueCandidates((data as unknown as RawGuessTheCardRow[] | null) ?? []);
  if (candidates.length === 0) {
    throw new GuessTheCardError("NO_CANDIDATES", "No complete current-season games are available yet.");
  }

  const { error: ensureError } = await service.rpc("ensure_box_score_daily_puzzle", {
    p_puzzle_date: date,
    p_league: league,
    p_season: season,
    p_candidates: candidates.map(({ candidate, sourceMatchId }) => ({
      player_slug: candidate.player_slug,
      player_name: candidate.player_name,
      player_tag: candidate.player_tag,
      role: candidate.role,
      source_match_id: sourceMatchId,
    })),
  });
  if (ensureError) throw ensureError;
}

async function loadPuzzle(service: ServiceClient, date: string, league: GuessTheCardLeague): Promise<PuzzleRow> {
  const { data, error } = await service
    .from("box_score_daily_puzzles")
    .select("puzzle_date, league, answer_slug, target_stats, reset_at")
    .eq("puzzle_date", date)
    .eq("league", league)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", "Daily Guess the Card puzzle is unavailable.");
  return data as PuzzleRow;
}

async function loadCandidates(service: ServiceClient, date: string, league: GuessTheCardLeague): Promise<GuessTheCardCandidate[]> {
  const { data, error } = await service
    .from("box_score_daily_candidates")
    .select("player_slug, player_name, player_tag, role")
    .eq("puzzle_date", date)
    .eq("league", league)
    .order("player_name", { ascending: true });
  if (error) throw error;
  return ((data as CandidateRow[] | null) ?? []).map((row) => ({
    slug: row.player_slug,
    name: row.player_name,
    tag: row.player_tag,
    role: row.role,
  }));
}

async function loadProgress(service: ServiceClient, date: string, league: GuessTheCardLeague, profileId: string): Promise<ProgressRow | null> {
  const { data, error } = await service
    .from("box_score_daily_progress")
    .select("guesses, status, reward_amount, reward_already_claimed")
    .eq("puzzle_date", date)
    .eq("league", league)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data as ProgressRow | null) ?? null;
}

function numberFrom(value: unknown, field: string): number {
  if (!hasNumber(value)) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", `Guess the Card target is missing ${field}.`);
  return value;
}

function stringFrom(value: unknown, field: string): string {
  if (!hasText(value)) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", `Guess the Card target is missing ${field}.`);
  return value;
}

function targetFromPuzzle(puzzle: PuzzleRow, answer: GuessTheCardCandidate): GuessTheCardTarget {
  const stats = puzzle.target_stats;
  const result = stats.result === "win" || stats.result === "loss" ? stats.result : null;
  if (!result) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", "Guess the Card target result is invalid.");
  const multikills = stats.multikills;
  if (!isRecord(multikills)) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", "Guess the Card multikills are invalid.");
  return {
    slug: answer.slug,
    name: answer.name,
    tag: answer.tag,
    role: displayRole(stringFrom(stats.role, "role")),
    champion: stringFrom(stats.champion, "champion"),
    championArtUrl: championSplashUrl(stringFrom(stats.champion, "champion")),
    kills: numberFrom(stats.kills, "kills"),
    deaths: numberFrom(stats.deaths, "deaths"),
    assists: numberFrom(stats.assists, "assists"),
    kda: numberFrom(stats.kda, "kda"),
    killParticipationPct: numberFrom(stats.killParticipationPct, "kill participation"),
    totalDamage: numberFrom(stats.totalDamage, "damage"),
    damagePerMin: numberFrom(stats.damagePerMin, "DPM"),
    damageSharePct: numberFrom(stats.damageSharePct, "damage share"),
    cs: numberFrom(stats.cs, "CS"),
    csPerMin: numberFrom(stats.csPerMin, "CSPM"),
    gold: numberFrom(stats.gold, "gold"),
    goldPerMin: numberFrom(stats.goldPerMin, "GPM"),
    csAt10: numberFrom(stats.csAt10, "10-minute CS"),
    goldAt10: numberFrom(stats.goldAt10, "10-minute gold"),
    team: stringFrom(stats.team, "team"),
    date: stringFrom(stats.date, "date"),
    result,
    side: stringFrom(stats.side, "side"),
    durationMin: numberFrom(stats.durationMin, "duration"),
    visionScore: numberFrom(stats.visionScore, "vision score"),
    objectives: numberFrom(stats.objectives, "objectives"),
    damageTaken: numberFrom(stats.damageTaken, "damage taken"),
    damageMitigated: numberFrom(stats.damageMitigated, "damage mitigated"),
    healing: numberFrom(stats.healing, "healing"),
    multikills: {
      doubles: numberFrom(multikills.doubles, "double kills"),
      triples: numberFrom(multikills.triples, "triple kills"),
      quadras: numberFrom(multikills.quadras, "quadra kills"),
      pentas: numberFrom(multikills.pentas, "penta kills"),
    },
    soloKills: numberFrom(stats.soloKills, "solo kills"),
    turretDamage: numberFrom(stats.turretDamage, "turret damage"),
    objectiveDamage: numberFrom(stats.objectiveDamage, "objective damage"),
  };
}

function statusFromProgress(progress: ProgressRow | null): GuessTheCardStatus {
  return progress?.status === "won" || progress?.status === "lost" ? progress.status : "playing";
}

function buildGame(
  league: GuessTheCardLeague,
  puzzle: PuzzleRow,
  candidates: GuessTheCardCandidate[],
  progress: ProgressRow | null,
  balance: number,
  canReset: boolean,
): GuessTheCardGame {
  const answer = candidates.find((candidate) => candidate.slug === puzzle.answer_slug);
  if (!answer) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", "Daily Guess the Card answer label is unavailable.");
  const status = statusFromProgress(progress);
  const guesses = (progress?.guesses ?? [])
    .map((slug) => candidates.find((candidate) => candidate.slug === slug))
    .filter((candidate): candidate is GuessTheCardCandidate => Boolean(candidate))
    .map((candidate) => ({ ...candidate, correct: candidate.slug === answer.slug }));
  const wrongGuesses = guesses.filter((guess) => !guess.correct).map((guess) => guess.slug);
  const snapshot: GuessTheCardSnapshot = {
    date: puzzle.puzzle_date,
    expiresAt: puzzle.reset_at,
    candidates,
    target: targetFromPuzzle(puzzle, answer),
  };
  const rewardAmount = Number(progress?.reward_amount ?? 0);
  return {
    date: puzzle.puzzle_date,
    expiresAt: puzzle.reset_at,
    league,
    canReset,
    adminTesting: true,
    candidates,
    guesses,
    status,
    reveal: revealGuessTheCard(snapshot, wrongGuesses, status),
    reward: rewardAmount > 0
      ? {
          amount: rewardAmount,
          balance,
          alreadyClaimed: Boolean(progress?.reward_already_claimed),
        }
      : null,
  };
}

async function getGameForAdmin(
  service: ServiceClient,
  league: GuessTheCardLeague,
  date: string,
  profileId: string,
  balance: number,
  canReset: boolean,
): Promise<GuessTheCardGame> {
  const [puzzle, candidates, progress] = await Promise.all([
    loadPuzzle(service, date, league),
    loadCandidates(service, date, league),
    loadProgress(service, date, league, profileId),
  ]);
  return buildGame(league, puzzle, candidates, progress, balance, canReset);
}

function rpcErrorCode(error: unknown): GuessTheCardErrorCode | null {
  const message = isRecord(error) && typeof error.message === "string" ? error.message : "";
  if (message.includes("BOX_SCORE_DUPLICATE_GUESS")) return "DUPLICATE_GUESS";
  if (message.includes("BOX_SCORE_GAME_COMPLETE")) return "GAME_COMPLETE";
  if (message.includes("BOX_SCORE_UNKNOWN_PLAYER")) return "UNKNOWN_PLAYER";
  return null;
}

/** Ensure today's frozen game and restore this admin's account-backed progress. */
export async function getGuessTheCardGame(league: GuessTheCardLeague): Promise<GuessTheCardGame> {
  const validLeague = parseLeague(league);
  const date = dailyGameDate();
  const { server, service, profileId } = await requireGuessTheCardAdmin();
  await ensurePuzzle(server, service, validLeague, date);
  const user = await getBettingUser();
  return getGameForAdmin(service, validLeague, date, profileId, user?.balance ?? 0, true);
}

/** Submit only a player reference. Postgres compares it with the hidden answer. */
export async function submitGuessTheCard(input: unknown): Promise<GuessTheCardSubmission> {
  const { league, puzzleDate, playerSlug } = parseGuess(input);
  if (puzzleDate !== dailyGameDate()) {
    throw new GuessTheCardError("STALE_PUZZLE", "That Guess the Card puzzle has expired. Refresh for today's game.");
  }
  const { server, service, profileId, discordId } = await requireGuessTheCardAdmin();
  await ensurePuzzle(server, service, league, puzzleDate);
  const { data, error } = await service.rpc("record_box_score_guess", {
    p_puzzle_date: puzzleDate,
    p_league: league,
    p_profile_id: profileId,
    p_discord_id: discordId,
    p_player_slug: playerSlug,
  });
  if (error) {
    const code = rpcErrorCode(error);
    if (code) throw new GuessTheCardError(code, error.message ?? "Guess the Card guess was not accepted.");
    throw error;
  }
  const row = (data as RecordGuessRow[] | null)?.[0];
  if (!row) throw new GuessTheCardError("PUZZLE_UNAVAILABLE", "Guess the Card progress could not be saved.");
  const user = await getBettingUser();
  const game = await getGameForAdmin(service, league, puzzleDate, profileId, Number(row.balance ?? user?.balance ?? 0), true);
  return { ok: true, correct: Boolean(row.correct), game };
}

/** Admin-only reset for finding several state transitions during testing. */
export async function resetGuessTheCardPuzzle(input: unknown): Promise<GuessTheCardPuzzleReset> {
  const { league, puzzleDate } = parseReference(input);
  if (puzzleDate !== dailyGameDate()) {
    throw new GuessTheCardError("STALE_PUZZLE", "Only today's Guess the Card puzzle can be reset.");
  }
  const { server, service } = await requireGuessTheCardAdmin();
  const { error } = await service.rpc("reset_box_score_daily_puzzle", {
    p_puzzle_date: puzzleDate,
    p_league: league,
  });
  if (error) throw error;
  await ensurePuzzle(server, service, league, puzzleDate);
  return { date: puzzleDate, league };
}

export { revealGuessTheCard };
