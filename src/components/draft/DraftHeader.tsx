import type { Draft } from "@/lib/draft/types";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setup",
  live: "Live",
  paused: "Paused",
  complete: "Complete",
};

const STATUS_CLASS: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-gold/15 text-gold",
  complete: "bg-panel text-steel",
  setup: "bg-panel text-steel",
};

export default function DraftHeader({ draft, connected }: { draft: Draft; connected: boolean }) {
  const minimum = draft.round_minimums.length
    ? draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1]
    : null;

  return (
    <header className="card-brand flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="type-display text-2xl text-white">{draft.name}</h1>
        <span className="label-dash">Round {draft.current_round}</span>
        {minimum !== null && <span className="label-dash">min {minimum}</span>}
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
          STATUS_CLASS[draft.status] ?? STATUS_CLASS.setup
        }`}
      >
        {STATUS_LABEL[draft.status] ?? draft.status}
      </span>
      {!connected && (
        <span className="w-full rounded border border-red-500/50 bg-red-500/10 px-2 py-1 text-center text-xs text-red-400 sm:w-auto">
          Realtime disconnected — reconnecting…
        </span>
      )}
    </header>
  );
}
