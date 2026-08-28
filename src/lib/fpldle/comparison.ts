export type FpldleLeague = "premier" | "academy";
export type FpldleDivision = "Solari" | "Lunari";

export interface FpldleCandidate {
  slug: string;
  name: string;
  tag: string;
  team: string;
  teamLogoUrl: string | null;
  position: string;
  champion: string;
  overall: number;
  division: FpldleDivision | null;
}

export type FpldlePlayerLabel = Pick<FpldleCandidate, "slug" | "name" | "tag">;
export type FpldlePlayerPreview = FpldlePlayerLabel & Pick<FpldleCandidate, "position">;

export type ExactClue = "match" | "miss";
export type OverallClue = "equal" | "higher" | "lower";
export type DivisionClue = ExactClue | "unavailable";

export interface FpldleFeedback {
  player: FpldlePlayerLabel;
  team: ExactClue;
  teamName: string;
  teamLogoUrl: string | null;
  position: ExactClue;
  positionName: string;
  champion: ExactClue;
  championName: string;
  overall: OverallClue;
  overallValue: number;
  division: DivisionClue;
  divisionName: FpldleDivision | null;
  isCorrect: boolean;
}

export function compareFpldleGuess(
  guess: FpldleCandidate,
  target: FpldleCandidate,
): FpldleFeedback {
  return {
    player: { slug: guess.slug, name: guess.name, tag: guess.tag },
    team: guess.team === target.team ? "match" : "miss",
    teamName: guess.team,
    teamLogoUrl: guess.teamLogoUrl,
    position: guess.position === target.position ? "match" : "miss",
    positionName: guess.position,
    champion: guess.champion === target.champion ? "match" : "miss",
    championName: guess.champion,
    overall:
      guess.overall === target.overall
        ? "equal"
        : target.overall > guess.overall
          ? "higher"
          : "lower",
    overallValue: guess.overall,
    division: target.division === null ? "unavailable" : guess.division === target.division ? "match" : "miss",
    divisionName: guess.division,
    isCorrect: guess.slug === target.slug,
  };
}
