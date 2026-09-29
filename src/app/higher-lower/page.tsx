import type { Metadata } from "next";
import HigherLowerBoard from "@/components/higher-lower/HigherLowerBoard";
import HigherLowerAccessNotice from "@/components/higher-lower/HigherLowerAccessNotice";
import HigherLowerUnavailable from "@/components/higher-lower/HigherLowerUnavailable";
import {
  advanceHigherLowerRoundAction,
  startHigherLowerRunAction,
  submitHigherLowerChoiceAction,
} from "@/lib/higher-lower/actions";
import { getHigherLowerGame, HigherLowerError } from "@/lib/higher-lower/server";
import PlayPageShell from "@/components/play/PlayPageShell";

export const metadata: Metadata = {
  title: "Higher or Lower — FPL",
  description: "Judge whether today's Premier player-card challengers have a higher or lower OVR.",
};

export default async function HigherLowerPage() {
  let game;
  try {
    game = await getHigherLowerGame("premier");
  } catch (error) {
    if (error instanceof HigherLowerError && error.code === "FORBIDDEN") {
      return <PlayPageShell league="premier" active="higher-lower"><HigherLowerAccessNotice league="Premier" message={error.message} /></PlayPageShell>;
    }
    return <PlayPageShell league="premier" active="higher-lower"><HigherLowerUnavailable league="Premier" /></PlayPageShell>;
  }
  return (
    <PlayPageShell league="premier" active="higher-lower" isAdmin={game.isAdmin}>
    <HigherLowerBoard
      initialGame={game}
      league="premier"
      startRun={startHigherLowerRunAction}
      submitChoice={submitHigherLowerChoiceAction}
      advanceRound={advanceHigherLowerRoundAction}
    />
    </PlayPageShell>
  );
}
