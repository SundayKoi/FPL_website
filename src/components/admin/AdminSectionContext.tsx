"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type League = "premier" | "academy";

export default function AdminSectionContext({
  league,
  season,
  seasonOptions,
  defaultSeasons,
  leagueOnly = false,
}: {
  league: League;
  season?: string;
  seasonOptions?: string[];
  defaultSeasons: Record<League, string>;
  leagueOnly?: boolean;
}) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(nextLeague: League, nextSeason?: string) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("league", nextLeague);
    if (!leagueOnly && nextSeason) params.set("season", nextSeason);
    else params.delete("season");

    // A selected fixture/report/team belongs to the old league context.
    for (const key of ["fixture", "report", "record", "team", "draft", "page", "phase", "week"]) params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const options = [...new Set([season, ...(seasonOptions ?? [])].filter((value): value is string => Boolean(value)))];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border-subtle bg-surface px-3 py-2">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Context</span>
      <div className="flex overflow-hidden rounded border border-border-strong" role="group" aria-label="Choose league">
        {(["premier", "academy"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={league === option}
            onClick={() => navigate(option, defaultSeasons[option])}
            className={`min-h-9 px-3 text-xs font-semibold ${league === option ? "bg-action-fill text-white" : "text-muted hover:text-content"}`}
          >
            {option === "premier" ? "Premier" : "Academy"}
          </button>
        ))}
      </div>
      {!leagueOnly && season ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="sr-only">Season</span>
          <select
            aria-label="Season"
            value={season}
            onChange={(event) => navigate(league, event.target.value)}
            className="min-h-9 rounded border border-border-strong bg-canvas px-2 text-content"
          >
            {options.map((option) => <option key={option} value={option}>Season {option}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}
