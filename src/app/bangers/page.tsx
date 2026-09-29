import type { Metadata } from "next";
import BangerBoard from "@/components/bangers/BangerBoard";
import { fetchBangerPosts, fetchBangerViewerVotes, fetchDailyBanger } from "@/lib/bangers/queries";
import { fetchBangerBoardSettings } from "@/lib/bangers/settings";
import { getBettingUser } from "@/lib/betting/wallet";
import BangerUnavailable from "@/components/bangers/BangerUnavailable";
import type { BangerViewerVotes, DailyBanger } from "@/lib/bangers/queries";
import type { BangerPost } from "@/lib/bangers/feed";
import type { BangerBoardSettings } from "@/lib/bangers/settings";

export const metadata: Metadata = {
  title: "The Daily Stu | FPL Draft League",
  description: "Rate the recent and greatest takes from Stuart69Davis.",
};

export default async function BangersPage() {
  let pageData: {
    posts: BangerPost[];
    dailyBanger: DailyBanger | null;
    settings: BangerBoardSettings;
    patron: boolean;
    initialVotes: BangerViewerVotes["postVotes"];
    initialDailyVote: BangerViewerVotes["dailyVote"];
    initialDailyRewardAmount: number | undefined;
  } | null = null;

  try {
    const [posts, dailyBanger, settings, user] = await Promise.all([fetchBangerPosts(), fetchDailyBanger(), fetchBangerBoardSettings(), getBettingUser()]);
    const viewerVotes = await fetchBangerViewerVotes(dailyBanger?.checkDate);
    pageData = {
      posts,
      dailyBanger,
      settings,
      patron: user?.patron ?? false,
      initialVotes: viewerVotes.postVotes,
      initialDailyVote: viewerVotes.dailyVote,
      initialDailyRewardAmount: viewerVotes.dailyRewardAmount,
    };
  } catch {
    // A verified-feed failure is shown as unavailable, never as an empty archive.
  }

  if (!pageData) return <BangerUnavailable />;
  return <BangerBoard {...pageData} />;
}
