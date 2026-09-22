import { SeasonEndCopyView } from "@/components/cards/SeasonEndCopyPage";

export default async function SeasonEndCopyPage({ params }: { params: Promise<{ id: string }> }) {
  return SeasonEndCopyView({ id: (await params).id, league: "premier" });
}
