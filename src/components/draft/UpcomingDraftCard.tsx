import Link from "next/link";
import type { Draft } from "@/lib/draft/types";
import { formatEasternDateTime } from "@/lib/draft/schedule";
import DraftScheduleCountdown from "./DraftScheduleCountdown";

export default function UpcomingDraftCard({ draft }: { draft: Draft }) {
  const startsAt = draft.starts_at ?? null;

  return (
    <article className="card-brand overflow-hidden border-gold/30 bg-gradient-to-br from-gold/10 via-panel to-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="label-dash text-gold">UP NEXT</span>
          <h2 className="type-display mt-2 text-3xl text-white">{draft.name}</h2>
          <p className="mt-2 text-sm text-steel">Draft start · {formatEasternDateTime(startsAt)}</p>
        </div>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
          Preview ready
        </span>
      </div>

      <DraftScheduleCountdown startsAt={startsAt} label="Draft start countdown" />

      <Link
        href={`/draft/${draft.id}`}
        aria-label={`Preview draft board for ${draft.name}`}
        className="mt-5 inline-flex rounded border border-gold/60 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        Preview draft board →
      </Link>
    </article>
  );
}
