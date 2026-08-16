import Link from "next/link";
import { leaguePageLinks, type LeaguePage } from "@/lib/league/links";
import type { LeagueView } from "@/lib/league/context";

export default function LeaguePageToggle({
  page,
  view,
  params,
}: {
  page: LeaguePage;
  view: LeagueView;
  params?: Record<string, string | undefined>;
}) {
  const links = leaguePageLinks(page, view, params);
  const linkClass = (active: boolean) =>
    `inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition ${
      active ? "bg-gold font-bold text-navy" : "text-steel/60 hover:bg-panel hover:text-steel"
    }`;

  return (
    <nav aria-label="League" className="inline-flex gap-1 rounded-md border border-line bg-navy p-1">
      <Link href={links.premier} aria-current={view === "premier" ? "page" : undefined} className={linkClass(view === "premier")}>
        Premier
      </Link>
      <Link href={links.academy} aria-current={view === "academy" ? "page" : undefined} className={linkClass(view === "academy")}>
        Academy
      </Link>
    </nav>
  );
}
