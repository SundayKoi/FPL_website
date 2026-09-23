"use client";

// The living map: a run in the field drawn as an engraved night chart
// (spec §6.1) — thin light ink on the canvas, the walked road struck gold,
// the road ahead dashed, every checkpoint a medallion with its place's
// glyph, the unknown ones a `?` in the fog with the squad's dread on them,
// the journal pinned where each line was written, and the squad walking.
//
// It draws a RunView (views.ts) and nothing else: the server has already
// cut what the squad does not know, so an unknown checkpoint arrives here
// with no key and no title and there is nothing to leak. The squad's
// position is the board's clock (`progress`), which the board already
// ticks; the marker glides to each new position in CSS.
//
// One inline SVG per run for the chart; every word on it is HTML laid over
// the chart at real pixel sizes, so a phone reads 12px names where a
// scaled chart would have printed 5px ones. On a phone the chart is drawn
// in its own taller frame (mapTerrain.tsx) and names only the open fork
// and the next place the squad knows; a tap on a pin prints its line in
// the caption under the chart — there are no tooltips to hover.
//
// A client component for three small pieces of state: which pin is being
// read, which frame fits the room the map has, and whether motion is
// wanted.

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import type { ExpeditionTierKey } from "@/lib/expeditions/config";
import type { LeagueGoalKind } from "@/lib/expeditions/league";
import type { JournalLineView, RunView } from "@/lib/expeditions/views";
import { easternClock } from "./expeditions/clock";
import { MapGlyph, glyphFor } from "./mapGlyphs";
import { FRAMES, SIZES, dreadNote, fmt, landmarkNote, layoutMap, pinAtPoint, placeNote, pointAt, sliceRoute, type MapLayout, type MapModel, type PinSpot, type PlaceSpot } from "./mapLayout";
import { Terrain, TerrainDefs, geometryFor, type Geometry } from "./mapTerrain";

/** The league's goal of the week, drawn at the road's end (spec §3.3). */
export interface MapGoal {
  kind: LeagueGoalKind;
  title: string;
  done: number;
  target: number;
  unit: "miles" | "pushes";
}

export interface LivingMapProps {
  view: RunView;
  /** How far along the run's clock the squad is, 0..1; null before the
   *  board's clock is up (the server render). */
  progress: number | null;
  /** Riding in a convoy: the partner shares the squad's marker. */
  convoy?: { partner: string | null } | null;
  goal?: MapGoal | null;
  /** Force a frame (tests, the staff preview); by default the screen's. */
  layout?: MapLayout;
  /** Force reduced motion (tests); by default the reader's setting. */
  reducedMotion?: boolean;
  /** The chart's accessible name; a sentence is composed when omitted. */
  label?: string;
  /** Room, in CSS px, that the page lays over the chart's bottom-right
   *  corner (the run card's reveal button, `.map-corner`): names keep
   *  clear of it and the compass rose steps aside. Only on a chart with
   *  room for names — a compact one has the button under it instead. */
  reserve?: { width: number; height: number } | null;
  /** Print who reached a place first under the chart when its name is not
   *  on it. Off where the page prints those lines itself (the run card). */
  captionLandmarks?: boolean;
  className?: string;
}

// === media, as external state ================================================

const PHONE_QUERY = "(max-width: 639.98px)";
/** Narrower than this, the map draws the phone's frame (globals.css holds
 *  the same number for the moment before it is measured). */
const PHONE_BELOW_PX = 560;
/** A wide chart drawn below about 1:1 is compact: it names only the open
 *  fork and the next known place. As a width, COMPACT_BELOW_PX — which
 *  globals.css holds too, for the server's chart before it is measured. */
const COMPACT_BELOW_PX = 756;
const COMPACT_SCALE = COMPACT_BELOW_PX / FRAMES.wide.width;
const STILL_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const list = window.matchMedia(query);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  };
}

