// The living map's geometry, pure: where a fraction of the run sits on a
// route, and where every mark the map draws goes — checkpoints, journal
// pins, labels, company, storms, the squad.
//
// Computed here in plain arithmetic rather than with the browser's
// getTotalLength, for two reasons. The server render and the browser then
// place every mark on the same pixel, so nothing jumps at hydration (the
// old RouteMap left its dots on a straight line until a ref could measure
// the path). And the layout is testable: jsdom has no SVG geometry, but it
// runs this.
//
// Two frames. The chart is drawn in a 720×220 box on anything wider than a
// phone, and in a taller 340×270 box on a phone, where the wide chart
// scaled into ~330px would halve every mark. Text never lives in either
// box — LivingMap prints it in HTML over the chart at real pixel sizes —
// so this module also says where each label anchors, in the frame's units.

import type { JournalLineView, PlaceView, RunView } from "@/lib/expeditions/views";

export type MapLayout = "wide" | "phone";

export interface Frame {
  width: number;
  height: number;
}

export const FRAMES: Record<MapLayout, Frame> = {
  wide: { width: 720, height: 220 },
  phone: { width: 340, height: 270 },
};

/** Sizes in frame units. The phone's are larger: its frame is drawn near
 *  1:1, the wide one is scaled up on a laptop. */
export interface MarkSizes {
  /** A checkpoint medallion's radius; the open one is `open`. */
  place: number;
  open: number;
  /** The glyph's box inside a medallion. */
  glyph: number;
  /** The squad's dot. */
  squad: number;
  /** A pin's head, in CSS px (pins are HTML). */
  pinPx: number;
  /** Gap kept between two pins along the route, in units. */
  pinGap: number;
}

export const SIZES: Record<MapLayout, MarkSizes> = {
  wide: { place: 10, open: 12, glyph: 14, squad: 4.5, pinPx: 17, pinGap: 15 },
  phone: { place: 11.5, open: 13.5, glyph: 15, squad: 5, pinPx: 13, pinGap: 17 },
};

// === paths ===================================================================

export interface Pt {
  x: number;
  y: number;
}

interface Cubic {
  p0: Pt;
  p1: Pt;
  p2: Pt;
  p3: Pt;
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const COMMAND = /[MLCSQZ][^MLCSQZ]*/gi;

/** An absolute path (M, L, C, S, Q, Z) as cubic segments. Route paths are
 *  written by hand in those commands only. */
export function parsePath(d: string): Cubic[] {
  const segments: Cubic[] = [];
  let at: Pt = { x: 0, y: 0 };
  let start: Pt = at;
  let lastControl: Pt | null = null;
  for (const chunk of d.match(COMMAND) ?? []) {
    const letter = chunk[0].toUpperCase();
    if (chunk[0] !== letter) throw new Error(`mapLayout: relative path command ${chunk[0]} is not supported`);
    const n = (chunk.slice(1).match(NUMBER) ?? []).map(Number);
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] });
    if (letter === "M") {
      at = pts[0] ?? at;
      start = at;
      lastControl = null;
      for (const next of pts.slice(1)) {
        segments.push(line(at, next));
        at = next;
      }
    } else if (letter === "L") {
      for (const next of pts) {
        segments.push(line(at, next));
        at = next;
      }
      lastControl = null;
    } else if (letter === "C") {
      for (let i = 0; i + 2 < pts.length; i += 3) {
        segments.push({ p0: at, p1: pts[i], p2: pts[i + 1], p3: pts[i + 2] });
        lastControl = pts[i + 1];
        at = pts[i + 2];
      }
    } else if (letter === "S") {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const p1 = lastControl ? { x: 2 * at.x - lastControl.x, y: 2 * at.y - lastControl.y } : at;
        segments.push({ p0: at, p1, p2: pts[i], p3: pts[i + 1] });
        lastControl = pts[i];
        at = pts[i + 1];
      }
    } else if (letter === "Q") {
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const q = pts[i];
        const end = pts[i + 1];
        segments.push({
          p0: at,
          p1: { x: at.x + (2 / 3) * (q.x - at.x), y: at.y + (2 / 3) * (q.y - at.y) },
          p2: { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) },
          p3: end,
        });
        lastControl = null;
        at = end;
      }
    } else if (letter === "Z") {
      if (at.x !== start.x || at.y !== start.y) segments.push(line(at, start));
      at = start;
      lastControl = null;
    }
  }
  return segments;
}

