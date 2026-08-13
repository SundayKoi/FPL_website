import { fetchMarketCards, fetchOpenPickem } from "@/lib/betting/queries";
import { getBettingUser } from "@/lib/betting/wallet";
import { MarketCard } from "@/components/betting/MarketCard";
import { PickemPanel } from "@/components/betting/PickemPanel";

/** Betting index — the open pick'em (if any), then every market currently
 * open for bets or about to lock. (Resolved/cancelled history belongs to the
 * leaderboard/profile pages.) */
export default async function BettingIndexPage() {
  const user = await getBettingUser();
  const [markets, pickem] = await Promise.all([fetchMarketCards(), fetchOpenPickem(user?.discordId)]);

  return (
    <div>
      <span className="label-dash">Franchise Premier League</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">Events</h1>
      <p className="mt-3 max-w-2xl text-sm text-steel">Pick a match, back a team, and split the pool when they win.</p>

      {pickem && (
        <div className="mt-8">
          <PickemPanel pickem={pickem} balance={user?.balance ?? 0} loggedIn={!!user} />
        </div>
      )}

      {markets.length === 0 ? (
        <div className="mt-10 rounded-lg border border-line bg-panel p-8 text-center text-sm text-steel">
          No markets are open right now — check back closer to game time.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
