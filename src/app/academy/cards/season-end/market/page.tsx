import { SeasonEndMarketView } from "@/app/cards/season-end/market/page";

export default async function AcademySeasonEndMarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return SeasonEndMarketView({ league: "academy", releaseId: typeof params.release === "string" ? params.release : undefined });
}
