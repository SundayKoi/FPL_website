import type { Metadata } from "next";
import DailyGameWall from "@/components/daily/DailyGameWall";
import GuessTheCardBoard from "@/components/guess-the-card/GuessTheCardBoard";
import GuessTheCardUnavailable from "@/components/guess-the-card/GuessTheCardUnavailable";
import { resetGuessTheCardPuzzleAction, submitGuessTheCardAction } from "@/lib/guess-the-card/actions";
import { GuessTheCardError, getGuessTheCardGame } from "@/lib/guess-the-card/server";

export const metadata: Metadata = {
  title: "Academy Guess the Card — FPL",
  description: "Identify today's Academy player from a completed game.",
};

export default async function AcademyGuessTheCardPage() {
  let game;
  try {
    game = await getGuessTheCardGame("academy");
  } catch (error) {
    if (error instanceof GuessTheCardError && error.code === "FORBIDDEN") {
      return <DailyGameWall league="Academy" game="Guess the Card" redirect="/academy/guess-the-card" message={error.message} testing />;
    }
    return <GuessTheCardUnavailable league="Academy" />;
  }
  return <GuessTheCardBoard initialGame={game} submitGuess={submitGuessTheCardAction} resetPuzzle={resetGuessTheCardPuzzleAction} />;
}
