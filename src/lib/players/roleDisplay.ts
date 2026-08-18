import type { LolRole } from "@/lib/draft/types";

/** Border/background/text tone classes for each role's pool section — shared
 *  by the Players directory and the preseason player pool. */
export const ROLE_TONES: Record<LolRole, string> = {
  top: "border-violet-300/50 bg-violet-300/10 text-violet-100",
  jungle: "border-mint/50 bg-mint/10 text-mint",
  mid: "border-sky-300/50 bg-sky-300/10 text-sky-100",
  adc: "border-amber-300/50 bg-amber-300/10 text-amber-100",
  support: "border-purple-300/50 bg-purple-300/10 text-purple-100",
};

/** Sortable score for a rank string like "D2" or "Master" — tier hundreds
 *  plus the division digit, 0 for unknown/missing ranks. */
export function rankValue(rank: string | null): number {
  const normalized = rank?.trim().toUpperCase() ?? "";
  const tier = normalized.startsWith("M") ? 5 : normalized.startsWith("D") ? 4 : normalized.startsWith("E") ? 3 : normalized.startsWith("P") ? 2 : normalized.startsWith("G") ? 1 : 0;
  const division = Number(normalized.replace(/^[A-Z]+/, "")) || 0;
  return tier * 100 + division;
}
