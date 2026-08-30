import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import type { PlayerCardData } from "@/lib/cards/build";
import type {
  ConcealedHigherLowerCard,
  HigherLowerChoice,
  HigherLowerLeaderboardRow,
} from "./types";

export interface DifficultyBand {
  minGap: number;
  maxGap: number;
}

export const HIGHER_LOWER_ROUNDS = 45;
export const HIGHER_LOWER_TIMER_SECONDS = 20;

const DIFFICULTY_BANDS: Array<{ through: number; band: DifficultyBand }> = [
  { through: 5, band: { minGap: 30, maxGap: 99 } },
  { through: 10, band: { minGap: 21, maxGap: 30 } },
  { through: 15, band: { minGap: 15, maxGap: 22 } },
  { through: 20, band: { minGap: 10, maxGap: 16 } },
  { through: 25, band: { minGap: 7, maxGap: 12 } },
  { through: 45, band: { minGap: 4, maxGap: 9 } },
];

export function difficultyForRound(round: number): DifficultyBand {
  if (!Number.isInteger(round) || round < 1 || round > HIGHER_LOWER_ROUNDS) {
    throw new RangeError("Higher or Lower round must be between 1 and 45.");
  }
  return DIFFICULTY_BANDS.find((entry) => round <= entry.through)!.band;
}

export function choiceIsCorrect(
  referenceOverall: number,
  challengerOverall: number,
  choice: HigherLowerChoice,
): boolean {
  if (referenceOverall === challengerOverall) return false;
  return choice === "higher" ? challengerOverall > referenceOverall : challengerOverall < referenceOverall;
}

/** Build the only challenger object allowed to cross into a client component. */
export function concealHigherLowerCard(card: PlayerCardData & { editionWeek?: string | null }): ConcealedHigherLowerCard {
  const champion = card.signature?.champion ?? "";
  return {
    slug: card.slug,
    name: card.name,
    artUrl: champion
      ? championCenteredUrl(champion, card.artSkin) ?? championSplashUrl(champion, card.artSkin)
      : null,
    teamName: card.teamName,
    teamAbbr: card.teamAbbr ?? null,
    teamImageUrl: card.teamImageUrl,
    editionWeek: card.editionWeek ?? null,
  };
}

/** Monday of the UTC competition week. Daily card editions use Eastern weeks; this game does not. */
export function utcWeekStart(date: Date): string {
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));
  return monday.toISOString().slice(0, 10);
}

export function rankHigherLowerWeek(
  runs: Array<{
    profileId: string;
    username: string;
    avatarUrl: string | null;
    score: number;
    league: "premier" | "academy";
    puzzleDate: string;
  }>,
  currentProfileId: string,
): HigherLowerLeaderboardRow[] {
  const bestByProfile = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const held = bestByProfile.get(run.profileId);
    if (
      !held ||
      run.score > held.score ||
      (run.score === held.score &&
        `${run.puzzleDate}:${run.league}` < `${held.puzzleDate}:${held.league}`)
    ) {
      bestByProfile.set(run.profileId, run);
    }
  }
  const ranked = [...bestByProfile.values()].sort(
    (a, b) => b.score - a.score || a.username.localeCompare(b.username) || a.profileId.localeCompare(b.profileId),
  );
  const rows = ranked.map((run) => ({
    username: run.username,
    avatarUrl: run.avatarUrl,
    score: run.score,
    rank: ranked.findIndex((candidate) => candidate.score === run.score) + 1,
    league: run.league,
    achievedDate: run.puzzleDate,
    isCurrentUser: run.profileId === currentProfileId,
  }));
  const current = rows.find((row) => row.isCurrentUser);
  return current && !rows.slice(0, 10).includes(current) ? [...rows.slice(0, 10), current] : rows.slice(0, 10);
}
