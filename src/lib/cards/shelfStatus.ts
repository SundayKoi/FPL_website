import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchRuns } from "@/lib/expeditions/queries";
import { openFork } from "@/lib/expeditions/routes";

export interface ShelfStatus {
  /** Betting dollars, or null when nobody is signed in. */
  balance: number | null;
  /** Pending trade offers addressed to the viewer this season. */
  offers: number;
  /** Expedition forks waiting on an answer right now. */
  forks: number;
}

const NOBODY: ShelfStatus = { balance: null, offers: 0, forks: 0 };

/**
 * What the cards tab bar shows beside the tabs: the wallet, and how many
 * offers are waiting. Read in the cards layouts so every page under them
 * carries it. Fails quiet — a bar with no chip is a worse outcome than a
 * page that would not load.
 */
export async function cardsShelfStatus(league: CardLeague): Promise<ShelfStatus> {
  try {
    const user = await getBettingUser();
    if (!user) return NOBODY;
    const service = createBettingServiceClient();
    const season = await fetchCardSeason(service, league);
    if (!season) return { balance: user.balance, offers: 0, forks: 0 };
    const now = new Date();
    const [{ count }, runs] = await Promise.all([
      service
        .from("card_trades")
        .select("id", { count: "exact", head: true })
        .eq("to_discord", user.discordId)
        .eq("season", season)
        .eq("status", "pending"),
      fetchRuns(service, user.discordId, season),
    ]);
    const forks = runs.filter((run) => run.claimedAt === null && run.forks > 0 && openFork(run, now) !== null).length;
    return { balance: user.balance, offers: count ?? 0, forks };
  } catch (error) {
    // Reading the session is what makes a cards route dynamic; Next signals
    // that by throwing, and swallowing it would break the build. Let those
    // through and eat only real failures.
    unstable_rethrow(error);
    console.error("cards: shelf status failed", error);
    return NOBODY;
  }
}
