import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchBettingEvent, fetchMarketCards, fetchMySuggestions, fetchOpenPickem } from "@/lib/betting/queries";
import { getBettingUser } from "@/lib/betting/wallet";
import { MarketCard } from "@/components/betting/MarketCard";
import { PickemPanel } from "@/components/betting/PickemPanel";
import { SuggestBetPanel } from "@/components/betting/SuggestBetPanel";

/** One event's betting page — its pick'em (if any), then every market
 * currently open for bets or about to lock, scoped to this event.
 * (Resolved/cancelled history belongs to the leaderboard/profile pages.) */
export default async function BettingEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await fetchBettingEvent(eventId);
  if (!event) notFound();

  const user = await getBettingUser();
  const [markets, pickem, suggestions] = await Promise.all([
    fetchMarketCards(eventId),
    fetchOpenPickem(user?.discordId, eventId),
    user ? fetchMySuggestions(user.discordId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <Link href="/betting" className="text-xs uppercase tracking-wide text-muted hover:text-primary">
        ← Events
      </Link>
      <span className="label-dash mt-4 block">Franchise Premier League</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">{event.name}</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {event.description ?? "Pick a match, back a team, and split the pool when they win."}
      </p>

      {pickem && (
        <div className="mt-8">
          <PickemPanel pickem={pickem} balance={user?.balance ?? 0} loggedIn={!!user} />
        </div>
      )}

      {markets.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
          No {event.name} markets are open right now — check back closer to game time.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}

      <div className="mt-10">
        <SuggestBetPanel suggestions={suggestions} />
      </div>
    </div>
  );
}
