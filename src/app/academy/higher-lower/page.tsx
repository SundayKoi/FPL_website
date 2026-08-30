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

export const metadata: Metadata = {
  title: "Academy Higher or Lower — FPL",
  description: "Judge whether today's Academy player-card challengers have a higher or lower OVR.",
};

export default async function AcademyHigherLowerPage() {
  let game;
  try {
    game = await getHigherLowerGame("academy");
  } catch (error) {
    if (error instanceof HigherLowerError && error.code === "FORBIDDEN") {
      return <HigherLowerAccessNotice league="Academy" />;
    }
    return <HigherLowerUnavailable league="Academy" />;
  }
  return (
    <HigherLowerBoard
      initialGame={game}
      league="academy"
      startRun={startHigherLowerRunAction}
      submitChoice={submitHigherLowerChoiceAction}
      advanceRound={advanceHigherLowerRoundAction}
    />
  );
}
