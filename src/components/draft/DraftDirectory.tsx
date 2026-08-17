import Link from "next/link";
import type { Draft } from "@/lib/draft/types";
import UpcomingDraftCard from "./UpcomingDraftCard";

export default function DraftDirectory({ drafts }: { drafts: Draft[] }) {
  const upcomingDrafts = drafts
    .filter((draft) => draft.status === "setup" && draft.starts_at)
    .sort((left, right) => new Date(left.starts_at!).getTime() - new Date(right.starts_at!).getTime());

  return (
    <main className="bg-hash flex-1">
      <section
        className="mx-auto w-full max-w-7xl px-6 py-10 sm:py-16"
        aria-labelledby="draft-central-title"
      >
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="label-dash">LEAGUE OPERATIONS</span>
            <h1 id="draft-central-title" className="type-display mt-2 text-4xl sm:text-5xl">
              Draft Central
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-steel">
              Get ready for the next room, follow active boards, and revisit every completed draft.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-steel underline underline-offset-4 hover:text-white focus-visible:text-white"
          >
            Admin
          </Link>
        </div>

        {upcomingDrafts.length > 0 && (
          <section aria-labelledby="upcoming-drafts-title" className="mb-8">
            <div className="mb-4">
              <span className="label-dash text-gold">THE NEXT ROOMS</span>
              <h2 id="upcoming-drafts-title" className="type-display mt-2 text-3xl sm:text-4xl">
                Countdown to draft night
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {upcomingDrafts.map((draft) => <UpcomingDraftCard key={draft.id} draft={draft} />)}
            </div>
          </section>
        )}

        {drafts.length === 0 ? (
          <p className="text-sm text-steel">No drafts yet.</p>
        ) : (
          <section aria-labelledby="all-drafts-title">
            <div className="mb-4">
              <span className="label-dash">DRAFT ARCHIVE</span>
              <h2 id="all-drafts-title" className="type-display mt-2 text-3xl sm:text-4xl">All drafts</h2>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/draft/${draft.id}`}
                  className="card-brand flex h-full flex-col gap-2 px-5 py-4 transition-colors hover:border-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                >
                  <span className="type-display text-xl">{draft.name}</span>
                  <span className="text-sm uppercase tracking-wide text-steel">
                    {draft.status}
                  </span>
                  <span className="label-dash">VIEW BOARD →</span>
                </Link>
              </li>
            ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}
