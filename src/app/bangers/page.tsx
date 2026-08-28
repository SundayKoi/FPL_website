import type { Metadata } from "next";
import BangerBoard from "@/components/bangers/BangerBoard";
import { fetchBangerPosts, fetchBangerViewerVotes, fetchDailyBanger } from "@/lib/bangers/queries";
import { fetchBangerBoardSettings } from "@/lib/bangers/settings";

export const metadata: Metadata = {
  title: "The Daily Stu | FPL Draft League",
  description: "Rate the recent and greatest takes from Stuart69Davis.",
};

export default async function BangersPage() {
  const [posts, dailyBanger, settings] = await Promise.all([fetchBangerPosts(), fetchDailyBanger(), fetchBangerBoardSettings()]);
  const viewerVotes = await fetchBangerViewerVotes(dailyBanger?.checkDate);
  return <BangerBoard posts={posts} dailyBanger={dailyBanger} settings={settings} initialVotes={viewerVotes.postVotes} initialDailyVote={viewerVotes.dailyVote} />;
}
