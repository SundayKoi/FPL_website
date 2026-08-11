"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRecords } from "@/lib/stats/queries";
import type { RecordRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatValue(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function RecordsTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Render-phase adjust (see LeaderboardTab): flip back to "loading"
  // synchronously during render on filter change instead of via a setState
  // call in the effect body (react-hooks/set-state-in-effect forbids that).
  const filterKey = `${season}::${phase}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setStatus("loading");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasonParam = season === ALL_SEASONS ? undefined : season;
        const phaseParam = phase === "All" ? undefined : phase;
        const data = await fetchRecords(seasonParam, phaseParam);
        if (cancelled) return;
        setRows(data);
        setStatus("loaded");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [season, phase]);

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
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading records…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load record data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no record data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {categories.map((category) => {
        const entries = byCategory.get(category)!;
        return (
          <div key={category} className="card-brand flex flex-col gap-3 p-4">
            <p className="type-display text-lg">{category}</p>
            <ol className="flex flex-col gap-2">
              {entries.map((entry, i) => (
                <li
                  key={`${entry.match_id}-${entry.summoner_name}-${i}`}
                  className="flex items-center justify-between gap-3 border-t border-line/60 pt-2 first:border-t-0 first:pt-0"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-white">
                      <span className="mr-1.5 text-steel">#{i + 1}</span>
                      {entry.summoner_name}
                      {/* Fix round: some summoner_names are shared by two
                          distinct tags (different real players, e.g.
                          Aura#5950 vs Aura#RGB0) — show #tag so viewers can
                          tell them apart without opening the detail page. */}
                      <span className="text-steel">#{entry.tag}</span>
                    </span>
                    <span className="truncate text-xs text-steel">
                      {entry.champion} · {formatDate(entry.game_date)}
                    </span>
                  </div>
                  <span className="shrink-0 text-right text-base font-bold text-gold">
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
