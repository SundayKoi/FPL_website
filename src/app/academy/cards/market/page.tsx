import type { Metadata } from "next";
import { MarketPageView } from "@/app/cards/market/page";

export const metadata: Metadata = {
  title: "Academy Market — FPL",
  description: "Buy and sell Academy player card copies for betting dollars.",
};

export default async function AcademyMarketPage({ searchParams }: { searchParams: Promise<{ sell?: string }> }) {
  const { sell } = await searchParams;
  return MarketPageView({ league: "academy", sell });
}
