import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About the league — FPL",
};

const infoDestinations = [
  {
    href: "/membership",
    label: "Premium & Patron",
    description: "The two ways to pay for FPL, side by side: what each costs, what each gets you, how to get it.",
  },
  {
    href: "/economy",
    label: "Betting dollars",
    description: "Where the play money comes from and where it goes, with every figure.",
  },
  {
    href: "/glossary",
    label: "Glossary",
    description: "Shine, dust, relic, binder, purse: the words the cards use, explained.",
  },
  {
    href: "/support-devs",
    label: "Support the Devs",
    description: "Chip in for the people who build and run the site — PayPal and Venmo, and what patrons get.",
  },
  {
    href: "/league-links",
    label: "League Links",
    description: "Payment, MasterDoc, and the shared resources captains use during the season.",
  },
  {
    href: "/rulebook",
    label: "Rulebook",
    description: "The complete formatted FPL rulebook, section index, and source document.",
  },
  {
    href: "/signup",
    label: "Sign Up",
    description: "Register for the league and get yourself into the next FPL cycle.",
  },
] as const;

export default async function InfoPage() {
  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">FRANCHISE PREMIER LEAGUE</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">About the league</h1>
          <hr className="accent-rule mt-5 w-48 sm:w-64" />
          <p className="mt-4 text-lg leading-8 text-muted">
            A League of Legends draft league: franchises draft at auction, play a season, and every game feeds
            the cards, the betting and the daily games. How to join, the rules, the links and the two ways to pay
            for it are all a page away.
          </p>
        </header>

        <section aria-label="Info destinations" className="mt-10 grid gap-5 md:grid-cols-3">
          {infoDestinations.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              aria-label={destination.label}
              className="card-brand group flex h-full flex-col p-6 transition hover:border-action-text/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            >
              <h2 className="font-display text-3xl font-semibold text-white">{destination.label}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted">{destination.description}</p>
              <span className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-action-text transition group-hover:text-white">
                Open page
              </span>
            </Link>
          ))}
        </section>

      </div>
    </main>
  );
}
