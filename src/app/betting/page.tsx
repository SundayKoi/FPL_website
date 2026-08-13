import { fetchMarketCards } from "@/lib/betting/queries";
import { MarketCard } from "@/components/betting/MarketCard";

/** Betting index — every market currently open for bets or about to lock.
 * (Resolved/cancelled history belongs to the leaderboard/profile pages,
 * Task 8.) */
export default async function BettingIndexPage() {
  const markets = await fetchMarketCards();

  return (
    <div>
      <span className="label-dash">Franchise Premier League</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">Events</h1>
      <p className="mt-3 max-w-2xl text-sm text-steel">Pick a match, back a team, and split the pool when they win.</p>

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
