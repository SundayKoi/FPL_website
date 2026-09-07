import type { Metadata } from "next";
import DailyGameWall from "@/components/daily/DailyGameWall";
import FpldleBoard from "@/components/fpldle/FpldleBoard";
import FpldleUnavailable from "@/components/fpldle/FpldleUnavailable";
import { resetFpldlePuzzleAction, revealFpldleAnswerAction, submitFpldleGuessAction } from "@/lib/fpldle/actions";
import { FpldleError, getFpldleGame } from "@/lib/fpldle/server";

export const metadata: Metadata = {
  title: "Academy FPL'dle — FPL",
  description: "Find today's Academy league player in five guesses.",
};

export default async function AcademyFpldlePage() {
  let game;
  try {
    game = await getFpldleGame("academy");
  } catch (error) {
    if (error instanceof FpldleError && error.code === "FORBIDDEN") {
      return <DailyGameWall league="Academy" game="FPL'dle" redirect="/academy/fpldle" message={error.message} />;
    }
    return <FpldleUnavailable league="Academy" />;
  }
  return <FpldleBoard key={game.date} game={game} league="academy" submitGuess={submitFpldleGuessAction} revealAnswer={revealFpldleAnswerAction} resetPuzzle={resetFpldlePuzzleAction} />;
}
