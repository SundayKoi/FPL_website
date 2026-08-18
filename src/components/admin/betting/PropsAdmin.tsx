"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveProp, rejectProp } from "@/lib/betting/admin-actions";
import { toIso } from "@/lib/betting/format";
import type { PendingSuggestionRow } from "@/lib/betting/queries";

function SuggestionCard({ s, events }: { s: PendingSuggestionRow; events: { id: number; name: string }[] }) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events[0]?.id ?? 0);
  const [gameAt, setGameAt] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveProp(s.id, eventId, toIso(gameAt));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const res = await rejectProp(s.id, reason || undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold text-white">{s.question}</span>
        <span className="text-sm text-steel">
          {s.side_a} / {s.side_b}
        </span>
        <span className="ml-auto text-xs text-steel">
          by {s.username} · {new Date(s.created_at).toLocaleString()}
        </span>
      </div>
      {s.note && <p className="mt-1 text-xs text-steel">Note: {s.note}</p>}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-steel">
          Event
          <select
            value={eventId}
            onChange={(e) => setEventId(Number(e.target.value))}
            className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-white"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-steel">
          Game time (locks 5 min before)
          <input
            type="datetime-local"
            value={gameAt}
            onChange={(e) => setGameAt(e.target.value)}
            className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-white"
          />
        </label>
        <button
          type="button"
          onClick={approve}
          disabled={pending || !eventId || !gameAt}
          className="btn-pill text-sm disabled:opacity-40"
        >
          Approve → market
        </button>
        <label className="grid flex-1 basis-48 gap-1 text-xs text-steel">
          Rejection reason (optional)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Too ambiguous to settle"
            className="rounded border border-line bg-transparent px-2 py-1.5 text-sm text-white placeholder:text-steel/60"
          />
        </label>
        <button
          type="button"
          onClick={reject}
          disabled={pending}
          className="rounded-full border border-red-400/40 px-4 py-1.5 text-sm text-red-400 transition hover:bg-red-400/10 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </li>
  );
}

export default function PropsAdmin({
  suggestions,
  events,
}: {
  suggestions: PendingSuggestionRow[];
  events: { id: number; name: string }[];
}) {
  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-panel p-8 text-center text-sm text-steel">
        No pending suggestions — the queue is clear.
      </div>
    );
  }
  return <ul className="grid gap-4">{suggestions.map((s) => <SuggestionCard key={s.id} s={s} events={events} />)}</ul>;
}
