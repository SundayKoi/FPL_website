import { fetchLeaderboard } from "@/lib/betting/queries";
import { getBettingUser } from "@/lib/betting/wallet";
import { LeaderboardTable } from "@/components/betting/LeaderboardTable";

/** Public leaderboard — richest wallets and biggest lifetime net winners.
 * Ported from c:\fpl_gambling\web\src\pages\LeaderboardPage.tsx, reading
 * betting_leaderboard (20260813000006_betting_leaderboard_view.sql). */
export default async function LeaderboardPage() {
  const [byBalance, byProfit, user] = await Promise.all([
    fetchLeaderboard("balance", 25),
    fetchLeaderboard("profit", 25),
    getBettingUser(),
  ]);

  return (
    <div>
      <span className="label-dash">Hall of Fame</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">Leaderboard</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">Richest wallets and biggest lifetime net winners.</p>
      <LeaderboardTable byBalance={byBalance} byProfit={byProfit} meId={user?.discordId ?? null} />
    </div>
  );
}
