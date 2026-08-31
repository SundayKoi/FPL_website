import type { Metadata } from "next";
import { redirect } from "next/navigation";
import GuessTheCardBoard from "@/components/guess-the-card/GuessTheCardBoard";
import GuessTheCardUnavailable from "@/components/guess-the-card/GuessTheCardUnavailable";
import { resetGuessTheCardPuzzleAction, submitGuessTheCardAction } from "@/lib/guess-the-card/actions";
import { GuessTheCardError, getGuessTheCardGame } from "@/lib/guess-the-card/server";

export const metadata: Metadata = {
  title: "Guess the Card — FPL",
  description: "Identify today's Premier player from a completed game.",
};

export default async function GuessTheCardPage() {
  let game;
  try {
    game = await getGuessTheCardGame("premier");
  } catch (error) {
    if (error instanceof GuessTheCardError && error.code === "FORBIDDEN") redirect("/premium");
    return <GuessTheCardUnavailable league="Premier" />;
  }
  return <GuessTheCardBoard initialGame={game} submitGuess={submitGuessTheCardAction} resetPuzzle={resetGuessTheCardPuzzleAction} />;
}
