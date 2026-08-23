import type { Metadata } from "next";
import { TeamCardsPageView } from "@/app/cards/teams/page";

export const metadata: Metadata = {
  title: "Academy Team Cards — FPL",
  description: "Academy rosters as composite cards, rated by their five best players.",
};

export default async function AcademyTeamCardsPage() {
  return TeamCardsPageView({ league: "academy" });
}
