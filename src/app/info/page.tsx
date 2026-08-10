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
    href: "https://docs.google.com/document/d/1KXJWcEtrjz8icHzzmuXgyd8SBWXXR_x9Bb8Xh03QXRI/edit?usp=sharing",
  },
] as const;

const rulebookSections = [
  ["League Statement", "league-statement"],
  ["1. League Structure", "league-structure"],
  ["2. Auction Draft Format", "auction-draft-format"],
  ["3. Regular Season Structure (12 Team)", "regular-season-structure"],
  ["4. Playoff Season Structure", "playoff-season-structure"],
  ["5. Relegation", "relegation"],
  ["6. Team Management", "team-management"],
  ["7. Match Setup & Procedure", "match-setup"],
  ["8. Player Conduct", "player-conduct"],
  ["9. Content and Streaming", "content-streaming"],
  ["10. Rule Amendments", "rule-amendments"],
  ["11. The Lock-In Window (Offseason)", "lock-in-window"],
  ["12. Admin Discretion", "admin-discretion"],
  ["Franchise Premier League Staff", "staff"],
  ["Changelog", "changelog"],
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

          <nav aria-label="Rulebook sections" className="card-brand p-6 sm:p-8">
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
      </div>
    </main>
  );
}
