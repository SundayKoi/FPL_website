import type { Metadata } from "next";
import { FpldlePageView } from "@/components/fpldle/FpldlePageView";

export const metadata: Metadata = {
  title: "Academy FPL'dle — FPL",
  description: "Find today's Academy league player in five guesses.",
};

export default async function AcademyFpldlePage() {
  return FpldlePageView({ league: "academy" });
}
