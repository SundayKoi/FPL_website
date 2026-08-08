import type { Draft } from "@/lib/draft/types";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setup",
  live: "Live",
  paused: "Paused",
  complete: "Complete",
};

const STATUS_CLASS: Record<string, string> = {
  live: "bg-emerald-700 text-emerald-100",
  paused: "bg-amber-600 text-black",
  complete: "bg-zinc-700 text-zinc-200",
  setup: "bg-zinc-800 text-zinc-400",
};

export default function DraftHeader({ draft, connected }: { draft: Draft; connected: boolean }) {
  const minimum = draft.round_minimums.length
    ? draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1]
    : null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{draft.name}</h1>
        <span className="text-xs text-zinc-500">
          Round {draft.current_round}
          {minimum !== null ? ` · min ${minimum}` : ""}
        </span>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
          STATUS_CLASS[draft.status] ?? STATUS_CLASS.setup
        }`}
      >
        {STATUS_LABEL[draft.status] ?? draft.status}
      </span>
      {!connected && (
        <span className="w-full rounded bg-red-900/60 px-2 py-1 text-center text-xs text-red-200 sm:w-auto">
          Realtime disconnected — reconnecting…
        </span>
      )}
    </header>
  );
}
