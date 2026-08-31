import type { Metadata } from "next";
import { redirect } from "next/navigation";
import BoxScoreBoard from "@/components/box-score/BoxScoreBoard";
import BoxScoreUnavailable from "@/components/box-score/BoxScoreUnavailable";
import { resetBoxScorePuzzleAction, submitBoxScoreGuessAction } from "@/lib/box-score/actions";
import { BoxScoreError, getBoxScoreGame } from "@/lib/box-score/server";

export const metadata: Metadata = {
  title: "Academy Box Score — FPL",
  description: "Identify today's Academy player from a completed game box score.",
};

export default async function AcademyBoxScorePage() {
  let game;
  try {
    game = await getBoxScoreGame("academy");
  } catch (error) {
    if (error instanceof BoxScoreError && error.code === "FORBIDDEN") redirect("/premium?league=academy");
    return <BoxScoreUnavailable league="Academy" />;
  }
  return <BoxScoreBoard initialGame={game} submitGuess={submitBoxScoreGuessAction} resetPuzzle={resetBoxScorePuzzleAction} />;
}
