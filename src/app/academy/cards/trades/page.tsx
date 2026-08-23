import type { Metadata } from "next";
import { TradesPageView } from "@/app/cards/trades/page";

export const metadata: Metadata = {
  title: "Academy Trading Post — FPL",
  description: "Trade Academy player cards and betting dollars with other collectors.",
};

export default async function AcademyTradesPage() {
  return TradesPageView({ league: "academy" });
}
