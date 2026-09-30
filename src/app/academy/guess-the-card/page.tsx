import type { Metadata } from "next";
import { GuessTheCardPageView } from "@/components/guess-the-card/GuessTheCardPageView";

export const metadata: Metadata = {
  title: "Academy Guess the Card — FPL",
  description: "Identify today's Academy player from a completed game.",
};

export default async function AcademyGuessTheCardPage() {
  return GuessTheCardPageView({ league: "academy" });
}
