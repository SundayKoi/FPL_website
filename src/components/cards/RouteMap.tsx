// The route, drawn: a path with a roundel per checkpoint and the squad's
// marker moving along it. Hook-free and static apart from the marker's
// position, which the board hands in as a fraction of the run elapsed.
//
// Seven routes, seven shapes. The path is what makes a fork a PLACE — "the
// vault door" is the third bend on the Legend Hunt — and the marker is
// what makes "back in 14h" a squad somewhere on it.
//
// The road it draws is the one the squad KNOWS (views.ts, derived on the
// server): a known checkpoint is titled, an unknown one is a `?` and
// nothing else — its name never reached the browser. What a place ahead
// does give away is drawn as a mark over its roundel: the dread mark when
// the squad has a bad feeling about it, and, on a `?` The Warden has read,
// whether it is dark and whether it charges a toll (a known place says
// both at its fork). A known place the league has named (the atlas) wears
// a small signpost under its roundel, and its label says who reached it
// first. The living map (Phase 7) replaces this; until then it stays small
// and says only that.

import { EXPEDITION_TIERS, type ExpeditionTierKey } from "@/lib/expeditions/config";
import type { ForkStatus } from "@/lib/expeditions/forks";
import type { PlaceView } from "@/lib/expeditions/views";

/** Each route's path in a 200×60 box, and where along it the checkpoints
 *  sit. Drawn by hand so each route has its own silhouette: a scout's
 *  short hook, the raid's dip into the valley, the legend's descent, the
 *  legendary's spiral into the rift. */
const PATHS: Record<ExpeditionTierKey, string> = {
  scout: "M6 44 C 40 44, 60 20, 100 24 S 160 40, 194 18",
  gilded: "M6 36 C 30 34, 50 22, 80 24 S 120 40, 150 30 S 180 16, 194 26",
  raid: "M6 20 C 40 22, 50 50, 90 48 S 130 12, 160 30 S 190 44, 194 30",
  legend: "M6 14 C 30 14, 40 42, 70 44 S 110 20, 130 34 S 150 54, 194 50",
  rescue: "M6 40 C 60 40, 90 20, 120 26 S 170 40, 194 22",
  exorcism: "M6 30 C 60 10, 140 50, 194 30",
  legendary: "M6 50 C 40 48, 44 12, 80 16 S 120 44, 140 30 S 150 8, 170 20 S 200 40, 194 46",
  // The road past the rift: a tighter spiral that crosses itself once.
  mythic: "M6 30 C 30 10, 50 52, 76 30 S 100 6, 118 30 S 140 54, 156 28 S 176 6, 194 34",
};

