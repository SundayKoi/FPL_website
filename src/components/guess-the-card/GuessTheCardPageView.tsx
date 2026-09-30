import DailyGameWall from "@/components/daily/DailyGameWall";
import GuessTheCardBoard from "@/components/guess-the-card/GuessTheCardBoard";
import GuessTheCardUnavailable from "@/components/guess-the-card/GuessTheCardUnavailable";
import PlayPageShell from "@/components/play/PlayPageShell";
import { resetGuessTheCardPuzzleAction, submitGuessTheCardAction } from "@/lib/guess-the-card/actions";
import { GuessTheCardError, getGuessTheCardGame, type GuessTheCardLeague } from "@/lib/guess-the-card/server";

/** Today's Guess the Card for one league, shared by /guess-the-card and
 *  /academy/guess-the-card. */
export async function GuessTheCardPageView({ league }: { league: GuessTheCardLeague }) {
  const label = league === "academy" ? "Academy" : "Premier";
  let game;
  try {
    game = await getGuessTheCardGame(league);
  } catch (error) {
    if (error instanceof GuessTheCardError && error.code === "FORBIDDEN") {
      const redirect = league === "academy" ? "/academy/guess-the-card" : "/guess-the-card";
      return <PlayPageShell league={league} active="guess-the-card"><DailyGameWall league={label} game="Guess the Card" redirect={redirect} message={error.message} testing /></PlayPageShell>;
    }
    return <PlayPageShell league={league} active="guess-the-card" isAdmin><GuessTheCardUnavailable league={label} /></PlayPageShell>;
  }
  return <PlayPageShell league={league} active="guess-the-card" isAdmin={game.adminTesting}><GuessTheCardBoard initialGame={game} submitGuess={submitGuessTheCardAction} resetPuzzle={resetGuessTheCardPuzzleAction} /></PlayPageShell>;
}
