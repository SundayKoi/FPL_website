import type { Metadata } from "next";
import DailyGameWall from "@/components/daily/DailyGameWall";
import GuessTheCardBoard from "@/components/guess-the-card/GuessTheCardBoard";
import GuessTheCardUnavailable from "@/components/guess-the-card/GuessTheCardUnavailable";
import { resetGuessTheCardPuzzleAction, submitGuessTheCardAction } from "@/lib/guess-the-card/actions";
import { GuessTheCardError, getGuessTheCardGame } from "@/lib/guess-the-card/server";
import PlayPageShell from "@/components/play/PlayPageShell";

export const metadata: Metadata = {
  title: "Guess the Card — FPL",
  description: "Identify today's Premier player from a completed game.",
};

export default async function GuessTheCardPage() {
  let game;
  try {
    game = await getGuessTheCardGame("premier");
  } catch (error) {
    if (error instanceof GuessTheCardError && error.code === "FORBIDDEN") {
      return <PlayPageShell league="premier" active="guess-the-card"><DailyGameWall league="Premier" game="Guess the Card" redirect="/guess-the-card" message={error.message} testing /></PlayPageShell>;
    }
    return <PlayPageShell league="premier" active="guess-the-card" isAdmin><GuessTheCardUnavailable league="Premier" /></PlayPageShell>;
  }
  return <PlayPageShell league="premier" active="guess-the-card" isAdmin={game.adminTesting}><GuessTheCardBoard initialGame={game} submitGuess={submitGuessTheCardAction} resetPuzzle={resetGuessTheCardPuzzleAction} /></PlayPageShell>;
}
