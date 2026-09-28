import type { SearchSummary } from "@/lib/analytics/queries";

/**
 * What people type into the site search, and what finds nothing. Members
 * say the site is hard to get around without saying what they could not
 * find; this is where they say it. A search that found nothing is either a
 * page to link more plainly, a word to add to that page's keywords
 * (src/lib/cards/sections.ts, src/lib/site/directory.ts), or a feature
 * people expect and the site lacks.
 */
export default function SearchSection({ summary }: { summary: SearchSummary | null }) {
  return (
    <section aria-label="What people search for" className="card-brand flex flex-col gap-3 p-5">
      <h2 className="type-display text-2xl">What people search for</h2>
      {!summary ? (
        <p className="text-sm text-muted">
          The search log isn&apos;t readable yet — migration 20261106000001 may not be applied.
        </p>
      ) : summary.total === 0 ? (
        <p className="text-sm text-muted">No searches in the last {summary.days} days yet.</p>
      ) : (
        <>
          <p className="max-w-3xl text-sm text-muted">
            {summary.total.toLocaleString("en-US")} searches in the last {summary.days} days. No names are kept — only what
            was typed, how many results it found, and the league. Anything in the right-hand list is something people went
            looking for and the site didn&apos;t show them.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="label-dash text-[10px]">Most searched</h3>
              <ol className="flex flex-col text-sm tabular-nums">
                {summary.top.map((row) => (
                  <li key={row.query} className="flex justify-between gap-3 border-t border-white/10 py-1.5">
                    <span className={row.found ? "text-chalk" : "text-coral"}>{row.query}</span>
                    <span className="text-muted">{row.searches.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="label-dash text-[10px]">Searches that found nothing</h3>
              {summary.unfound.length === 0 ? (
                <p className="text-sm text-muted">Every search found something.</p>
              ) : (
                <ol aria-label="Searches that found nothing" className="flex flex-col text-sm tabular-nums">
                  {summary.unfound.map((row) => (
                    <li key={row.query} className="flex justify-between gap-3 border-t border-white/10 py-1.5">
                      <span className="text-coral">{row.query}</span>
                      <span className="text-muted">{row.searches.toLocaleString("en-US")}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
