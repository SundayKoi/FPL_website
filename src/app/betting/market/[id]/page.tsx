import { notFound } from "next/navigation";
import { fetchMarketDetail, fetchOpenBets } from "@/lib/betting/queries";
import { getBettingUser } from "@/lib/betting/wallet";
import { MarketDetail } from "@/components/betting/MarketDetail";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const marketId = Number(id);
  if (!Number.isInteger(marketId)) notFound();

  const detail = await fetchMarketDetail(marketId);
  if (!detail) notFound();

  // The betting layout already gates signed-out/not-allowed visitors before
  // this page renders, but this fetch is independent (and cheap — one
  // idempotent RPC) so the page works standalone too.
  const user = await getBettingUser();
  const openBets = user ? await fetchOpenBets(user.discordId, marketId) : [];

  return <MarketDetail market={detail} balance={user?.balance ?? 0} loggedIn={!!user} openBets={openBets} />;
}
