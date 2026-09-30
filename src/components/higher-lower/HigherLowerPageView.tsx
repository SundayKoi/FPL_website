import HigherLowerBoard from "@/components/higher-lower/HigherLowerBoard";
import HigherLowerAccessNotice from "@/components/higher-lower/HigherLowerAccessNotice";
import HigherLowerUnavailable from "@/components/higher-lower/HigherLowerUnavailable";
import PlayPageShell from "@/components/play/PlayPageShell";
import {
  advanceHigherLowerRoundAction,
  startHigherLowerRunAction,
  submitHigherLowerChoiceAction,
} from "@/lib/higher-lower/actions";
import { getHigherLowerGame, HigherLowerError, type HigherLowerLeague } from "@/lib/higher-lower/server";

/** Today's Higher or Lower for one league, shared by /higher-lower and
 *  /academy/higher-lower. */
export async function HigherLowerPageView({ league }: { league: HigherLowerLeague }) {
  const label = league === "academy" ? "Academy" : "Premier";
  let game;
  try {
    game = await getHigherLowerGame(league);
  } catch (error) {
    if (error instanceof HigherLowerError && error.code === "FORBIDDEN") {
      return <PlayPageShell league={league} active="higher-lower"><HigherLowerAccessNotice league={label} message={error.message} /></PlayPageShell>;
    }
    return <PlayPageShell league={league} active="higher-lower"><HigherLowerUnavailable league={label} /></PlayPageShell>;
  }
  return (
    <PlayPageShell league={league} active="higher-lower" isAdmin={game.isAdmin}>
      <HigherLowerBoard
        initialGame={game}
        league={league}
        startRun={startHigherLowerRunAction}
        submitChoice={submitHigherLowerChoiceAction}
        advanceRound={advanceHigherLowerRoundAction}
      />
    </PlayPageShell>
  );
}
