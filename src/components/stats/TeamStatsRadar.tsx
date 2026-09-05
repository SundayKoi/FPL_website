import { teamRadarMetrics } from "@/lib/stats/teamProfile";
import type { TeamAggRow } from "@/lib/stats/types";

function point(value: number, index: number, center: number, radius: number): string {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
  const distance = (value / 100) * radius;
  return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`;
}

export default function TeamStatsRadar({ row }: { row: TeamAggRow }) {
  const metrics = teamRadarMetrics(row);
  const center = 50;
  const radius = 38;
  const outline = metrics.map((_, index) => point(100, index, center, radius)).join(" ");
  const values = metrics.map((metric, index) => point(metric.value, index, center, radius)).join(" ");

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(150px,0.8fr)_1fr] sm:items-center">
      <svg viewBox="0 0 100 100" className="mx-auto h-44 w-44" aria-hidden="true" focusable="false">
        <polygon points={outline} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <polygon points={values} fill="rgb(53 230 255 / 0.18)" stroke="rgb(53 230 255)" strokeWidth="1.5" />
      </svg>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {metrics.map((metric) => (
          <div key={metric.key}>
            <dt aria-label={metric.label} className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{metric.label}</dt>
            <dd className="font-mono text-sm tabular-nums text-white">{metric.value.toFixed(1)}%</dd>
          </div>
        ))}
        <div>
          <dt aria-label="Kills/game" className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Kills/game</dt>
          <dd className="font-mono text-sm tabular-nums text-white">{Number.isFinite(row.avg_team_kills) ? row.avg_team_kills.toFixed(1) : "0.0"}</dd>
        </div>
        <div>
          <dt aria-label="Average duration" className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Average duration</dt>
          <dd className="font-mono text-sm tabular-nums text-white">{Number.isFinite(row.avg_duration_min) ? `${row.avg_duration_min.toFixed(1)} min` : "0.0 min"}</dd>
        </div>
      </dl>
      <p className="sr-only">
        {Number.isFinite(row.avg_team_kills) ? row.avg_team_kills.toFixed(1) : "0.0"} kills/game; {Number.isFinite(row.avg_duration_min) ? row.avg_duration_min.toFixed(1) : "0.0"} min average.
      </p>
    </div>
  );
}
