import type { Draft } from "@/lib/draft/types";
import { roundMinimum } from "@/lib/draft/derive";
import type { LeagueView } from "@/lib/league/context";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setup",
  live: "Live",
  paused: "Paused",
  complete: "Complete",
};

const STATUS_CLASS: Record<string, string> = {
  live: "bg-mint/15 text-mint",
  paused: "bg-gold/15 text-gold",
  complete: "bg-surface text-muted",
  setup: "bg-surface text-muted",
};

export default function DraftHeader({ draft, league }: { draft: Draft; league?: LeagueView }) {
  const minimum = draft.round_minimums.length ? roundMinimum(draft) : null;

  return (
    <header className="card-brand flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {league ? <span className="label-dash">{league === "academy" ? "FPL Academy" : "Premier League"}</span> : null}
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
    </header>
  );
}
