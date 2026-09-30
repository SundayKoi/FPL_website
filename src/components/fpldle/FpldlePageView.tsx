import DailyGameWall from "@/components/daily/DailyGameWall";
import FpldleBoard from "@/components/fpldle/FpldleBoard";
import FpldleUnavailable from "@/components/fpldle/FpldleUnavailable";
import PlayPageShell from "@/components/play/PlayPageShell";
import { resetFpldlePuzzleAction, revealFpldleAnswerAction, submitFpldleGuessAction } from "@/lib/fpldle/actions";
import { FpldleError, getFpldleGame, type FpldleLeague } from "@/lib/fpldle/server";

/** Today's FPL'dle for one league, shared by /fpldle and /academy/fpldle. */
export async function FpldlePageView({ league }: { league: FpldleLeague }) {
  const label = league === "academy" ? "Academy" : "Premier";
  let game;
  try {
    game = await getFpldleGame(league);
  } catch (error) {
    if (error instanceof FpldleError && error.code === "FORBIDDEN") {
      const redirect = league === "academy" ? "/academy/fpldle" : "/fpldle";
      return <PlayPageShell league={league} active="fpldle"><DailyGameWall league={label} game="FPL'dle" redirect={redirect} message={error.message} /></PlayPageShell>;
    }
    return <PlayPageShell league={league} active="fpldle"><FpldleUnavailable league={label} /></PlayPageShell>;
  }
  return <PlayPageShell league={league} active="fpldle" isAdmin={game.canReset}><FpldleBoard key={game.date} game={game} league={league} submitGuess={submitFpldleGuessAction} revealAnswer={revealFpldleAnswerAction} resetPuzzle={resetFpldlePuzzleAction} /></PlayPageShell>;
}
