"use client";

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
}: {
  seasons: string[];
  season: string;
  phase: PhaseFilter;
  onSeasonChange: (season: string) => void;
  onPhaseChange: (phase: PhaseFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="stats-season" className="label-dash">
          Season
        </label>
        <select
          id="stats-season"
          value={season}
          onChange={(e) => onSeasonChange(e.target.value)}
          className="rounded border border-line bg-navy px-3 py-1.5 text-sm font-semibold text-white focus:border-gold focus:outline-none"
        >
          <option value={ALL_SEASONS}>All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="label-dash">Phase</span>
        <div className="flex gap-1">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={phase === p}
              onClick={() => onPhaseChange(p)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                phase === p ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
