import Link from "next/link";
import type { CardLeague } from "@/lib/cards/queries";

/** Premier/Academy switcher for the card pages — same page, other league.
 *  `suffix` carries the sub-page ("", "/teams", "/compare"). */
export default function CardsLeagueToggle({ league, suffix = "" }: { league: CardLeague; suffix?: string }) {
  const chip = (target: CardLeague, href: string, label: string) => (
    <Link
      href={href}
      aria-current={league === target ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
        league === target ? "bg-coral text-navy" : "border border-border bg-surface text-muted hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="League">
      {chip("premier", `/cards${suffix}`, "Premier")}
      {chip("academy", `/academy/cards${suffix}`, "Academy")}
    </div>
  );
}
