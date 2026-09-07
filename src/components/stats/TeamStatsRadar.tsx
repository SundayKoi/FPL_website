import { teamRadarMetrics } from "@/lib/stats/teamProfile";
import type { TeamAggRow } from "@/lib/stats/types";

function point(value: number, index: number, centerX: number, centerY: number, radius: number): string {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
  const distance = (value / 100) * radius;
  return `${centerX + Math.cos(angle) * distance},${centerY + Math.sin(angle) * distance}`;
}

function coordinate(value: number, index: number, centerX: number, centerY: number, radius: number) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function labelPosition(index: number) {
  const positions = [
    { x: 80, y: 8, anchor: "middle" },
    { x: 124, y: 45, anchor: "start" },
    { x: 124, y: 99, anchor: "start" },
    { x: 36, y: 99, anchor: "end" },
    { x: 36, y: 45, anchor: "end" },
  ] as const;

  return positions[index];
}

export default function TeamStatsRadar({ row }: { row: TeamAggRow }) {
  const metrics = teamRadarMetrics(row);
  const center = 80;
  const centerY = 60;
  const radius = 34;
  const outline = metrics.map((_, index) => {
    const { x, y } = coordinate(100, index, center, centerY, radius);
    return `${x},${y}`;
  }).join(" ");
  const values = metrics.map((metric, index) => point(metric.value, index, center, centerY, radius)).join(" ");

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(150px,0.8fr)_1fr] sm:items-center">
      <svg viewBox="0 0 160 120" className="mx-auto h-52 w-full max-w-[20rem] text-muted" aria-hidden="true" focusable="false">
        <polygon points={outline} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <polygon points={values} fill="rgb(53 230 255 / 0.18)" stroke="rgb(53 230 255)" strokeWidth="1.5" />
        {metrics.map((metric, index) => {
          const { x, y } = coordinate(metric.value, index, center, centerY, radius);
          const label = labelPosition(index);

          return (
            <g key={metric.key}>
              <circle cx={x} cy={y} r="1.8" fill="rgb(53 230 255)" />
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                className="fill-current font-mono text-[4.5px] font-semibold uppercase tracking-[0.08em]"
              >
                {metric.label}
              </text>
            </g>
          );
        })}
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
