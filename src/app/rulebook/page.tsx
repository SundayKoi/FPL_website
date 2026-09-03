import type { Metadata } from "next";
import RulebookContent from "@/components/info/RulebookContent";
import { getInfoPageData, getRulebookResource, rulebookSections } from "@/lib/info/resources";

export const metadata: Metadata = {
  title: "Rulebook — FPL",
};

export default async function RulebookPage() {
  const { resources } = await getInfoPageData();
  const rulebook = getRulebookResource(resources);

  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="space-y-8" aria-labelledby="rulebook-heading">
          <div className="flex flex-col gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="label-dash">OFFICIAL DOCUMENT</span>
              <h1 id="rulebook-heading" className="type-display mt-3 text-5xl sm:text-6xl">
                Rulebook
              </h1>
              <hr className="accent-rule mt-5 w-48 sm:w-64" />
            </div>
            <a
              className="text-sm font-semibold uppercase tracking-[0.16em] text-action-text underline decoration-primary/50 underline-offset-4 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
              href={rulebook.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open source Google Doc ↗
            </a>
          </div>

          <nav
            id="rulebook-sections"
            aria-label="Rulebook sections"
            className="card-brand p-6 sm:p-8"
          >
            <h2 className="font-display text-xl font-semibold text-white">Sections</h2>
            <ol className="mt-4 grid gap-x-8 gap-y-2 text-sm text-muted sm:grid-cols-2 lg:grid-cols-3">
              {rulebookSections.map(([label, id]) => (
                <li key={id}>
                  <a
                    className="inline-flex py-1 underline decoration-line underline-offset-4 transition hover:text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    href={`#${id}`}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <RulebookContent />
        </section>

        <a
          aria-label="Back to Rulebook sections"
          className="fixed bottom-5 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-action-text/50 bg-canvas/95 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-action-text shadow-lg shadow-black/30 backdrop-blur transition hover:bg-surface hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:bottom-8 sm:right-8"
          href="#rulebook-sections"
        >
          <span aria-hidden="true">↑</span>
          Back to sections
        </a>
      </div>
    </main>
  );
}
