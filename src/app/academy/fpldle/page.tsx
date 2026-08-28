import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FpldleBoard from "@/components/fpldle/FpldleBoard";
import FpldleUnavailable from "@/components/fpldle/FpldleUnavailable";
import { resetFpldlePuzzleAction, revealFpldleAnswerAction, submitFpldleGuessAction } from "@/lib/fpldle/actions";
import { FpldleError, getFpldleGame } from "@/lib/fpldle/server";

export const metadata: Metadata = {
  title: "Academy FPL'dle — FPL",
  description: "Find today's Academy league player in six guesses.",
};

export default async function AcademyFpldlePage() {
  let game;
  try {
    game = await getFpldleGame("academy");
  } catch (error) {
    if (error instanceof FpldleError && error.code === "FORBIDDEN") redirect("/");
    return <FpldleUnavailable league="Academy" />;
  }
  return <FpldleBoard game={game} league="academy" submitGuess={submitFpldleGuessAction} revealAnswer={revealFpldleAnswerAction} resetPuzzle={resetFpldlePuzzleAction} />;
}
