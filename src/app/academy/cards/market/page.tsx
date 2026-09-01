import type { Metadata } from "next";
import { MarketPageView } from "@/app/cards/market/page";

export const metadata: Metadata = {
  title: "Academy Card Market — FPL",
  description: "Buy and sell Academy player card copies for betting dollars.",
};

export default async function AcademyMarketPage() {
  return MarketPageView({ league: "academy" });
}
