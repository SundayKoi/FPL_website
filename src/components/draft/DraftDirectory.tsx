import Link from "next/link";
import type { Draft } from "@/lib/draft/types";

export default function DraftDirectory({ drafts }: { drafts: Draft[] }) {
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
              Follow active boards and revisit every completed draft.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-steel underline underline-offset-4 hover:text-white focus-visible:text-white"
          >
            Admin
          </Link>
        </div>

        {drafts.length === 0 ? (
          <p className="text-sm text-steel">No drafts yet.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/draft/${draft.id}`}
                  className="card-brand flex h-full flex-col gap-2 px-5 py-4 transition-colors hover:border-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
        )}
      </section>
    </main>
  );
}
