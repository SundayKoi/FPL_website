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
import { EXPEDITION_TIERS } from "@/lib/expeditions/config";
import type { LeagueGoalKind } from "@/lib/expeditions/league";
import type { JournalLineView, RunView } from "@/lib/expeditions/views";
import { easternClock } from "./expeditions/clock";
import { Company, Defs, Ends, Fog, Furniture, Ground, Medallion, Road, Squad, Storms, WeatherUnder } from "./mapLayers";
import { FRAMES, SIZES, dreadNote, fmt3, landmarkNote, layoutMap, pinAtPoint, placeNote, type MapLayout, type PinSpot, type PlaceSpot } from "./mapLayout";
import { Terrain, geometryFor } from "./mapTerrain";
import { WEATHER_WORD, goalLine, landmarkLines, summary, type CaptionLine } from "./mapWords";

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
              {EXPEDITION_TIERS[view.tier].label}
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
