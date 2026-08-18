"use client";

import { FilterPill } from "./statsUi";

export type PhaseFilter = "All" | "Regular" | "Playoffs";

/** Sentinel passed as `season` when the "All seasons" option is selected. */
export const ALL_SEASONS = "All";

const PHASES: PhaseFilter[] = ["All", "Regular", "Playoffs"];

export default function SeasonSelect({
  seasons,
  season,
  phase,
  onSeasonChange,
  onPhaseChange,
  allowAllSeasons = true,
}: {
  seasons: string[];
  season: string;
  phase: PhaseFilter;
  onSeasonChange: (season: string) => void;
  onPhaseChange: (phase: PhaseFilter) => void;
  /** Hidden for a league with a single season — "All seasons" would query
   *  across every league's history, which is the opposite of what it means
   *  on a league-scoped page. */
  allowAllSeasons?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="stats-season" className="mono-label">
          Season
        </label>
        <select
          id="stats-season"
          value={season}
          onChange={(e) => onSeasonChange(e.target.value)}
          className="rounded border border-line bg-navy px-3 py-1.5 text-sm font-semibold text-white focus:border-cyan focus:outline-none focus:[box-shadow:0_0_10px_rgb(53_230_255/0.3)]"
        >
          {allowAllSeasons ? <option value={ALL_SEASONS}>All seasons</option> : null}
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="mono-label">Phase</span>
        <div className="flex gap-1">
          {PHASES.map((p) => (
            <FilterPill key={p} active={phase === p} onClick={() => onPhaseChange(p)}>
              {p}
            </FilterPill>
          ))}
        </div>
      </div>
    </div>
  );
}
