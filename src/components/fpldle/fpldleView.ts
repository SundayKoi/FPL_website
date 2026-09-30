// FPL'dle's pure pieces: the board's constants, the checks a stored game
// must pass before it is restored, how a clue reads and is coloured, and
// the text the share button copies.

import type { FpldleFeedback, FpldleLeague, FpldleReward } from "@/lib/fpldle/server";

export const MAX_GUESSES = 5;
export const ROLE_GROUPS = [
  { key: "top", label: "TOP" },
  { key: "jungle", label: "JG" },
  { key: "mid", label: "MID" },
  { key: "adc", label: "ADC" },
  { key: "support", label: "SUP" },
] as const;

export type GameStatus = "playing" | "won" | "lost";

export type StoredProgress = {
  date: string;
  guesses: FpldleFeedback[];
  status: GameStatus;
  answer?: { name: string; tag: string } | null;
  reward?: FpldleReward | null;
};

export function hasCurrentFeedbackShape(value: unknown): value is FpldleFeedback {
  if (typeof value !== "object" || value === null) return false;
  const feedback = value as Partial<FpldleFeedback>;
  return (
    typeof feedback.teamName === "string" &&
    typeof feedback.positionName === "string" &&
    typeof feedback.championName === "string" &&
    typeof feedback.overallValue === "number" &&
    (feedback.teamLogoUrl === null || typeof feedback.teamLogoUrl === "string") &&
    (feedback.divisionName === null || feedback.divisionName === "Solari" || feedback.divisionName === "Lunari")
  );
}

export function hasCurrentRewardShape(value: unknown): value is FpldleReward {
  if (typeof value !== "object" || value === null) return false;
  const reward = value as Partial<FpldleReward>;
  return typeof reward.amount === "number" && typeof reward.balance === "number" && typeof reward.alreadyClaimed === "boolean";
}

type ClueStatus = FpldleFeedback["team"] | FpldleFeedback["overall"] | FpldleFeedback["division"];

export function clueClass(value: ClueStatus) {
  const isMatch = value === "match" || value === "equal";
  return isMatch
    ? "border-mint/60 bg-mint/15 text-mint"
    : "border-border-subtle bg-canvas/60 text-muted";
}

export function positionText(position: string): string {
  const labels: Record<string, string> = {
    top: "TOP",
    jungle: "JG",
    jg: "JG",
    mid: "MID",
    middle: "MID",
    adc: "ADC",
    bot: "ADC",
    bottom: "ADC",
    support: "SUP",
    sup: "SUP",
    utility: "SUP",
  };
  return labels[position.trim().toLocaleLowerCase()] ?? position;
}

export function roleGroupKey(position: string): string {
  const normalized = position.trim().toLocaleLowerCase();
  if (normalized === "jg") return "jungle";
  if (normalized === "middle") return "mid";
  if (normalized === "bot") return "adc";
  if (normalized === "bottom") return "adc";
  if (normalized === "sup") return "support";
  if (normalized === "utility") return "support";
  return normalized;
}

function exactLabel(value: "match" | "miss"): string {
  return value === "match" ? "exact match" : "miss";
}

export function clueLabel(label: string, feedback: FpldleFeedback): string {
  if (label === "Team") return `${label}: ${feedback.teamName}; ${exactLabel(feedback.team)}`;
  if (label === "Role") return `${label}: ${feedback.positionName}; ${exactLabel(feedback.position)}`;
  if (label === "Best champion") return `${label}: ${feedback.championName}; ${exactLabel(feedback.champion)}`;
  if (label === "Overall") {
    return `${label}: ${feedback.overallValue}; ${feedback.overall === "equal" ? "equal" : `target overall ${feedback.overall}`}`;
  }
  if (feedback.division === "unavailable") return `${label}: unavailable for this league`;
  return `${label}: ${feedback.divisionName ?? "unassigned"}; ${exactLabel(feedback.division)}`;
}

export function formatLocalResetTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function shareSquare(value: ClueStatus) {
  if (value === "unavailable") return "⬛";
  const isMatch = value === "match" || value === "equal";
  if (isMatch) return "🟩";
  if (value === "higher") return "⬆️";
  if (value === "lower") return "⬇️";
  return "⬜";
}

export function boardGridClass(showDivision: boolean): string {
  const columns = showDivision
    ? "grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))]"
    : "grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]";
  return `grid min-w-0 ${columns} gap-2`;
}

/** The copied share grid: the puzzle's name and date, then one row of
 *  squares per guess. */
export function shareGridText(league: FpldleLeague, date: string, guesses: FpldleFeedback[], showDivision: boolean): string {
  const grid = guesses.map((guess) => {
    const squares = [
      shareSquare(guess.team),
      shareSquare(guess.position),
      shareSquare(guess.champion),
      shareSquare(guess.overall),
    ];
    if (showDivision) squares.push(shareSquare(guess.division));
    return squares.join("");
  }).join("\n");
  return `FPL'dle ${league === "academy" ? "Academy" : "Premier"} ${date}\n${grid}`;
}
