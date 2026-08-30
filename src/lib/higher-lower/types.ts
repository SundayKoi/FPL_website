import type { PlayerCardData } from "@/lib/cards/build";

export type HigherLowerLeague = "premier" | "academy";
export type HigherLowerRunState =
  | "not_started"
  | "awaiting_choice"
  | "correct_reveal"
  | "lost"
  | "perfect";
export type HigherLowerChoice = "higher" | "lower";
export type HigherLowerLastChoice = HigherLowerChoice | "timeout";
export type HigherLowerCompletionReason = "incorrect" | "timeout" | "perfect";

/** Safe challenger DTO. It intentionally has no overall, role, tier, or card stats. */
export interface ConcealedHigherLowerCard {
  slug: string;
  name: string;
  artUrl: string | null;
  teamName: string | null;
  teamAbbr: string | null;
  teamImageUrl: string | null;
}

export interface HigherLowerLeaderboardRow {
  username: string;
  avatarUrl: string | null;
  score: number;
  rank: number;
  league: HigherLowerLeague;
  achievedDate: string;
  isCurrentUser: boolean;
}

export interface HigherLowerGame {
  date: string;
  weekStart: string;
  league: HigherLowerLeague;
  state: HigherLowerRunState;
  score: number;
  round: number;
  totalRounds: 30;
  runVersion: number;
  roundExpiresAt: string | null;
  referenceCard: PlayerCardData | null;
  /** Complete only after a choice has been recorded; concealed while playing. */
  challengerCard: PlayerCardData | null;
  challenger: ConcealedHigherLowerCard | null;
  lastChoice: HigherLowerLastChoice | null;
  lastCorrect: boolean | null;
  completionReason: HigherLowerCompletionReason | null;
  weeklyLeaderboard: HigherLowerLeaderboardRow[];
}

export interface HigherLowerSettlement {
  weekStart: string;
  topScore: number;
  prizePool: number;
  winnerCount: number;
  settledAt: string | null;
  status: "settled";
}