function readMedia(query: string) {
  return () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

const subscribePhone = subscribeMedia(PHONE_QUERY);
const readPhone = readMedia(PHONE_QUERY);
const subscribeStill = subscribeMedia(STILL_QUERY);
const readStill = readMedia(STILL_QUERY);
const serverFalse = () => false;
const noSubscribe = () => () => {};
const clientTrue = () => true;

// === words ===================================================================

const TIER_WORD: Record<ExpeditionTierKey, string> = {
  scout: "Scouting Run",
  gilded: "The Gilded Road",
  raid: "Deep Raid",
  legend: "Legend Hunt",
  rescue: "Rescue",
  exorcism: "Exorcism",
  legendary: "Legendary route",
  mythic: "Mythic route",
};

const WEATHER_WORD: Record<string, string> = { fog: "under fog", drought: "in drought", harvest: "at harvest", watch: "under the Watch" };

function summary(view: RunView, model: MapModel): string {
  const unknown = view.road.filter((place) => !place.known).length;
  const warned = view.road.filter((place) => place.warned && (place.status === "pending" || place.status === "open")).length;
  const parts = [`${TIER_WORD[view.tier]} chart`, `${view.road.length} checkpoint${view.road.length === 1 ? "" : "s"}`];
  if (unknown > 0) parts.push(`${unknown} not yet known`);
  if (warned > 0) parts.push(`the squad dreads ${warned}`);
  if (model.squad) parts.push(`the squad is ${Math.round(model.squad.fraction * 100)}% of the way`);
  return `${parts.join(", ")}.`;
}

// === the component ===========================================================

export default function LivingMap({
  view,
  progress,
  convoy = null,
  goal = null,
  layout: forcedLayout,
  reducedMotion,
  label,
  reserve = null,
  captionLandmarks = true,
  className = "",
}: LivingMapProps) {
  const phone = useSyncExternalStore(subscribePhone, readPhone, serverFalse);
  const still = useSyncExternalStore(subscribeStill, readStill, serverFalse);
  const hydrated = useSyncExternalStore(noSubscribe, clientTrue, serverFalse);
  // The map's own width, once the browser has laid it out: the frame is
  // chosen by the room the map has (a run card in a narrow column is a
  // phone's chart even on a laptop), and the names and pins are spaced for
  // the pixels a unit really is. Until then the screen's width decides.
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      // In 8px steps, so a resize does not re-lay the chart every pixel.
      if (width > 0) setMeasured(Math.max(8, Math.round(width / 8) * 8));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const layout: MapLayout = forcedLayout ?? (measured !== null ? (measured < PHONE_BELOW_PX ? "phone" : "wide") : phone ? "phone" : "wide");
  const settled = Boolean(forcedLayout) || measured !== null || (hydrated && typeof ResizeObserver !== "function");
  const reduce = reducedMotion ?? still;
  const uid = `m${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const g = geometryFor(view.tier, layout);
  const hasGoal = goal !== null;
  const scale = measured !== null ? measured / FRAMES[layout].width : null;
  // A wide chart drawn smaller than 1:1 has no room for every name: it
  // speaks as little as a phone does. (Before it is measured, globals.css
  // holds the server's chart to the same few words wherever the map is
  // narrower than COMPACT_BELOW_PX.)
  const compact = layout === "phone" || (scale !== null && scale < COMPACT_SCALE);
  const reserveW = reserve?.width ?? 0;
  const reserveH = reserve?.height ?? 0;
  const model = useMemo(
    () => layoutMap(view, g.route, layout, progress, { goal: hasGoal, scale, compact, reserve: reserveW > 0 && reserveH > 0 ? { width: reserveW, height: reserveH } : null }),
    [view, g, layout, progress, hasGoal, scale, compact, reserveW, reserveH],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const journal = view.journal;
  const latest = journal.length > 0 ? journal.length - 1 : null;
  const pickedLine = picked !== null && picked < journal.length ? picked : null;
  const shown = hovered ?? pickedLine ?? latest;

  const weather = view.weather ?? "clear";
  const frame = FRAMES[layout];
  const size = SIZES[layout];

  function hitTest(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>): number | null {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const hit = pinAtPoint(model, box, x, y, model.compact ? 24 : 18);
    if (hit !== null) return hit;
    // A tap on a medallion reads the line the squad wrote arriving there.
    const sx = box.width / frame.width;
    const sy = box.height / frame.height;
    for (const pin of model.pins) {
      if (pin.onMark !== "place") continue;
      if (Math.hypot(pin.x * sx - x, pin.y * sy - y) <= Math.max(18, size.open * sx)) return pin.line;
    }
    return null;
  }

  const style = { "--map-w": frame.width, "--map-h": frame.height } as CSSProperties;

  return (
    <figure
      data-testid="living-map"
      data-tier={view.tier}
      data-layout={layout}
      data-weather={weather}
      data-reduced-motion={reduce ? "true" : "false"}
      data-settled={settled ? "true" : "false"}
      data-forced={forcedLayout ? "true" : undefined}
      className={`map-chart map-weather-${weather} ${view.tier === "mythic" ? "map-void" : ""} ${className}`}
      style={style}
    >
      <div
        ref={boxRef}
        className="map-box"
        onClick={(event) => {
          const hit = hitTest(event);
          if (hit !== null) setPicked(hit);
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const hit = hitTest(event);
          if (hit !== hovered) setHovered(hit);
        }}
        onPointerLeave={() => setHovered(null)}
      >
        {/* Keyed by frame: switching frames draws a new chart rather than
            gliding the squad from one frame's coordinates to the other's. */}
        <svg key={layout} viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label ?? summary(view, model)} className="map-svg">
          <Defs uid={uid} g={g} view={view} model={model} />
          <Ground uid={uid} g={g} />
          <Terrain g={g} fog={weather === "fog"} uid={uid} />
          <WeatherUnder uid={uid} g={g} weather={weather} />
          <Road g={g} model={model} mythic={view.tier === "mythic"} />
          <Storms uid={uid} g={g} view={view} />
          <Fog uid={uid} g={g} weather={weather} />
          <Company g={g} view={view} model={model} uid={uid} />
          <Ends g={g} model={model} goal={goal} />
          {model.places.map((spot) => (
            <Medallion key={spot.place.index} spot={spot} layout={layout} mythic={view.tier === "mythic"} />
          ))}
          <Squad model={model} convoy={convoy} />
          <Furniture g={g} rose={model.corner === null} />
        </svg>

        {!model.compact ? (
          <p className="map-cartouche map-wide-only" aria-hidden>
            <span className="map-cartouche-title">
              {TIER_WORD[view.tier]}
              {weather !== "clear" ? ` · ${WEATHER_WORD[weather]}` : ""}
            </span>
            {goal ? <span className="map-cartouche-note">{goalLine(goal)}</span> : null}
          </p>
        ) : null}

        {model.places
          .filter((spot) => spot.labelled)
          .map((spot) => (
            <PlaceLabel key={spot.place.index} spot={spot} frame={frame} compact={model.compact} />
          ))}

        {model.pins.map((pin) => (
          <Pin key={pin.line} pin={pin} frame={frame} compact={model.compact} active={pin.line === shown} />
        ))}
      </div>

      <Caption
        uid={uid}
        journal={journal}
        shown={shown}
        pins={model.pins}
        onStep={(to) => {
          setHovered(null);
          setPicked(to);
        }}
        // The cartouche carries the goal on a chart with room for words;
        // a compact one prints it under the chart. The server's chart
        // prints both, and globals.css shows the one that fits.
        goal={model.compact || !settled ? goal : null}
        goalCompactOnly={!settled && !model.compact}
        landmarks={captionLandmarks ? landmarkLines(model, !settled) : []}
      />
    </figure>
  );
}

/** A landmark the league named is news: where the chart has no room for
 *  its place's name (a phone names two places; a small chart leaves off
 *  what would crowd), it is printed under the chart instead. Before the
 *  map is measured, the names only a roomy chart prints are listed too,
 *  for the narrow map globals.css shows them on. */
function landmarkLines(model: MapModel, unsettled: boolean): CaptionLine[] {
  return model.places.flatMap((spot) => {
    const place = spot.place;
    if (!place.known || !place.landmark) return [];
    if (spot.labelled && (spot.keep || !unsettled)) return [];
    const who = place.landmark.mine ? "you" : place.landmark.by;
    return [{ text: `${place.landmark.crest ? "✦ " : ""}First to ${place.title.toLowerCase()}: ${who}`, compactOnly: spot.labelled }];
  });
}

interface CaptionLine {
  text: string;
  /** Shown only where the chart turns out compact (the server's chart). */
  compactOnly: boolean;
}

function goalLine(goal: MapGoal): string {
  const done = Math.min(goal.done, goal.target);
  return `League ${goal.kind === "boss" ? "boss" : "landmark"} · ${done} of ${goal.target} ${goal.unit}`;
}

// === the SVG's layers ========================================================

function Defs({ uid, g, view, model }: { uid: string; g: Geometry; view: RunView; model: MapModel }) {
  const { width, height } = g.frame;
  const fog = view.weather === "fog";
  const span = Math.max(1, Date.parse(view.resolvesAt) - Date.parse(view.startedAt)) / 3_600_000;
  const unknown = model.places.filter((spot) => !spot.place.known);
  const fogR = g.layout === "wide" ? { rx: 46, ry: 36 } : { rx: 34, ry: 32 };
  // Under a Fog week the fog lies in banks: thick in places, thin between,
  // and clear only round the squad.
  const banks = (g.layout === "wide"
    ? [
        [150, 60, 170, 56],
        [440, 176, 210, 62],
        [620, 52, 160, 50],
        [320, 110, 120, 44],
        [40, 190, 120, 50],
      ]
    : [
        [80, 60, 110, 56],
        [250, 150, 120, 60],
        [120, 220, 130, 50],
        [300, 40, 80, 40],
      ]
  ).map(([cx, cy, rx, ry]) => ({ cx, cy, rx, ry }));
  return (
    <defs>
      {/* The graticule: a chart's faint grid. */}
      <pattern id={`${uid}-grid`} width={g.layout === "wide" ? 60 : 40} height={g.layout === "wide" ? 55 : 50} patternUnits="userSpaceOnUse">
        <path d={g.layout === "wide" ? "M60 0H0V55" : "M40 0H0V50"} fill="none" stroke="var(--color-steel)" strokeOpacity={0.07} strokeWidth={0.5} strokeDasharray="1 2.5" />
      </pattern>
      {/* Fog: a seamless diagonal hatch. Denser under a Fog week. */}
      <pattern id={`${uid}-hatch`} width={fog ? 4 : 6} height={fog ? 4 : 6} patternUnits="userSpaceOnUse">
        <path d={fog ? "M-1 1L1-1M0 4L4 0M3 5L5 3" : "M-1 1L1-1M0 6L6 0M5 7L7 5"} stroke="var(--color-steel)" strokeWidth={fog ? 0.55 : 0.6} />
      </pattern>
      <radialGradient id={`${uid}-soft`}>
        <stop offset="0" stopColor="white" stopOpacity={1} />
        <stop offset="0.55" stopColor="white" stopOpacity={0.75} />
        <stop offset="1" stopColor="white" stopOpacity={0} />
      </radialGradient>
      <radialGradient id={`${uid}-clear`}>
        <stop offset="0" stopColor="black" stopOpacity={1} />
        <stop offset="0.6" stopColor="black" stopOpacity={0.7} />
        <stop offset="1" stopColor="black" stopOpacity={0} />
      </radialGradient>
      <mask id={`${uid}-fog`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
        {fog ? (
          <>
            <rect width={width} height={height} fill="white" fillOpacity={0.5} />
            {banks.map((bank, i) => (
              <ellipse key={i} cx={bank.cx} cy={bank.cy} rx={bank.rx} ry={bank.ry} fill={`url(#${uid}-soft)`} />
            ))}
            {model.squad ? (
              <circle className="map-squad-move" r={g.layout === "wide" ? 52 : 44} fill={`url(#${uid}-clear)`} style={{ transform: `translate(${fmt(model.squad.x)}px, ${fmt(model.squad.y)}px)` }} />
            ) : null}
          </>
        ) : (
          unknown.map((spot) => <ellipse key={spot.place.index} cx={spot.x} cy={spot.y} rx={fogR.rx} ry={fogR.ry} fill={`url(#${uid}-soft)`} />)
        )}
      </mask>
      {/* Rain, over each storm's span of the road. */}
      {view.storms.length > 0 ? (
        <>
          <pattern id={`${uid}-rain`} width={8} height={8} patternUnits="userSpaceOnUse">
            <path d="M6 0L4 4M2 4L0 8M10 4L8 8" stroke="var(--color-cyan)" strokeWidth={0.7} strokeLinecap="round" />
          </pattern>
          <mask id={`${uid}-rain-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            {view.storms.map((storm, i) => {
              const s = stormSpan(g, storm, span);
              return (
                <g key={i}>
                  <path d={sliceRoute(g.route, s.from, s.to)} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={g.layout === "wide" ? 16 : 18} strokeLinecap="round" />
                  <path d={s.curtain} fill="white" fillOpacity={0.7} />
                </g>
              );
            })}
          </mask>
        </>
      ) : null}
      {view.company.ghosts.length > 0 ? (
        <filter id={`${uid}-ghost`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={0.9} />
        </filter>
      ) : null}
      <radialGradient id={`${uid}-lamp`} cx="0.5" cy="0.45" r="0.75">
        <stop offset="0" stopColor="var(--color-surface)" stopOpacity={view.tier === "mythic" ? 0.25 : 0.55} />
        <stop offset="1" stopColor="var(--color-surface)" stopOpacity={0} />
      </radialGradient>
      {view.weather === "watch" ? (
        <radialGradient id={`${uid}-watch`} cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.62" stopColor="var(--color-cyan)" stopOpacity={0} />
          <stop offset="1" stopColor="var(--color-cyan)" stopOpacity={0.16} />
        </radialGradient>
      ) : null}
      {view.weather === "drought" ? (
        <>
          <pattern id={`${uid}-cracks`} width={36} height={24} patternUnits="userSpaceOnUse">
            <path d="M0 8l7 2 5-5 9 3 6-6M12 5l2 9-5 7M21 8l4 8 11 1M25 16l-3 8" fill="none" stroke="var(--color-banana)" strokeOpacity={0.22} strokeWidth={0.6} strokeLinejoin="round" />
          </pattern>
          <linearGradient id={`${uid}-foot`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.45" stopColor="white" stopOpacity={0} />
            <stop offset="1" stopColor="white" stopOpacity={1} />
          </linearGradient>
          <mask id={`${uid}-foot-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <rect width={width} height={height} fill={`url(#${uid}-foot)`} />
          </mask>
        </>
      ) : null}
      {view.weather === "harvest" ? (
        <>
          <pattern id={`${uid}-grain`} width={22} height={14} patternUnits="userSpaceOnUse">
            <path d="M3 4l2-2.5M11 11l2-2.5M17 5l1.8-2.6M7 12.5l1.6-2" stroke="var(--color-gold)" strokeOpacity={0.5} strokeWidth={0.9} strokeLinecap="round" />
          </pattern>
          <linearGradient id={`${uid}-margins`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity={1} />
            <stop offset="0.2" stopColor="white" stopOpacity={0} />
            <stop offset="0.8" stopColor="white" stopOpacity={0} />
            <stop offset="1" stopColor="white" stopOpacity={1} />
          </linearGradient>
          <mask id={`${uid}-margin-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <rect width={width} height={height} fill={`url(#${uid}-margins)`} />
          </mask>
        </>
      ) : null}
      <TerrainDefs g={g} uid={uid} />
    </defs>
  );
}

function Ground({ uid, g }: { uid: string; g: Geometry }) {
  const { width, height } = g.frame;
  return (
    <g aria-hidden>
      <rect width={width} height={height} className="map-void-fill" />
      <rect width={width} height={height} fill={`url(#${uid}-lamp)`} />
      <rect width={width} height={height} fill={`url(#${uid}-grid)`} />
    </g>
  );
}

function WeatherUnder({ uid, g, weather }: { uid: string; g: Geometry; weather: string }) {
  const { width, height } = g.frame;
  if (weather === "drought") {
    return (
      <g aria-hidden data-weather-layer="drought">
        <rect width={width} height={height} fill="var(--color-banana)" fillOpacity={0.06} />
        <rect width={width} height={height} fill={`url(#${uid}-cracks)`} mask={`url(#${uid}-foot-mask)`} />
      </g>
    );
  }
  if (weather === "harvest") {
    return (
      <g aria-hidden data-weather-layer="harvest">
        <rect width={width} height={height} fill={`url(#${uid}-grain)`} mask={`url(#${uid}-margin-mask)`} />
      </g>
    );
  }
  if (weather === "watch") {
    return (
      <g aria-hidden data-weather-layer="watch">
        <rect width={width} height={height} fill={`url(#${uid}-watch)`} />
        <g color="var(--color-cyan)" opacity={0.6}>
          <MapGlyph name="eye" x={width / 2} y={g.layout === "wide" ? 16 : 18} size={g.layout === "wide" ? 16 : 16} stroke={1} />
        </g>
      </g>
    );
  }
  return null;
}

function Road({ g, model, mythic }: { g: Geometry; model: MapModel; mythic: boolean }) {
  const d = g.route.d;
  const walked = model.squad?.fraction ?? null;
  const wide = g.layout === "wide";
  return (
    <g aria-hidden data-road>
      {/* A knockout under the road so the contours part around it. */}
      <path d={d} fill="none" className="map-knockout" strokeWidth={wide ? 7 : 8} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={mythic ? "var(--color-content)" : "var(--color-steel)"}
        strokeOpacity={mythic ? 0.8 : 0.6}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        strokeLinecap="round"
        data-testid="map-road-ahead"
      />
      {walked !== null && walked > 0 ? (
        <>
          <path d={d} fill="none" stroke="var(--color-gold)" strokeOpacity={0.16} strokeWidth={wide ? 7 : 8} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={fmt3(1 - walked)} className="map-walk" />
          <path d={d} fill="none" stroke="var(--color-gold)" strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={fmt3(1 - walked)} className="map-walk" data-testid="map-road-walked" />
        </>
      ) : null}
    </g>
  );
}

function fmt3(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** A storm's stretch of road — its hours as a share of the run, never
 *  drawn narrower than a curtain can read — and the curtain of rain
 *  hanging from the cloud over it. */
function stormSpan(g: Geometry, storm: RunView["storms"][number], runHours: number) {
  const wide = g.layout === "wide";
  const least = (wide ? 40 : 34) / g.route.length;
  const from = Math.max(0, Math.min(1, storm.fraction));
  const to = Math.min(1, from + Math.max(storm.hours / runHours, least));
  const lift = wide ? 34 : 38;
  const edge: string[] = [];
  const top: string[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const p = pointAt(g.route, from + ((to - from) * i) / 8);
    edge.push(`${fmt(p.x)} ${fmt(p.y + 3)}`);
    top.unshift(`${fmt(p.x + 6)} ${fmt(p.y - lift)}`);
  }
  const mid = pointAt(g.route, (from + to) / 2);
  return { from, to, lift, mid, curtain: `M${edge.join("L")}L${top.join("L")}Z` };
}

function Storms({ uid, g, view }: { uid: string; g: Geometry; view: RunView }) {
  if (view.storms.length === 0) return null;
  const { width, height } = g.frame;
  const runHours = Math.max(1, Date.parse(view.resolvesAt) - Date.parse(view.startedAt)) / 3_600_000;
  return (
    <g aria-hidden>
      <g mask={`url(#${uid}-rain-mask)`} opacity={0.85}>
        <rect x={-16} y={-16} width={width + 32} height={height + 32} fill={`url(#${uid}-rain)`} className="map-rain" />
      </g>
      {view.storms.map((storm, i) => {
        const s = stormSpan(g, storm, runHours);
        return (
          <g key={i} data-testid={`map-storm-${i}`} color="var(--color-cyan)">
            <MapGlyph name="cloud" x={s.mid.x + 6} y={s.mid.y - s.lift - 4} size={g.layout === "wide" ? 24 : 26} stroke={1.3} fill="var(--color-canvas)" fillOpacity={0.92} />
          </g>
        );
      })}
    </g>
  );
}

function Fog({ uid, g, weather }: { uid: string; g: Geometry; weather: string }) {
  const { width, height } = g.frame;
  const fog = weather === "fog";
  return (
    <g mask={`url(#${uid}-fog)`} aria-hidden data-fog={fog ? "weather" : "unknowns"}>
      <rect x={-24} y={-24} width={width + 48} height={height + 48} fill={`url(#${uid}-hatch)`} opacity={fog ? 0.34 : 0.3} className={`map-fog ${fog ? "map-drift" : ""}`} />
    </g>
  );
}

function Company({ g, view, model, uid }: { g: Geometry; view: RunView; model: MapModel; uid: string }) {
  const legs = model.legs;
  const lift = g.layout === "wide" ? 9 : 10;
  const squad = model.squad?.fraction ?? null;
  return (
    <g aria-hidden>
      {view.company.rivals.map((rival, i) => {
        // The rival's squad walks its leg a path-width off the road, on the
        // side the journal's pins leave clear.
        const from = Math.max(0, Math.min(rival.fraction - 0.001, rival.leg / legs));
        const p = pointAt(g.route, rival.fraction);
        const at = { x: p.x - p.nx * lift, y: p.y - p.ny * lift };
        const r = g.layout === "wide" ? 3.6 : 4.2;
        return (
          <g key={`rival-${i}`} data-testid={`map-rival-${i}`} data-won={rival.won ? "true" : "false"}>
            <path d={sliceRoute(g.route, from, rival.fraction, -lift)} fill="none" stroke="var(--color-pink)" strokeOpacity={0.7} strokeWidth={1.1} strokeDasharray="1.5 2.5" strokeLinecap="round" />
            <path
              d={`M${fmt(at.x)} ${fmt(at.y - r)}L${fmt(at.x + r)} ${fmt(at.y)}L${fmt(at.x)} ${fmt(at.y + r)}L${fmt(at.x - r)} ${fmt(at.y)}Z`}
              fill={rival.won ? "var(--color-canvas)" : "var(--color-pink)"}
              stroke="var(--color-pink)"
              strokeWidth={1.2}
            />
          </g>
        );
      })}
      {view.company.ghosts.map((ghost, i) => {
        // On its leg with the squad, the ghost keeps pace just behind it.
        const legStart = ghost.leg / legs;
        const legEnd = (ghost.leg + 1) / legs;
        const trailing = squad !== null && squad >= ghost.fraction && squad >= legStart && squad <= legEnd;
        const f = trailing ? Math.max(legStart, (squad ?? 0) - (g.layout === "wide" ? 0.035 : 0.05)) : ghost.fraction;
        const p = pointAt(g.route, f);
        return (
          <g key={`ghost-${i}`} data-testid={`map-ghost-${i}`} color="var(--color-content)" opacity={0.6} filter={`url(#${uid}-ghost)`}>
            <MapGlyph name="ghost" x={p.x - p.nx * (g.layout === "wide" ? 13 : 14)} y={p.y - p.ny * (g.layout === "wide" ? 13 : 14)} size={g.layout === "wide" ? 15 : 16} stroke={1.1} fill="var(--color-steel)" fillOpacity={0.35} />
          </g>
        );
      })}
    </g>
  );
}

function Ends({ g, model, goal }: { g: Geometry; model: MapModel; goal: MapGoal | null }) {
  const r = g.layout === "wide" ? 7.5 : 8.5;
  const home = model.squad !== null && model.squad.fraction >= 1;
  const icon = g.layout === "wide" ? 11 : 12;
  const goalAt = model.goal;
  const share = goal ? Math.max(0, Math.min(1, goal.done / Math.max(1, goal.target))) : 0;
  const gr = g.layout === "wide" ? 10 : 11;
  const circumference = 2 * Math.PI * gr;
  return (
    <g aria-hidden>
      <g data-testid="map-start" color="var(--color-steel)">
        <circle cx={model.start.x} cy={model.start.y} r={r} className="map-medallion-fill" stroke="var(--color-steel)" strokeOpacity={0.7} strokeWidth={1.2} />
        <MapGlyph name="start" x={model.start.x + 0.5} y={model.start.y} size={icon} stroke={1.3} />
      </g>
      {goal ? (
        <g data-testid="map-goal" data-kind={goal.kind}>
          <path d={`M${fmt(model.end.x)} ${fmt(model.end.y - r)}L${fmt(goalAt.x)} ${fmt(goalAt.y + gr)}`} stroke="var(--color-gold)" strokeOpacity={0.45} strokeWidth={0.8} strokeDasharray="1 2.5" strokeLinecap="round" />
          <circle cx={goalAt.x} cy={goalAt.y} r={gr} className="map-medallion-fill" stroke="var(--color-gold)" strokeOpacity={0.3} strokeWidth={2} />
          <circle
            cx={goalAt.x}
            cy={goalAt.y}
            r={gr}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth={2}
            strokeDasharray={`${fmt(circumference * share)} ${fmt(circumference)}`}
            transform={`rotate(-90 ${fmt(goalAt.x)} ${fmt(goalAt.y)})`}
            strokeLinecap="round"
          />
          <g color="var(--color-gold)">
            <MapGlyph name={goal.kind === "boss" ? "boss" : "cairn"} x={goalAt.x} y={goalAt.y} size={icon + 1} stroke={1.2} />
          </g>
        </g>
      ) : null}
      <g data-testid="map-home" color={home ? "var(--color-gold)" : "var(--color-steel)"}>
        <circle cx={model.end.x} cy={model.end.y} r={r} className="map-medallion-fill" stroke={home ? "var(--color-gold)" : "var(--color-steel)"} strokeOpacity={home ? 1 : 0.7} strokeWidth={1.2} />
        <MapGlyph name="home" x={model.end.x} y={model.end.y - 0.3} size={icon} stroke={1.3} />
      </g>
    </g>
  );
}

function Medallion({ spot, layout, mythic }: { spot: PlaceSpot; layout: MapLayout; mythic: boolean }) {
  const { place, x, y, r, open } = spot;
  const size = SIZES[layout];
  const walked = place.status === "decided" || place.status === "missed";
  // The dread is a warning about the road ahead; a place the squad has
  // walked needs none (its pip says how it went).
  const ahead = !walked;
  const known = place.known;
  const ring = open ? "var(--color-gold)" : walked ? "var(--color-gold)" : !known && place.warned ? "var(--color-coral)" : mythic ? "var(--color-content)" : "var(--color-steel)";
  const ringOpacity = open || walked ? 1 : known ? 0.85 : 0.8;
  const ink = open || walked ? "var(--color-gold)" : known ? "var(--color-content)" : "var(--color-steel)";
  const glyph = glyphFor(known ? place.key : null);
  const glyphSize = known ? size.glyph : size.glyph * 0.92;
  const pip = place.status === "decided" ? (place.pushed ? "var(--color-coral)" : "var(--color-mint)") : place.status === "missed" ? "var(--color-steel)" : null;
  const badge = layout === "wide" ? 4.6 : 5.6;
  const bx = x + r * 0.78;
  const by = y - r * 0.78;
  return (
    <g
      data-testid={`map-place-${place.index}`}
      data-known={known ? "true" : "false"}
      data-status={place.status}
      data-warned={place.warned && ahead ? "true" : "false"}
      data-glyph-name={glyph}
      aria-hidden
    >
      {open ? <circle cx={x} cy={y} r={r + 4} fill="none" stroke="var(--color-gold)" strokeWidth={1.2} className="map-pulse" /> : null}
      <circle
        cx={x}
        cy={y}
        r={r}
        className={open ? "map-medallion-open" : "map-medallion-fill"}
        stroke={ring}
        strokeOpacity={ringOpacity}
        strokeWidth={1.5}
        strokeDasharray={known ? undefined : layout === "wide" ? "2.6 2.2" : "3 2.4"}
      />
      <g color={ink} opacity={known ? 1 : 0.9}>
        <MapGlyph name={glyph} x={x} y={y} size={glyphSize} stroke={known ? 1.35 : 1.8} />
      </g>
      {pip ? <circle cx={x} cy={y + r} r={layout === "wide" ? 2.4 : 2.8} fill={pip} className="map-pip" strokeWidth={1.2} /> : null}
      {place.warned && ahead ? (
        <g data-testid={`map-dread-${place.index}`} data-dread="true">
          <path d={`M${fmt(bx)} ${fmt(by - badge)}L${fmt(bx + badge)} ${fmt(by)}L${fmt(bx)} ${fmt(by + badge)}L${fmt(bx - badge)} ${fmt(by)}Z`} fill="var(--color-coral)" className="map-dread" strokeWidth={1.2} strokeLinejoin="round" />
          <path d={`M${fmt(bx)} ${fmt(by - badge * 0.45)}V${fmt(by + badge * 0.1)}M${fmt(bx)} ${fmt(by + badge * 0.42)}h.01`} stroke="var(--color-canvas)" strokeWidth={layout === "wide" ? 1.1 : 1.3} strokeLinecap="round" />
        </g>
      ) : null}
    </g>
  );
}

function Squad({ model, convoy }: { model: MapModel; convoy: { partner: string | null } | null }) {
  if (!model.squad) return null;
  const r = SIZES[model.layout].squad;
  return (
    <g data-testid="map-squad" data-fraction={fmt3(model.squad.fraction)} className="map-squad-move" style={{ transform: `translate(${fmt(model.squad.x)}px, ${fmt(model.squad.y)}px)` }} aria-hidden>
      <circle r={r * 2.3} fill="var(--color-coral)" fillOpacity={0.16} />
      {convoy ? <circle data-testid="map-convoy" cx={-r * 1.5} cy={r * 0.9} r={r * 0.72} fill="var(--color-mint)" className="map-pip" strokeWidth={1.2} /> : null}
      <circle r={r} fill="var(--color-coral)" stroke="var(--color-gold)" strokeWidth={1.6} />
    </g>
  );
}

function Furniture({ g, rose: drawRose }: { g: Geometry; rose: boolean }) {
  const { width, height } = g.frame;
  const wide = g.layout === "wide";
  const rose = wide ? { x: width - 30, y: height - 28 } : { x: width - 22, y: 22 };
  const rr = wide ? 10 : 8;
  return (
    <g aria-hidden className="map-furniture">
      {/* The engraved border: a double rule. */}
      <rect x={3.5} y={3.5} width={width - 7} height={height - 7} rx={3} fill="none" stroke="var(--color-border-strong)" strokeOpacity={0.55} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
      <rect x={6.5} y={6.5} width={width - 13} height={height - 13} rx={1.5} fill="none" stroke="var(--color-border-subtle)" strokeOpacity={0.7} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      {/* The compass rose — unless something is laid over its corner. */}
      {drawRose ? (
      <g transform={`translate(${rose.x} ${rose.y})`}>
        <circle r={rr} fill="none" stroke="var(--color-steel)" strokeOpacity={0.3} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <path
          d={`M0 ${-rr - 4}L${rr * 0.22} ${-rr * 0.22}L${rr + 2} 0L${rr * 0.22} ${rr * 0.22}L0 ${rr + 2}L${-rr * 0.22} ${rr * 0.22}L${-rr - 2} 0L${-rr * 0.22} ${-rr * 0.22}Z`}
          fill="var(--color-steel)"
          fillOpacity={0.12}
          stroke="var(--color-steel)"
          strokeOpacity={0.45}
          strokeWidth={0.6}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path d={`M0 ${-rr - 4}L${rr * 0.22} ${-rr * 0.22}L0 0Z`} fill="var(--color-gold)" fillOpacity={0.7} />
      </g>
      ) : null}
    </g>
  );
}

// === the words over the chart ================================================

function pct(n: number, of: number): string {
  return `${Math.round((n / of) * 10000) / 100}%`;
}

function PlaceLabel({ spot, frame, compact }: { spot: PlaceSpot; frame: { width: number; height: number }; compact: boolean }) {
  const { place, label, open } = spot;
  const note = placeNote(place);
  const dread = dreadNote(place);
  const landmark = landmarkNote(place);
  return (
    <div
      data-testid={`map-label-${place.index}`}
      data-align={label.align}
      data-side={label.side}
      data-open={open ? "true" : undefined}
      data-keep={spot.keep ? "true" : undefined}
      className={`map-label ${open ? "map-label-open" : ""} ${place.known ? "" : "map-label-unknown"} ${compact ? "map-label-phone" : ""}`}
      style={{ left: pct(label.x, frame.width), top: pct(label.y, frame.height), maxWidth: `${label.max}px` }}
    >
      {place.known ? <span className="map-label-title">{place.title}</span> : null}
      <span className="map-label-note">{note}</span>
      {dread ? <span className="map-label-note map-label-dread">{dread}</span> : null}
      {landmark ? (
        <span className="map-label-landmark">
          {place.known && place.landmark?.crest ? "✦ " : ""}
          {landmark}
        </span>
      ) : null}
    </div>
  );
}

function Pin({ pin, frame, compact, active }: { pin: PinSpot; frame: { width: number; height: number }; compact: boolean; active: boolean }) {
  return (
    <span
      data-testid={`map-pin-${pin.line}`}
      data-tone={pin.tone}
      data-kind={pin.kind}
      data-fraction={fmt3(pin.fraction)}
      data-active={active ? "true" : undefined}
      className={`map-pin map-pin-${pin.tone} ${compact ? "map-pin-phone" : ""}`}
      style={{ left: pct(pin.x, frame.width), top: pct(pin.y - pin.lift, frame.height) }}
      aria-hidden
    >
      {!compact ? <span className="map-pin-number">{pin.number}</span> : null}
    </span>
  );
}

function Caption({
  uid,
  journal,
  shown,
  pins,
  onStep,
  goal,
  goalCompactOnly,
  landmarks,
}: {
  uid: string;
  journal: JournalLineView[];
  shown: number | null;
  pins: PinSpot[];
  onStep: (line: number) => void;
  goal: MapGoal | null;
  goalCompactOnly: boolean;
  landmarks: CaptionLine[];
}) {
  const notes = (
    <>
      {goal ? <p className={`map-caption-goal ${goalCompactOnly ? "map-compact-only" : ""}`}>{goalLine(goal)}</p> : null}
      {landmarks.map((line) => (
        <p key={line.text} className={`map-caption-goal ${line.compactOnly ? "map-compact-only" : ""}`} data-testid="map-caption-landmark">
          {line.text}
        </p>
      ))}
    </>
  );
  if (journal.length === 0) {
    return (
      <figcaption data-testid="map-caption" className="map-caption">
        <p className="map-caption-text text-steel">The squad has just set out. The first word comes back in a few hours.</p>
        {notes}
      </figcaption>
    );
  }
  const index = shown ?? journal.length - 1;
  const entry = journal[index];
  const pin = pins.find((candidate) => candidate.line === index);
  const tone = pin?.tone ?? "steel";
  const latestLine = index === journal.length - 1;
  const firstLine = index === 0;
  // A step that goes nowhere is greyed, and the words beside it say why:
  // this is the latest line, or the first.
  const where = latestLine ? "Latest" : firstLine ? `First of ${journal.length}` : `of ${journal.length}`;
  return (
    <figcaption data-testid="map-caption" className="map-caption">
      <div className="map-caption-row">
        <p className="map-caption-meta">
          <span className={`map-caption-pin map-pin-${tone}`} aria-hidden>
            {index + 1}
          </span>
          <span>{easternClock(entry.at)}</span>
          <span aria-hidden className="map-caption-dot">
            ·
          </span>
          <span id={`${uid}-where`} data-reason className={latestLine ? "text-content" : undefined}>
            {where}
          </span>
        </p>
        {/* One line has nowhere to step to. */}
        {journal.length > 1 ? (
          <div className="map-steps">
            <button
              type="button"
              className="map-step"
              aria-label={firstLine ? "Earlier journal line" : `Earlier journal line (${index} of ${journal.length})`}
              aria-describedby={firstLine ? `${uid}-where` : undefined}
              disabled={firstLine}
              onClick={() => onStep(index - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="map-step"
              aria-label={latestLine ? "Later journal line" : `Later journal line (${index + 2} of ${journal.length})`}
              aria-describedby={latestLine ? `${uid}-where` : undefined}
              disabled={latestLine}
              onClick={() => onStep(index + 1)}
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
      <p className="map-caption-text" aria-live="polite" data-line={index} data-kind={entry.kind}>
        {entry.text}
      </p>
      {notes}
    </figcaption>
  );
}
