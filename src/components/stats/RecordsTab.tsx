"use client";

import { useCallback, useMemo } from "react";
import { formatDate, formatValue } from "@/lib/stats/format";
import { fetchRecords } from "@/lib/stats/queries";
import type { RecordRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, LoadingCard } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

export default function RecordsTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
  const loadRows = useCallback(() => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    return fetchRecords(seasonParam, phaseParam, teamNames);
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);

  // "All seasons": stats_records is already a top-5-per-(season,phase)
  // view, so with no season filter the fetch returns top-5 *per season*
  // per category. Re-rank across all fetched rows to the true top-5 per
  // category for the combined view (ties broken by season/phase order as
  // returned, i.e. stable sort on value desc).
  const byCategory = useMemo(() => {
    const groups = new Map<string, RecordRow[]>();
    for (const row of rows) {
      const list = groups.get(row.category);
      if (list) list.push(row);
      else groups.set(row.category, [row]);
    }
    for (const [key, list] of groups) {
      const top5 = [...list].sort((a, b) => b.value - a.value).slice(0, 5);
      groups.set(key, top5);
    }
    return groups;
  }, [rows]);

  const categories = useMemo(() => Array.from(byCategory.keys()).sort(), [byCategory]);

  if (status === "loading") {
    return <LoadingCard label="records" />;
  }

  if (status === "error") {
    return <ErrorCard noun="record" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no record data for this season/phase yet." />;
  }

  // Medal accent for the top three of each record category.
  const rankColor = (i: number) =>
    i === 0 ? "text-gold" : i === 1 ? "text-muted" : i === 2 ? "text-[#cd7f32]" : "text-muted/70";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const entries = byCategory.get(category)!;
        return (
          <div key={category} className="card-neon flex flex-col gap-3 p-4">
            <p className="type-display text-lg">
              <span className="text-cyan">{"//"}</span> {category}
            </p>
            <ol className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <li
                  key={`${entry.match_id}-${entry.summoner_name}-${i}`}
                  className="flex items-center justify-between gap-3 border-t border-border/50 pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-white">
                      <span className={`mr-1.5 font-mono font-bold ${rankColor(i)}`}>#{i + 1}</span>
                      {entry.summoner_name}
                      {/* Fix round: some summoner_names are shared by two
                          distinct tags (different real players, e.g.
                          Aura#5950 vs Aura#RGB0) — show #tag so viewers can
                          tell them apart without opening the detail page. */}
                      <span className="text-muted">#{entry.tag}</span>
                    </span>
                    <span className="truncate font-mono text-xs text-muted">
                      {entry.champion} · {formatDate(entry.game_date)}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 text-right font-mono text-base font-bold ${
                      i === 0 ? "text-gold [text-shadow:0_0_10px_rgb(245_182_46/0.4)]" : "text-cyan"
                    }`}
                  >
                    {formatValue(entry.value)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
