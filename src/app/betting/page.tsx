import type { Metadata } from "next";
import Link from "next/link";
import { fetchEventSummaries } from "@/lib/betting/queries";
import type { EventSummary } from "@/lib/betting/types";

export const metadata: Metadata = {
  title: "Betting — FPL",
};

function nextLockLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCard({ event }: { event: EventSummary }) {
  const live = event.open_markets > 0 || event.has_live_pickem;
  return (
    <Link
      href={`/betting/event/${event.id}`}
      className="card-brand block p-5 transition hover:border-action-text"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-display text-2xl">{event.name}</h2>
        {event.has_live_pickem && (
          <span className="shrink-0 rounded-full border border-mint/40 bg-mint/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mint">
            Pick&apos;em live
          </span>
        )}
      </div>
      {event.description && <p className="mt-2 text-sm leading-6 text-muted">{event.description}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3 text-xs text-muted">
        <span className="font-mono">
          {event.open_markets} open · {event.locked_markets} locked
        </span>
        {event.next_lock_at ? (
          <span>Next lock {nextLockLabel(event.next_lock_at)}</span>
        ) : (
          !live && <span>No markets open right now</span>
        )}
        <span className="ml-auto font-semibold uppercase tracking-wide text-action-text">Enter →</span>
      </div>
    </Link>
  );
}

/** Betting index — one card per event (Premier, Academy, …). Each event's
 * pick'em and markets live on its own page, /betting/event/[id]. */
export default async function BettingIndexPage() {
  const events = await fetchEventSummaries();

  return (
    <div>
      <span className="label-dash">Franchise Premier League</span>
      <h1 className="type-display mt-2 text-4xl sm:text-5xl">Events</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Pick your event to see its pick&apos;em and open markets.
      </p>
      <details className="mt-4 max-w-2xl rounded-lg border border-border-subtle bg-surface/60 px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-white">How betting works</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-6">
          <li>
            Your balance is in betting dollars — play money. Every member starts with a signup bonus, and the same
            dollars buy card packs, market listings and Showdown seats.
          </li>
          <li>
            Markets are pari-mutuel: everyone&apos;s stakes on a game go into one pool, and the winning side splits it in
            proportion to what they staked. The odds you see are the live split, and they move until the market locks.
          </li>
          <li>Each market locks at its game time. You can cash out an open bet before then at the current line.</li>
          <li>Pick&apos;em is separate and free: call every game of the event and climb its own table.</li>
        </ul>
      </details>

      {events.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-lg border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
          <p>No betting events exist yet — check back once a season kicks off.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/betting/leaderboard" className="btn-pill px-4 py-2 text-xs">
              See the leaderboard
            </Link>
            <Link href="/premium" className="btn-pill px-4 py-2 text-xs">
              Everything else in Premium
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
