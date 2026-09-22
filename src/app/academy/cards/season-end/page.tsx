import { SeasonEndCollectionView } from "@/app/cards/season-end/page";

export default async function AcademySeasonEndCollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return SeasonEndCollectionView({ league: "academy", releaseId: typeof params.release === "string" ? params.release : undefined });
}
