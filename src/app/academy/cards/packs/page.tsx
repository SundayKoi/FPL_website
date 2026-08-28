import type { Metadata } from "next";
import { PacksPageView } from "@/app/cards/packs/page";

export const metadata: Metadata = {
  title: "Academy Card Packs — FPL",
  description: "Spend betting dollars on packs of Academy player cards and build a collection.",
};

export default async function AcademyPacksPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string }>;
}) {
  const { setWeek } = await searchParams;
  return PacksPageView({ league: "academy", setWeek });
}