function line(a: Pt, b: Pt): Cubic {
  return { p0: a, p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, p2: { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 }, p3: b };
}

function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const e = 3 * u * t * t;
  const f = t * t * t;
  return { x: a * c.p0.x + b * c.p1.x + e * c.p2.x + f * c.p3.x, y: a * c.p0.y + b * c.p1.y + e * c.p2.y + f * c.p3.y };
}

/** A number for markup: one decimal, no trailing zero — stable output for
 *  the server and the browser alike. */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
}

/** A route sampled into a polyline with its running length, so any
 *  fraction of the way along it can be found by arithmetic. */
export interface Route {
  d: string;
  points: Pt[];
  /** lengths[i] is the distance along the route to points[i]. */
  lengths: number[];
  length: number;
}

export function sampleRoute(d: string, steps = 40): Route {
  const points: Pt[] = [];
  for (const segment of parsePath(d)) {
    for (let i = points.length === 0 ? 0 : 1; i <= steps; i += 1) points.push(cubicAt(segment, i / steps));
  }
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { d, points, lengths, length: lengths[lengths.length - 1] ?? 0 };
}

export interface RoutePoint extends Pt {
  /** Unit tangent. */
  tx: number;
  ty: number;
  /** Unit normal on the chart's north side (never pointing down). */
  nx: number;
  ny: number;
  /** Distance along the route. */
  s: number;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** The point `fraction` of the way along the route by length. */
export function pointAt(route: Route, fraction: number): RoutePoint {
  return pointAtLength(route, clamp01(fraction) * route.length);
}

export function pointAtLength(route: Route, s: number): RoutePoint {
  const { points, lengths } = route;
  if (points.length === 0) return { x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: -1, s: 0 };
  const target = Math.max(0, Math.min(route.length, s));
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= target) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi] ?? a;
  const span = lengths[hi] - lengths[lo];
  const k = span > 0 ? (target - lengths[lo]) / span : 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  // The normal that points up the chart: pins, company and weather stand
  // on this side, names hang on the other.
  let nx = ty;
  let ny = -tx;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: a.x + dx * k, y: a.y + dy * k, tx, ty, nx, ny, s: target };
}

/** The part of the route between two fractions as a polyline, optionally
 *  shifted `offset` units to the north side. */
export function sliceRoute(route: Route, from: number, to: number, offset = 0): string {
  const a = clamp01(Math.min(from, to)) * route.length;
  const b = clamp01(Math.max(from, to)) * route.length;
  if (b - a < 0.5) return "";
  const count = Math.max(2, Math.ceil((b - a) / 4));
  const pts: string[] = [];
  for (let i = 0; i <= count; i += 1) {
    const p = pointAtLength(route, a + ((b - a) * i) / count);
    pts.push(`${fmt(p.x + p.nx * offset)} ${fmt(p.y + p.ny * offset)}`);
  }
  return `M${pts.join(" L")}`;
}

