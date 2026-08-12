import InfoResourceCard from "@/components/info/InfoResourceCard";
import RulebookContent from "@/components/info/RulebookContent";

const resources = [
  {
    label: "Payment",
    description: "Send league payments through the official FPL Draft PayPal.",
    href: "https://www.paypal.com/paypalme/DraftFPL",
  },
  {
    label: "MasterDoc",
    description: "Open the shared league spreadsheet for the latest working data.",
    href: "https://docs.google.com/spreadsheets/d/187hoKxxeSpSPtDAmlrTOeuDrcz5kpdwv1qgQ5kipaHY/edit?usp=sharing",
  },
  {
    label: "Rulebook",
    description: "Read the formatted Rulebook here or open the source Google Doc.",
    href: "https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7",
  },
] as const;

const rulebookSections = [
  ["League Overview", "league-overview"],
  ["League Structure", "league-structure"],
  ["Auction Draft Begins", "auction-draft"],
  ["Nemesis Draft Begins", "nemesis-draft"],
  ["League Format", "league-format"],
  ["Game Rules/Penalties", "game-rules"],
  ["Gauntlet", "gauntlet"],
  ["Playoffs", "playoffs"],
  ["Additional Rules & Aspects", "additional-rules"],
  ["FPL Staff", "staff"],
] as const;

export default function InfoPage() {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">THE LEAGUE</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Info</h1>
          <p className="mt-4 text-lg leading-8 text-steel">
            League resources, payment information, and the complete FPL Rulebook.
          </p>
        </header>

        <section aria-label="League resources" className="mt-10 grid gap-5 md:grid-cols-3">
          {resources.map((resource) => (
            <InfoResourceCard key={resource.label} {...resource} />
          ))}
        </section>

        <section className="mt-16 space-y-8" aria-labelledby="rulebook-heading">
          <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="label-dash">OFFICIAL DOCUMENT</span>
              <h2 id="rulebook-heading" className="mt-3 font-display text-4xl font-semibold text-white sm:text-5xl">
                Rulebook
              </h2>
            </div>
            <a
              className="text-sm font-semibold uppercase tracking-[0.16em] text-gold underline decoration-gold/50 underline-offset-4 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              href={resources[2].href}
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
            <h3 className="font-display text-xl font-semibold text-white">Sections</h3>
            <ol className="mt-4 grid gap-x-8 gap-y-2 text-sm text-steel sm:grid-cols-2 lg:grid-cols-3">
              {rulebookSections.map(([label, id]) => (
                <li key={id}>
                  <a
                    className="inline-flex py-1 underline decoration-line underline-offset-4 transition hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
          className="fixed bottom-5 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-navy/95 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold shadow-lg shadow-black/30 backdrop-blur transition hover:bg-panel hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:bottom-8 sm:right-8"
          href="#rulebook-sections"
        >
          <span aria-hidden="true">↑</span>
          Back to sections
        </a>
      </div>
    </main>
  );
}