function pointAt(path: SVGPathElement | null, fraction: number): { x: number; y: number } | null {
  // Only a real renderer knows a path's length; jsdom and any SVG polyfill
  // without geometry leave the roundels on the straight-line fallback.
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

const STATUS_WORD: Record<ForkStatus, string> = {
  pending: "ahead",
  open: "open now",
  decided: "answered",
  missed: "passed in silence",
};

/** Where the straight-line fallback puts a checkpoint: the server render,
 *  and jsdom. */
const fallback = (at: number) => `translate(${6 + at * 188} 30)`;

/** Whether a place's marks are worth drawing: only the road still ahead. A
 *  warning about a place the squad has walked is a warning nobody needs. */
const ahead = (place: PlaceView) => place.status === "pending" || place.status === "open";

/** "first reached by Ana", "first reached by you": a named place's line. */
export function landmarkWords(landmark: { by: string; mine: boolean }): string {
  return `first reached by ${landmark.mine ? "you" : landmark.by}`;
}

/** A checkpoint's name for its tooltip and the map's label — the title
 *  when the squad knows the place, never anything else when it does not. */
export function placeLabel(place: PlaceView): string {
  const parts = [place.known ? place.title : `An unknown checkpoint`, STATUS_WORD[place.status]];
  if (place.known && place.landmark) parts.push(landmarkWords(place.landmark));
  if (ahead(place)) {
    if (place.warned) parts.push("the squad has a bad feeling about it");
    if (!place.known && place.dark === true) parts.push("dark");
    if (!place.known && place.toll === true) parts.push("a toll to camp");
  }
  // One string: React 19 renders a <title> with several children empty on
  // the server, and hydration then fails.
  return parts.join(" — ");
}

export default function RouteMap({
  tier,
  road,
  progress,
  label,
}: {
  tier: ExpeditionTierKey;
  /** The road as the squad knows it (RunView.road): one place per
   *  checkpoint, each with where it stands. */
  road: PlaceView[];
  /** How far along the run the squad is, 0..1. Null before the clock is up. */
  progress: number | null;
  label?: string;
}) {
  const def = EXPEDITION_TIERS[tier];
  const unknown = road.filter((place) => !place.known).length;
  const summary = `${def.label} route${progress !== null ? `, ${Math.round(progress * 100)}% along` : ""}${
    unknown > 0 ? `; ${unknown} of ${road.length} checkpoint${road.length === 1 ? "" : "s"} unknown` : ""
  }`;
  return (
    <svg
      viewBox="0 0 200 60"
      role="img"
      aria-label={label ?? summary}
      data-testid="route-map"
      // Width-led, the height from the box's own 10:3: a phone's card gets
      // a map as wide as it is, not a strip scaled down to a fixed height.
      className="aspect-[10/3] h-auto w-full max-w-[22rem] overflow-visible"
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
          // Place the roundels and the marker along the real path. Done
          // imperatively because a path's length is only known once it is
          // drawn; the server render leaves them on a straight line.
          if (!node) return;
          const svg = node.ownerSVGElement;
          if (!svg) return;
          for (const place of road) {
            const stop = svg.querySelector<SVGGElement>(`[data-stop="${place.index}"]`);
            const point = pointAt(node, place.at);
            if (stop && point) stop.setAttribute("transform", `translate(${point.x} ${point.y})`);
          }
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
      {road.map((place) => (
        <g key={place.index} data-stop={place.index} data-known={place.known ? "true" : "false"} transform={fallback(place.at)}>
          <title>{placeLabel(place)}</title>
          {place.known ? (
            <circle
              r={4}
              fill={STATUS_FILL[place.status]}
              stroke={place.status === "decided" && place.pushed ? "var(--color-coral)" : "var(--color-steel)"}
              strokeWidth="1.5"
            />
          ) : (
            // The `?` roundel: a dashed ring round a question, bigger than a
            // known stop so it reads as a thing and not a hole.
            <g data-unknown>
              <circle r={5.5} fill="var(--color-canvas)" stroke="var(--color-steel)" strokeWidth="1.2" strokeDasharray="2 1.5" />
              <text textAnchor="middle" dominantBaseline="central" fontSize="7.5" fontWeight="700" fill="var(--color-steel)" aria-hidden>
                ?
              </text>
            </g>
          )}
          {ahead(place) && place.warned ? (
            // The dread mark: a small coral warning triangle over the stop.
            <g data-dread transform="translate(0 -11)">
              <path d="M0 -4.2 L4 2.8 L-4 2.8 Z" fill="var(--color-coral)" stroke="var(--color-canvas)" strokeWidth="0.8" strokeLinejoin="round" />
              <text y="1.6" textAnchor="middle" fontSize="5" fontWeight="800" fill="var(--color-canvas)" aria-hidden>
                !
              </text>
            </g>
          ) : null}
          {!place.known && ahead(place) && place.dark === true ? (
            // Dark: a crescent under the stop, the foil's cue — a moon with
            // a bite of the night taken out of it.
            <g data-dark>
              <circle cx={-3.6} cy={10} r={2.3} fill="var(--color-steel)" />
              <circle cx={-2.6} cy={9.1} r={2} fill="var(--color-canvas)" />
            </g>
          ) : null}
          {place.known && place.landmark ? (
            // Named for whoever reached it first: a small gold signpost
            // under the stop (filled when the namer's plaque is up).
            <g data-landmark transform="translate(0 7)" stroke="var(--color-gold)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M0 0V6.5" fill="none" />
              <path d="M0 0.6h3.2l1 1.1-1 1.1H0z" fill={place.landmark.crest ? "var(--color-gold)" : "var(--color-canvas)"} />
            </g>
          ) : null}
          {!place.known && ahead(place) && place.toll === true ? (
            // A toll: a gold coin under the stop.
            <circle data-toll cx={3.6} cy={10} r={2.2} fill="var(--color-gold)" stroke="var(--color-canvas)" strokeWidth="0.6" />
          ) : null}
        </g>
      ))}
      {progress !== null ? (
        <g data-marker transform={fallback(progress)}>
          <circle r="5.5" fill="var(--color-coral)" opacity="0.35">
            <animate attributeName="r" values="5.5;9;5.5" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="3" fill="var(--color-coral)" stroke="white" strokeWidth="1" />
        </g>
      ) : null}
    </svg>
  );
}
