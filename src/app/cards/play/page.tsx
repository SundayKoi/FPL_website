import type { Metadata } from "next";
import Link from "next/link";
import { cardsSections } from "@/lib/cards/sections";
import type { CardLeague } from "@/lib/cards/queries";

export const metadata: Metadata = {
  title: "Play — FPL",
  description: "Fantasy, the Gauntlet, expeditions, and the weekly draw: everything you can do with the cards you own.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** The Play tab's front page: the games, one line each, so the vocabulary
 *  is met with its meaning attached. No gate — it is a menu; each game
 *  checks the viewer itself. */
export function PlayPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const play = cardsSections(base).find((section) => section.key === "play");
  const games = play?.children ?? [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">Premium · {LEAGUE_LABELS[league]}</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">Play</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          Everything here is played with cards from your collection, and most of it pays out in betting
          dollars. Nothing you own gets used up except where a page says so.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {games.map((game) => (
          <li key={game.href}>
            <Link
              href={game.href}
              className="card-brand group flex h-full flex-col gap-1 p-5 transition hover:border-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
            >
              <span className="type-display text-xl text-white group-hover:text-coral">{game.label} →</span>
              <span className="text-sm text-steel">{game.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function PlayPage() {
  return PlayPageView({ league: "premier" });
}
