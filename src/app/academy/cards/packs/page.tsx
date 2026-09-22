import type { Metadata } from "next";
import { PacksPageView } from "@/app/cards/packs/page";

export const metadata: Metadata = {
  title: "Academy Packs — FPL",
  description: "Spend betting dollars on packs of Academy player cards and build a collection.",
};

export default async function AcademyPacksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const releaseId = typeof params.release === "string" ? params.release : undefined;
  return PacksPageView({ league: "academy", releaseId });
}
