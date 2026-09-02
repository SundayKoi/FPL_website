import Link from "next/link";
import { fetchEventSummaries } from "@/lib/betting/queries";
import type { EventSummary } from "@/lib/betting/types";

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
      className="card-brand block p-5 transition hover:border-primary"
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
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        <span className="font-mono">
          {event.open_markets} open · {event.locked_markets} locked
        </span>
        {event.next_lock_at ? (
          <span>Next lock {nextLockLabel(event.next_lock_at)}</span>
        ) : (
          !live && <span>No markets open right now</span>
        )}
        <span className="ml-auto font-semibold uppercase tracking-wide text-primary">Enter →</span>
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

      {events.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-surface p-8 text-center text-sm text-muted">
          No betting events exist yet — check back once a season kicks off.
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
