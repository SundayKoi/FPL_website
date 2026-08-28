import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  compareFpldleGuess,
  type FpldleCandidate,
  type FpldleFeedback,
  type FpldleLeague,
  type FpldlePlayerLabel,
} from "./comparison";

export type { FpldleCandidate, FpldleFeedback, FpldleLeague, FpldlePlayerLabel } from "./comparison";

export interface FpldleGame {
  date: string;
  expiresAt: string;
  /** Reserved for account-backed progress. Browser progress is merged by the client. */
  previousGuesses: string[];
  candidates: FpldlePlayerLabel[];
}

export interface FpldleSubmission {
  feedback: FpldleFeedback;
}

export interface FpldleAnswerReveal {
  name: string;
  tag: string;
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
  position: string;
  champion: string;
  overall: number;
};

type PuzzleRow = {
  puzzle_date: string;
  league: FpldleLeague;
  created_at: string;
  reset_at: string;
};

type FpldleServiceClient = ReturnType<typeof createBettingServiceClient>;

const MAX_GUESSES = 6;

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
    position: row.position,
    champion: row.champion,
    overall: Number(row.overall),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cardToCandidate(value: unknown): FpldleCandidate | null {
  if (!isRecord(value)) return null;
  const signature = isRecord(value.signature) ? value.signature : null;
  const fields = {
    slug: value.slug,
    name: value.name,
    tag: value.tag,
    team: value.teamName,
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
    position: fields.position,
    champion: fields.champion,
    overall: fields.overall,
  };
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

  const { data: cardRows, error: cardsError } = await service
    .from("card_editions")
    .select("slug, card")
    .eq("season", season)
    .eq("edition_week", editionWeek);
  if (cardsError) throw cardsError;

  const candidates = ((cardRows as { slug: string; card: unknown }[]) ?? [])
    .map((row) => cardToCandidate(row.card))
    .filter((candidate): candidate is FpldleCandidate => candidate !== null)
    .map((candidate) => ({
      player_slug: candidate.slug,
      player_name: candidate.name,
      player_tag: candidate.tag,
      team: candidate.team,
      position: candidate.position,
      champion: candidate.champion,
      overall: candidate.overall,
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
  server: SupabaseClient,
  league: FpldleLeague,
  puzzleDate: string,
): Promise<FpldlePlayerLabel[]> {
  const { data, error } = await server
    .from("fpldle_daily_candidates")
    .select("player_slug, player_name, player_tag")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .order("player_name", { ascending: true });
  if (error) throw error;
  return ((data as Pick<FpldleCandidateRow, "player_slug" | "player_name" | "player_tag">[]) ?? []).map((row) => ({
    slug: row.player_slug,
    name: row.player_name,
    tag: row.player_tag,
  }));
}

/** Ensure today's stable puzzle, then return only public labels and state. */
export async function getFpldleGame(league: FpldleLeague): Promise<FpldleGame> {
  const validLeague = parseLeague(league);
  const date = utcDate();
  const server = await requireFpldleAdmin();
  const service = createBettingServiceClient();
  const puzzle = await ensurePuzzle(server, service, validLeague, date);
  return {
    date: puzzle.puzzle_date,
    expiresAt: puzzle.reset_at,
    previousGuesses: [],
    candidates: await publicCandidates(server, validLeague, date),
  };
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
    throw new FpldleError("INVALID_INPUT", "Answer reveal requires six guesses.");
  }
  const guesses = input.guesses.filter(
    (guess): guess is string =>
      typeof guess === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guess) && guess.length <= 180,
  );
  if (guesses.length !== input.guesses.length || new Set(guesses).size !== guesses.length) {
    throw new FpldleError("INVALID_INPUT", "Answer reveal requires six distinct players.");
  }
  return { league: input.league, puzzleDate: input.puzzleDate, guesses };
}

/** Validate request independently, load hidden answer server-side, and return clue feedback only. */
export async function submitFpldleGuess(input: unknown): Promise<FpldleSubmission> {
  const { league, puzzleDate, playerSlug } = parseSubmission(input);
  if (puzzleDate !== utcDate()) {
    throw new FpldleError("STALE_PUZZLE", "That puzzle has expired. Refresh for today's game.");
  }

  const server = await requireFpldleAdmin();
  const service = createBettingServiceClient();
  await ensurePuzzle(server, service, league, puzzleDate);

  const { data: guessRow, error: guessError } = await service
    .from("fpldle_daily_candidates")
    .select("puzzle_date, league, season, edition_week, player_slug, player_name, player_tag, team, position, champion, overall")
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
    .select("puzzle_date, league, season, edition_week, player_slug, player_name, player_tag, team, position, champion, overall")
    .eq("puzzle_date", puzzleDate)
    .eq("league", league)
    .eq("player_slug", answerSlug)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow) throw new FpldleError("PUZZLE_UNAVAILABLE", "Daily puzzle target is unavailable.");

  return {
    feedback: compareFpldleGuess(rowToCandidate(guessRow as FpldleCandidateRow), rowToCandidate(targetRow as FpldleCandidateRow)),
  };
}

/** Reveal answer only after six distinct, current-puzzle guesses. */
export async function revealFpldleAnswer(input: unknown): Promise<FpldleAnswerReveal> {
  const { league, puzzleDate, guesses } = parseReveal(input);
  if (puzzleDate !== utcDate()) {
    throw new FpldleError("STALE_PUZZLE", "That puzzle has expired. Refresh for today's game.");
  }

  const server = await requireFpldleAdmin();
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