/** A smooth open curve through points (Catmull-Rom as cubics). */
export function smoothOpen(points: Pt[]): string {
  if (points.length < 2) return "";
  const parts = [`M${fmt(points[0].x)} ${fmt(points[0].y)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    parts.push(
      `C${fmt(p1.x + (p2.x - p0.x) / 6)} ${fmt(p1.y + (p2.y - p0.y) / 6)} ${fmt(p2.x - (p3.x - p1.x) / 6)} ${fmt(p2.y - (p3.y - p1.y) / 6)} ${fmt(p2.x)} ${fmt(p2.y)}`,
    );
  }
  return parts.join(" ");
}

/** A smooth closed loop through points. */
export function smoothClosed(points: Pt[]): string {
  const n = points.length;
  if (n < 3) return "";
  const parts = [`M${fmt(points[0].x)} ${fmt(points[0].y)}`];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    parts.push(
      `C${fmt(p1.x + (p2.x - p0.x) / 6)} ${fmt(p1.y + (p2.y - p0.y) / 6)} ${fmt(p2.x - (p3.x - p1.x) / 6)} ${fmt(p2.y - (p3.y - p1.y) / 6)} ${fmt(p2.x)} ${fmt(p2.y)}`,
    );
  }
  return `${parts.join(" ")}Z`;
}

// === the chart's marks ======================================================

export type PinTone = "gold" | "steel" | "white";

export interface PinSpot {
  /** The line's index in view.journal. */
  line: number;
  /** Its number on the map: the journal's order, from 1. */
  number: number;
  tone: PinTone;
  kind: JournalLineView["kind"];
  fraction: number;
  /** Where the pin's tip touches the chart, in frame units. */
  x: number;
  y: number;
  /** Arrival and home pins stand on their medallion or the home mark. */
  onMark: "place" | "home" | null;
  /** How far above the path the tip sits (units): the top of a medallion. */
  lift: number;
}

export interface PlaceSpot {
  place: PlaceView;
  x: number;
  y: number;
  s: number;
  r: number;
  /** The squad is here now, waiting on an answer. */
  open: boolean;
  /** Its name is printed (every place on a wide chart that has room for
   *  it; the open fork and the next known place on a phone). */
  labelled: boolean;
  /** One of the names a compact chart prints too: the open fork, the next
   *  place the squad knows. The server's chart, drawn before the map is
   *  measured, shows only these where the map turns out small. */
  keep: boolean;
  /** Where the label hangs from, which side of the medallion it is on,
   *  and which way its lines align. */
  label: { x: number; y: number; align: "start" | "center" | "end"; side: "below" | "above" | "right" | "left"; max: number; box?: Box };
}

export interface MapModel {
  layout: MapLayout;
  frame: Frame;
  route: Route;
  legs: number;
  places: PlaceSpot[];
  pins: PinSpot[];
  /** Where the squad's marker stands, or null before the clock is up. */
  squad: (Pt & { fraction: number }) | null;
  start: RoutePoint;
  end: RoutePoint;
  /** Where the league goal's marker stands, off the road's end. */
  goal: Pt;
  /** The pixels per frame unit the names and pins were laid out for. */
  scale: number;
  /** Few words: only the open fork and the next known place are named,
   *  and pins are small and unnumbered — a phone, or a wide chart drawn
   *  small. */
  compact: boolean;
  /** A pin's head, in CSS px. */
  pinPx: number;
  /** The corner kept clear for something laid over the chart, in frame
   *  units; null when nothing is (or the chart is compact, and whatever it
   *  was sits under the chart instead). */
  corner: Box | null;
}

const TONE: Record<JournalLineView["kind"], PinTone> = { encounter: "gold", trail: "steel", arrive: "white", home: "white" };

/** The fraction where the squad's marker stands: the clock, except that a
 *  squad at an open fork waits there until it is answered. */
export function squadFraction(view: Pick<RunView, "road" | "openFork">, progress: number | null): number | null {
  if (progress === null || !Number.isFinite(progress)) return null;
  const clock = clamp01(progress);
  if (!view.openFork) return clock;
  const place = view.road.find((entry) => entry.index === view.openFork?.index);
  return place ? Math.min(clock, place.at) : clock;
}

/** Spreads marks along an interval so none sits closer than `gap` to the
 *  next, keeping the order and staying as near each target as it can. */
export function spread(targets: number[], from: number, to: number, gap: number): number[] {
  if (targets.length === 0) return [];
  const room = Math.max(0, to - from);
  const fits = targets.length === 1 || room / (targets.length - 1) >= gap;
  const step = fits ? gap : room / Math.max(1, targets.length - 1);
  const out = targets.map((t) => Math.max(from, Math.min(to, t)));
  for (let i = 1; i < out.length; i += 1) out[i] = Math.max(out[i], out[i - 1] + step);
  if (out[out.length - 1] > to) {
    out[out.length - 1] = to;
    for (let i = out.length - 2; i >= 0; i -= 1) out[i] = Math.min(out[i], out[i + 1] - step);
  }
  return out.map((s) => Math.max(from, Math.min(to, s)));
}

/**
 * Every mark's place on the chart for one run. The road's checkpoints sit
 * at their share of the run's clock along the route's length (checkpoint i
 * ends leg i+1), each journal line's pin at its own fraction — nudged
 * apart where lines crowd, and clear of the medallions — and the squad at
 * the clock, held at an open fork.
 */
export function layoutMap(
  view: RunView,
  route: Route,
  layout: MapLayout,
  progress: number | null,
  options: {
    goal?: boolean;
    scale?: number | null;
    compact?: boolean;
    /** A box in the chart's bottom-right corner, in CSS px, that something
     *  laid over the chart occupies (the run card's reveal button). Kept
     *  clear of names on a chart with room for them. */
    reserve?: { width: number; height: number } | null;
  } = {},
): MapModel {
  const frame = FRAMES[layout];
  const size = SIZES[layout];
  // Pixels per frame unit: measured by the page once it has a width, else
  // the usual one. Pins and names are sized in pixels, so how far apart
  // they must stand in units depends on it.
  const scale = options.scale && options.scale > 0 ? options.scale : DEFAULT_SCALE[layout];
  const compact = layout === "phone" || options.compact === true;
  const pinPx = compact ? SIZES.phone.pinPx : size.pinPx;
  const pinGap = Math.max(size.pinGap, (pinPx * 1.1) / scale);
  const legs = view.road.length + 1;
  const squadAt = squadFraction(view, progress);
  const openIndex = view.openFork?.index ?? null;

  // Which names are printed. A phone has room for two: where the squad is
  // waiting, and the next place it knows it is walking to.
  const nextKnown = view.road.find((place) => place.known && place.status === "pending") ?? null;
  const phoneLabels = new Set<number>();
  if (openIndex !== null) phoneLabels.add(openIndex);
  if (nextKnown) phoneLabels.add(nextKnown.index);

  const places: PlaceSpot[] = view.road.map((place) => {
    const p = pointAt(route, place.at);
    const open = place.index === openIndex;
    const r = open ? size.open : size.place;
    const keep = phoneLabels.has(place.index) && place.known;
    const labelled = compact ? keep : true;
    return { place, x: p.x, y: p.y, s: p.s, r, open, labelled, keep, label: { x: p.x, y: p.y + r + 4, align: "center", side: "below", max: LABEL_MAX_PX[layout] } };
  });

  // Pins. Arrivals stand on their medallion and the homecoming on the
  // home mark; the rest are spread along their legs, clear of the marks.
  const start = pointAt(route, 0);
  const end = pointAt(route, 1);
  const anchors = [
    { s: 0, keep: size.place + 6 },
    ...places.map((spot) => ({ s: spot.s, keep: spot.r + pinGap * 0.55 })),
    { s: route.length, keep: size.place + 4 },
  ];
  const pins: PinSpot[] = view.journal.map((entry, index) => {
    const onMark = entry.kind === "arrive" ? "place" : entry.kind === "home" ? "home" : null;
    return {
      line: index,
      number: index + 1,
      tone: TONE[entry.kind] ?? "steel",
      kind: entry.kind,
      fraction: entry.fraction,
      x: 0,
      y: 0,
      onMark,
      lift: 0,
    };
  });

  for (const pin of pins) {
    if (pin.onMark === "place") {
      // The medallion this arrival belongs to: the checkpoint that ends
      // the line's leg, which is the one nearest its fraction.
      const spot = places.reduce<PlaceSpot | null>((best, candidate) => (!best || Math.abs(candidate.place.at - pin.fraction) < Math.abs(best.place.at - pin.fraction) ? candidate : best), null);
      if (spot) {
        pin.x = spot.x;
        pin.y = spot.y;
        pin.lift = spot.r;
        continue;
      }
      pin.onMark = null;
    }
    if (pin.onMark === "home") {
      pin.x = end.x;
      pin.y = end.y;
      pin.lift = size.place * 0.8;
    }
  }

  // Loose pins, interval by interval between the anchors. A squad waiting
  // at an open fork keeps writing, but it is not walking: whatever it
  // wrote there is pinned on the way in, not on the road past it.
  const openAt = openIndex !== null ? (view.road.find((entry) => entry.index === openIndex)?.at ?? null) : null;
  const where = (pin: PinSpot) => (openAt !== null ? Math.min(pin.fraction, openAt) : pin.fraction);
  const loose = pins.filter((pin) => pin.onMark === null).sort((a, b) => where(a) - where(b) || a.line - b.line);
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const from = anchors[i].s + anchors[i].keep;
    const lo = anchors[i].s;
    const hi = anchors[i + 1].s;
    const inside = loose.filter((pin) => {
      const s = where(pin) * route.length;
      // A pin standing exactly on a checkpoint belongs to the leg that
      // ends there.
      return (i === 0 ? s >= lo : s > lo) && s <= hi;
    });
    // Nothing is written ahead of the squad: its pins stay behind it —
    // unless there is no room behind it at all (the first minutes of a
    // run), when they stand in a row rather than in a heap.
    const squadS = squadAt === null ? null : squadAt * route.length;
    const limit = anchors[i + 1].s - anchors[i + 1].keep;
    const behind = squadS !== null && squadS > lo && squadS <= hi ? squadS - 3 : Infinity;
    const to = Math.min(limit, Math.max(behind, from + Math.max(0, inside.length - 1) * pinGap));
    const at = spread(
      inside.map((pin) => where(pin) * route.length),
      from,
      Math.max(from, to),
      pinGap,
    );
    inside.forEach((pin, k) => {
      const p = pointAtLength(route, at[k]);
      pin.x = p.x;
      pin.y = p.y;
    });
  }

  const squad = squadAt === null ? null : { ...pointAt(route, squadAt), fraction: squadAt };
  // The league's goal stands off the road's end, above it: a marker of its
  // own, joined to home by a dotted line.
  const goal = { x: end.x - (layout === "wide" ? 2 : 4), y: Math.max(26, end.y - (layout === "wide" ? 40 : 38)) };
  const marks: Box[] = [
    { x0: start.x - 10, y0: start.y - 10, x1: start.x + 10, y1: start.y + 10 },
    { x0: end.x - 10, y0: end.y - 10, x1: end.x + 10, y1: end.y + 10 },
    ...(options.goal ? [{ x0: goal.x - 14, y0: goal.y - 14, x1: goal.x + 14, y1: goal.y + 14 }] : []),
  ];
  const corner = !compact && options.reserve ? reservedBox(layout, options.reserve, scale) : null;
  placeLabels(places, pins, route, layout, squad, marks, scale, pinPx, compact, corner);
  return { layout, frame, route, legs, places, pins, squad, start, end, goal, scale, compact, pinPx, corner };
}

/** Where the run card lays its reveal button over the chart, in px from
 *  the chart's bottom-right corner (globals.css, `.map-corner`). */
export const CORNER_INSET_PX = 10;

/** The reserved corner in frame units, with a little air round it. */
function reservedBox(layout: MapLayout, reserve: { width: number; height: number }, k: number): Box {
  const frame = FRAMES[layout];
  const air = 4;
  return {
    x0: frame.width - (CORNER_INSET_PX + reserve.width + air) / k,
    y0: frame.height - (CORNER_INSET_PX + reserve.height + air) / k,
    x1: frame.width - CORNER_INSET_PX / k + air / k,
    y1: frame.height - CORNER_INSET_PX / k + air / k,
  };
}

// === names ===================================================================

/** What the name under a checkpoint says about it, in the board's words. */
export function placeNote(place: PlaceView): string {
  if (!place.known) return "Uncharted";
  if (place.status === "open") return "Waiting on you";
  if (place.status === "missed") return "Played safe";
  if (place.status === "decided") return place.pushed ? "Pushed" : place.choice === "hold" ? "Held" : place.choice === "scout" ? "Scouted" : "Camped";
  return "Ahead";
}

/** The dread, in words, under a place the squad cannot see but fears. */
export function dreadNote(place: PlaceView): string | null {
  return !place.known && place.warned ? "A bad feeling" : null;
}

/** Who reached a place first this season, when someone has. */
export function landmarkNote(place: PlaceView): string | null {
  if (!place.known || !place.landmark) return null;
  return place.landmark.mine ? "First here: you" : `First here: ${place.landmark.by}`;
}

// A name's box, estimated from its text: the display face's capitals run
// about 7.4px each at 12px, the mono notes 7.6px at 11px with their
// tracking. Estimated in pixels, converted to units at a conservative
// scale (a narrow laptop, a small phone), so a name that fits here fits on
// a wider screen too.
const TITLE_PX = 7.4;
const NOTE_PX = 7.6;
const TITLE_LINE = 15;
const NOTE_LINE = 13.5;
export const LABEL_MAX_PX: Record<MapLayout, number> = { wide: 184, phone: 152 };
/** The narrow wrap a name takes beside its medallion when the full one
 *  would run off the chart or over the road. */
export const LABEL_NARROW_PX: Record<MapLayout, number> = { wide: 120, phone: 92 };
/** Pixels per frame unit before the page has measured the map: a run card
 *  on a laptop, a phone. On the conservative side, so a name that fits
 *  here fits on a wider screen too. */
export const DEFAULT_SCALE: Record<MapLayout, number> = { wide: 1.3, phone: 0.95 };

/** A rectangle in frame units. */
export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Greedy word wrap at an estimated character width: the lines a text
 *  breaks into under `max` pixels, and the widest of them. */
function wrap(text: string, charPx: number, max: number): { lines: number; width: number } {
  if (!text) return { lines: 0, width: 0 };
  let lines = 1;
  let line = 0;
  let width = 0;
  for (const word of text.split(" ")) {
    const w = word.length * charPx;
    const next = line === 0 ? w : line + charPx + w;
    if (next > max && line > 0) {
      lines += 1;
      width = Math.max(width, line);
      line = w;
    } else {
      line = next;
    }
  }
  return { lines, width: Math.min(max, Math.max(width, line)) };
}

/** A name's box in frame units, wrapped at `max` pixels. */
function labelSize(place: PlaceView, layout: MapLayout, open: boolean, max: number, k: number): { w: number; h: number } {
  const mark = landmarkNote(place);
  // The title wraps; the notes are short and never break (white-space:
  // nowrap in globals.css), so a note is as wide as it is.
  const parts = [
    { text: place.known ? place.title : "", px: TITLE_PX * (open ? 1.08 : 1), line: TITLE_LINE, breaks: true },
    { text: placeNote(place), px: NOTE_PX, line: NOTE_LINE, breaks: false },
    { text: dreadNote(place) ?? "", px: NOTE_PX, line: NOTE_LINE, breaks: false },
    { text: mark ? `✦ ${mark}` : "", px: NOTE_PX, line: NOTE_LINE, breaks: false },
  ].map((part) => ({ ...wrap(part.text.toUpperCase(), part.px, part.breaks ? max : Infinity), line: part.line }));
  const w = Math.max(...parts.map((part) => part.width));
  const h = parts.reduce((total, part) => total + part.lines * part.line, 0);
  return { w: w / k, h: h / k };
}

/** A pin's head as a box in frame units: it stands on its tip, above the
 *  road (or its medallion), at the pixel size the page draws it. */
export function pinBox(pin: PinSpot, layout: MapLayout, k = DEFAULT_SCALE[layout], px = SIZES[layout].pinPx): Box {
  const h = (px * 1.55) / k;
  const w = (px * 1.1) / k;
  return { x0: pin.x - w / 2, x1: pin.x + w / 2, y0: pin.y - pin.lift - h, y1: pin.y - pin.lift };
}

/** The area two boxes share. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/** How much of a name may be covered — by another name, a medallion, a
 *  pin, the chart's furniture or its edge — before a name the reader can
 *  do without is left off rather than printed in a heap. A share of the
 *  name's own box. The open fork and the next place the squad knows are
 *  always printed. */
export const LABEL_CLASH_DROP = 0.035;

/** The order names are placed in, and so who gets the best spot: the open
 *  fork, the next place the squad knows, the other known places, then the
 *  unknown ones — a name worth less than the one it would crowd yields. */
function labelRank(spot: PlaceSpot): number {
  if (spot.open) return 0;
  if (spot.keep) return 1;
  return spot.place.known ? 2 : 3;
}

/**
 * Where each printed name goes: below its medallion if it can, else above
 * or beside it — whichever covers least of the road, the pins, the other
 * names, the marks and the chart's edge. The open fork is placed first,
 * so its name always gets the best spot and nothing is laid over it. A name
 * the reader can do without that finds no clear spot is left off: a chart
 * drawn small says less rather than printing names over names.
 */
function placeLabels(
  places: PlaceSpot[],
  pins: PinSpot[],
  route: Route,
  layout: MapLayout,
  squad: Pt | null,
  marks: Box[],
  k: number,
  pinPx: number,
  compact: boolean,
  corner: Box | null,
): void {
  const frame = FRAMES[layout];
  const pinH = (pinPx * 1.55) / k;
  const pinBoxes: Box[] = pins.map((pin) => pinBox(pin, layout, k, pinPx));
  const roadPts: Pt[] = [];
  for (let s = 0; s <= route.length; s += 3) roadPts.push(pointAtLength(route, s));
  // The chart's own furniture: its title in the corner, the compass rose —
  // or, where the run card lays its button over that corner, the button.
  const furniture: Box[] = [
    ...marks,
    ...(layout === "wide"
      ? [
          // The cartouche is only printed on a chart with room for words.
          ...(compact ? [] : [{ x0: 8, y0: 8, x1: marks.length > 2 ? 206 : 150, y1: marks.length > 2 ? 46 : 30 }]),
          corner ?? { x0: frame.width - 50, y0: frame.height - 50, x1: frame.width - 8, y1: frame.height - 8 },
        ]
      : [{ x0: frame.width - 40, y0: 6, x1: frame.width - 4, y1: 40 }]),
  ];
  const placed: Box[] = [];
  const order = [...places].filter((spot) => spot.labelled).sort((a, b) => labelRank(a) - labelRank(b) || a.place.index - b.place.index);
  const gap = 3.5;

  for (const spot of order) {
    const { w, h } = labelSize(spot.place, layout, spot.open, LABEL_MAX_PX[layout], k);
    const { x, y, r } = spot;
    // Above a reached checkpoint stands its arrival pin: a name above it
    // goes above the pin.
    const lift = spot.place.status === "pending" ? 0 : pinH;
    const candidates: { label: PlaceSpot["label"]; box: Box; bias: number }[] = [];
    const below = y + r + gap;
    const above = y - r - gap - lift;
    for (const align of ["center", "start", "end"] as const) {
      const x0 = align === "center" ? x - w / 2 : align === "start" ? x - r : x + r - w;
      const ax = align === "center" ? x : align === "start" ? x - r : x + r;
      const bias = align === "center" ? 0 : 3;
      candidates.push({ label: { x: ax, y: below, align, side: "below", max: LABEL_MAX_PX[layout] }, box: { x0, x1: x0 + w, y0: below, y1: below + h }, bias });
      candidates.push({ label: { x: ax, y: above, align, side: "above", max: LABEL_MAX_PX[layout] }, box: { x0, x1: x0 + w, y0: above - h, y1: above }, bias: bias + 5 });
    }
    // Beside the medallion, at the full width or wrapped narrow.
    for (const wrapAt of [LABEL_MAX_PX[layout], LABEL_NARROW_PX[layout]]) {
      const side = labelSize(spot.place, layout, spot.open, wrapAt, k);
      // A note never breaks, so the box is at least as wide as its note.
      const max = Math.ceil(Math.max(wrapAt, side.w * k));
      const bias = wrapAt === LABEL_MAX_PX[layout] ? 7 : 10;
      candidates.push({ label: { x: x + r + gap, y, align: "start", side: "right", max }, box: { x0: x + r + gap, x1: x + r + gap + side.w, y0: y - side.h / 2, y1: y + side.h / 2 }, bias });
      candidates.push({ label: { x: x - r - gap, y, align: "end", side: "left", max }, box: { x0: x - r - gap - side.w, x1: x - r - gap, y0: y - side.h / 2, y1: y + side.h / 2 }, bias });
    }

    let best: { label: PlaceSpot["label"]; box: Box; score: number; clash: number } | null = null;
    for (const candidate of candidates) {
      const { box } = candidate;
      let score = candidate.bias;
      // What the name would cover, as area: everything but the road.
      let covered = 0;
      // Off the chart is worst of all.
      const inside = overlap(box, { x0: 4, y0: 4, x1: frame.width - 4, y1: frame.height - 4 });
      const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
      score += ((area - inside) / area) * 5000;
      covered += area - inside;
      // The road under a name makes it hard to read.
      for (const p of roadPts) {
        if (Math.hypot(p.x - x, p.y - y) < r + 3) continue;
        if (p.x > box.x0 - 1.5 && p.x < box.x1 + 1.5 && p.y > box.y0 - 1.5 && p.y < box.y1 + 1.5) score += 2.5;
      }
      // The open fork's name is the one the reader must find: no pin may
      // stand on it while any spot is free of them.
      for (const pin of pinBoxes) {
        const o = overlap(box, pin);
        score += o > 0 && spot.open ? 10000 : o * 2;
        covered += o;
      }
      for (const other of placed) {
        const o = overlap(box, other);
        score += o * 3;
        covered += o;
      }
      for (const other of places) {
        if (other === spot) continue;
        const o = overlap(box, { x0: other.x - other.r - 2, x1: other.x + other.r + 2, y0: other.y - other.r - 2, y1: other.y + other.r + 2 });
        score += o * 1.5;
        covered += o;
      }
      for (const thing of furniture) {
        const o = overlap(box, thing);
        score += o * 1.2;
        covered += o;
      }
      if (squad) score += overlap(box, { x0: squad.x - 8, x1: squad.x + 8, y0: squad.y - 8, y1: squad.y + 8 }) * 0.8;
      if (!best || score < best.score) best = { label: candidate.label, box, score, clash: covered / area };
    }
    if (!best) continue;
    if (labelRank(spot) >= 2 && best.clash > LABEL_CLASH_DROP) {
      spot.labelled = false;
      continue;
    }
    spot.label = { ...best.label, box: best.box };
    placed.push(best.box);
  }
}

/** Which pin (or none) a tap at (x, y) — CSS px inside the map box — means:
 *  the nearest pin head within reach. `box` is the map's size in px. */
export function pinAtPoint(model: MapModel, box: { width: number; height: number }, x: number, y: number, reach = 22): number | null {
  const sx = box.width / model.frame.width;
  const sy = box.height / model.frame.height;
  const head = model.pinPx;
  let best: { line: number; d: number } | null = null;
  for (const pin of model.pins) {
    const px = pin.x * sx;
    const py = (pin.y - pin.lift) * sy - head * 0.95;
    const d = Math.hypot(px - x, py - y);
    if (d <= reach && (!best || d < best.d)) best = { line: pin.line, d };
  }
  return best?.line ?? null;
}
