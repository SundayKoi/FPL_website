import type { Metadata } from "next";
import DailyGameWall from "@/components/daily/DailyGameWall";
import FpldleBoard from "@/components/fpldle/FpldleBoard";
import FpldleUnavailable from "@/components/fpldle/FpldleUnavailable";
import { resetFpldlePuzzleAction, submitFpldleGuessAction, revealFpldleAnswerAction } from "@/lib/fpldle/actions";
import { FpldleError, getFpldleGame } from "@/lib/fpldle/server";

export const metadata: Metadata = {
  title: "FPL'dle — FPL",
  description: "Find today's Premier league player in five guesses.",
};

export default async function FpldlePage() {
  let game;
  try {
    game = await getFpldleGame("premier");
  } catch (error) {
    if (error instanceof FpldleError && error.code === "FORBIDDEN") {
      return <DailyGameWall league="Premier" game="FPL'dle" redirect="/fpldle" message={error.message} />;
    }
    return <FpldleUnavailable league="Premier" />;
  }
  return <FpldleBoard key={game.date} game={game} league="premier" submitGuess={submitFpldleGuessAction} revealAnswer={revealFpldleAnswerAction} resetPuzzle={resetFpldlePuzzleAction} />;
}
