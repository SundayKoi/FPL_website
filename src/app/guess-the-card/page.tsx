import type { Metadata } from "next";
import { GuessTheCardPageView } from "@/components/guess-the-card/GuessTheCardPageView";

export const metadata: Metadata = {
  title: "Guess the Card — FPL",
  description: "Identify today's Premier player from a completed game.",
};

export default async function GuessTheCardPage() {
  return GuessTheCardPageView({ league: "premier" });
}
