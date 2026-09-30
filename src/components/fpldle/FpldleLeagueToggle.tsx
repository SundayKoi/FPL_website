import Link from "next/link";
import type { FpldleLeague } from "@/lib/fpldle/server";

export default function FpldleLeagueToggle({ league }: { league: FpldleLeague }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="FPL'dle league">
      <Link
        href="/fpldle"
        aria-current={league === "premier" ? "page" : undefined}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
          league === "premier" ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
        }`}
      >
        Premier
      </Link>
      <Link
        href="/academy/fpldle"
        aria-current={league === "academy" ? "page" : undefined}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
          league === "academy" ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
        }`}
      >
        Academy
      </Link>
    </div>
  );
}
