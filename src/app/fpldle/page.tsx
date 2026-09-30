import type { Metadata } from "next";
import { FpldlePageView } from "@/components/fpldle/FpldlePageView";

export const metadata: Metadata = {
  title: "FPL'dle — FPL",
  description: "Find today's Premier league player in five guesses.",
};

export default async function FpldlePage() {
  return FpldlePageView({ league: "premier" });
}
