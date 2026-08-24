import type { Metadata } from "next";
import { CardStatsPageView } from "@/app/cards/stats/page";

export const metadata: Metadata = {
  title: "Academy Card Ledger — FPL",
  description: "Every pack opened, dollar spent, and rare pull in the Academy card economy.",
};

export default async function AcademyCardStatsPage() {
  return CardStatsPageView({ league: "academy" });
}
