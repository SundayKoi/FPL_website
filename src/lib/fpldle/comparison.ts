export type FpldleLeague = "premier" | "academy";

export interface FpldleCandidate {
  slug: string;
  name: string;
  tag: string;
  team: string;
  position: string;
  champion: string;
  overall: number;
}

export type FpldlePlayerLabel = Pick<FpldleCandidate, "slug" | "name" | "tag">;

export type ExactClue = "match" | "miss";
export type OverallClue = "equal" | "higher" | "lower";

export interface FpldleFeedback {
  player: FpldlePlayerLabel;
  team: ExactClue;
  position: ExactClue;
  champion: ExactClue;
  overall: OverallClue;
  isCorrect: boolean;
}

export function compareFpldleGuess(
  guess: FpldleCandidate,
  target: FpldleCandidate,
): FpldleFeedback {
  return {
    player: { slug: guess.slug, name: guess.name, tag: guess.tag },
    team: guess.team === target.team ? "match" : "miss",
    position: guess.position === target.position ? "match" : "miss",
    champion: guess.champion === target.champion ? "match" : "miss",
    overall:
      guess.overall === target.overall
        ? "equal"
        : target.overall > guess.overall
          ? "higher"
          : "lower",
    isCorrect: guess.slug === target.slug,
  };
}
