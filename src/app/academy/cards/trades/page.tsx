import type { Metadata } from "next";
import { TradesPageView } from "@/app/cards/trades/page";

export const metadata: Metadata = {
  title: "Academy Trade offers — FPL",
  description: "Trade Academy player cards and betting dollars with other collectors.",
};

export default async function AcademyTradesPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const { offer } = await searchParams;
  return TradesPageView({ league: "academy", offer });
}
