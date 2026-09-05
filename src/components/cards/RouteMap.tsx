// The route, drawn: a path with a dot per checkpoint and the squad's
// marker moving along it. Hook-free and static apart from the marker's
// position, which the board hands in as a fraction of the run elapsed.
//
// Six routes, six shapes. The path is what makes a fork a PLACE — "the
// vault door" is the third bend on the Legend Hunt — and the marker is
// what makes "back in 14h" a squad somewhere on it.

import { EXPEDITION_TIERS, type ExpeditionTierKey } from "@/lib/expeditions/config";
import { FORKS, type ForkStatus } from "@/lib/expeditions/routes";

/** Each route's path in a 200×60 box, and where along it the checkpoints
 *  sit. Drawn by hand so each route has its own silhouette: a scout's
 *  short hook, the raid's dip into the valley, the legend's descent, the
 *  legendary's spiral into the rift. */
const PATHS: Record<ExpeditionTierKey, string> = {
  scout: "M6 44 C 40 44, 60 20, 100 24 S 160 40, 194 18",
  raid: "M6 20 C 40 22, 50 50, 90 48 S 130 12, 160 30 S 190 44, 194 30",
  legend: "M6 14 C 30 14, 40 42, 70 44 S 110 20, 130 34 S 150 54, 194 50",
  rescue: "M6 40 C 60 40, 90 20, 120 26 S 170 40, 194 22",
  exorcism: "M6 30 C 60 10, 140 50, 194 30",
  legendary: "M6 50 C 40 48, 44 12, 80 16 S 120 44, 140 30 S 150 8, 170 20 S 200 40, 194 46",
};

function pointAt(path: SVGPathElement | null, fraction: number): { x: number; y: number } | null {
  // Only a real renderer knows a path's length; jsdom and any SVG polyfill
  // without geometry leave the dots on the straight-line fallback.
  if (!path || typeof path.getTotalLength !== "function" || typeof path.getPointAtLength !== "function") return null;
  const length = path.getTotalLength();
  const point = path.getPointAtLength(Math.max(0, Math.min(1, fraction)) * length);
  return { x: point.x, y: point.y };
}

const STATUS_FILL: Record<ForkStatus, string> = {
  pending: "transparent",
  open: "var(--color-gold)",
  decided: "var(--color-mint)",
  missed: "var(--color-steel)",
};

export default function RouteMap({
  tier,
  forks,
  progress,
  label,
}: {
  tier: ExpeditionTierKey;
  /** Each fork's status and, for a decided one, whether it was a push. */
  forks: { status: ForkStatus; pushed: boolean }[];
  /** How far along the run the squad is, 0..1. Null before the clock is up. */
  progress: number | null;
  label?: string;
}) {
  const def = EXPEDITION_TIERS[tier];
  const stories = FORKS[tier];
  const legs = def.forks + 1;
  // Checkpoint i sits at the end of leg i+1; the geometry is a straight
  // walk along the path's length, which is what getPointAtLength gives a
  // browser and what the SSR fallback below approximates by x.
  const stops = Array.from({ length: def.forks }, (_, index) => (index + 1) / legs);
  return (
    <svg
      viewBox="0 0 200 60"
      role="img"
      aria-label={label ?? `${def.label} route${progress !== null ? `, ${Math.round(progress * 100)}% along` : ""}`}
      data-testid="route-map"
      className="h-14 w-full max-w-[16rem] overflow-visible"
    >
      <defs>
        <linearGradient id={`route-${tier}`} x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-steel)" stopOpacity="0.5" />
          <stop offset="1" stopColor="var(--color-coral)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d={PATHS[tier]} fill="none" stroke="var(--color-line)" strokeWidth="4" strokeLinecap="round" />
      <path
        ref={(node) => {
          // Place the checkpoint dots and the marker along the real path.
          // Done imperatively because a path's length is only known once it
          // is drawn; the server render leaves the dots on a straight line.
          if (!node) return;
          const svg = node.ownerSVGElement;
          if (!svg) return;
          stops.forEach((stop, index) => {
            const dot = svg.querySelector<SVGCircleElement>(`[data-stop="${index}"]`);
            const point = pointAt(node, stop);
            if (dot && point) {
              dot.setAttribute("cx", String(point.x));
              dot.setAttribute("cy", String(point.y));
            }
          });
          const marker = svg.querySelector<SVGGElement>("[data-marker]");
          const point = progress === null ? null : pointAt(node, progress);
          if (marker && point) marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
        }}
        d={PATHS[tier]}
        fill="none"
        stroke={`url(#route-${tier})`}
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={progress === null ? "0 1" : `${progress} 1`}
      />
      {stops.map((stop, index) => {
        const fork = forks[index];
        return (
          <circle
            key={index}
            data-stop={index}
            cx={6 + stop * 188}
            cy={30}
            r={4}
            fill={fork ? STATUS_FILL[fork.status] : "transparent"}
            stroke={fork?.status === "decided" && fork.pushed ? "var(--color-coral)" : "var(--color-steel)"}
            strokeWidth="1.5"
          >
            <title>{stories[index]?.title ?? `Fork ${index + 1}`}{fork ? ` — ${fork.status}` : ""}</title>
          </circle>
        );
      })}
      {progress !== null ? (
        <g data-marker transform={`translate(${6 + progress * 188} 30)`}>
          <circle r="5.5" fill="var(--color-coral)" opacity="0.35">
            <animate attributeName="r" values="5.5;9;5.5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="3" fill="var(--color-coral)" stroke="white" strokeWidth="1" />
        </g>
      ) : null}
    </svg>
  );
}
