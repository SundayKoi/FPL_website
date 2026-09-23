// The living map's ground: each route's path and the land it crosses.
//
// Eight routes, eight places. The silhouettes began as RouteMap's 200×60
// paths — the scout's short hook, the raid's dip into the valley, the
// legend's descent, the legendary's climb, the mythic road that crosses
// itself — redrawn by hand for the 720×220 chart. The land is engraved in
// thin steel ink around them, one <g class="terrain"> per route:
//
//   scout      meadow contours, grass, and a river under the road
//   gilded     a paved band with gold milestones
//   raid       valley contours, pylons on a line, cooling towers
//   legend     contours stepping down, a cave hatched under the road
//   rescue     woods, and a palisade camp at the road's end
//   exorcism   no ground at all: a circle of salt
//   legendary  contours that break into a field of stars past the threshold
//   mythic     inverted: white ink on a deeper void, rings round the crossing
//
// The contours are real ones: each route has a height field (hills, a
// slope, a valley along the road, a little noise) and the lines are its
// level sets, traced by marching squares and smoothed. Seeded and pure, so
// the server and the browser trace the same lines; computed once per route
// and frame. The phone has its own road for every route (a switchback down
// a taller chart, the stops in the same order); the land is placed in the
// wide chart's units and carried into the phone's frame by one affine map,
// while round things — hills, rings, glyphs — keep their shape. No images,
// and few nodes: every family of lines is one <path>.

import type { ReactNode } from "react";
import type { ExpeditionTierKey } from "@/lib/expeditions/config";
import { mulberry32 } from "@/lib/expeditions/prng";
import { FRAMES, fmt, pointAt, sampleRoute, sliceRoute, smoothOpen, type Frame, type MapLayout, type Pt, type Route } from "./mapLayout";
import { MapGlyph } from "./mapGlyphs";

/** Each route in the wide chart's 720×220 units. Checkpoints fall at equal
 *  shares of the path's LENGTH (checkpoint i ends leg i+1), so a path is
 *  drawn with its bends where the forks should stand, and a little room
 *  under each for its name. */
export const ROUTE_PATHS: Record<ExpeditionTierKey, string> = {
  // A short hook over the meadow and down to the ferry.
  scout: "M44 150 C 120 152, 170 98, 250 100 C 330 102, 370 146, 450 138 C 530 130, 590 84, 676 82",
  // The patrons' road: long, even, stately curves.
  gilded: "M44 122 C 130 122, 160 70, 250 74 C 340 78, 370 140, 460 138 C 550 136, 600 88, 676 88",
  // Down into the valley and up the far side.
  raid: "M44 64 C 120 66, 150 150, 240 148 C 330 146, 350 62, 440 64 C 530 66, 590 128, 676 122",
  // The descent: every bend lower than the last.
  legend: "M44 44 C 110 44, 120 98, 190 100 C 260 102, 280 64, 350 74 C 420 84, 440 136, 510 138 C 580 140, 620 156, 676 154",
  // Out to the holding camp and back with whoever was held.
  rescue: "M44 140 C 140 142, 190 90, 290 94 C 390 98, 430 138, 520 126 C 590 116, 630 104, 664 104",
  // Straight through the circle.
  exorcism: "M44 118 C 160 70, 250 150, 360 110 C 470 70, 560 150, 676 108",
  // The long climb and the stars past the threshold.
  legendary: "M44 156 C 100 156, 110 84, 170 86 C 230 88, 250 150, 320 144 C 390 138, 390 62, 460 64 C 530 66, 530 140, 600 134 C 640 130, 660 100, 676 96",
  // The road past the rift, which loops back across itself once.
  mythic: "M44 110 C 60 50, 110 40, 140 72 C 170 104, 180 150, 220 140 C 250 132, 260 104, 290 96 C 320 88, 344 88, 360 96 C 378 106, 390 124, 378 136 C 366 148, 342 146, 338 132 C 334 118, 346 102, 362 94 C 382 84, 420 76, 460 84 C 500 92, 510 146, 560 146 C 610 146, 620 60, 676 70",
};

/** Each route re-laid for the phone's 340×270 frame: the same stops in the
 *  same order, wound as switchbacks down a taller chart so the road is
 *  long enough for its pins and each name has a row of its own. */
export const PHONE_PATHS: Record<ExpeditionTierKey, string> = {
  scout: "M28 208 C 92 210, 104 124, 168 124 C 232 124, 248 74, 312 70",
  gilded: "M28 150 C 84 150, 84 64, 146 66 C 208 68, 196 204, 258 204 C 298 204, 314 164, 314 128",
  raid: "M28 66 C 92 68, 96 206, 160 204 C 224 202, 222 74, 276 76 C 306 78, 316 130, 314 170",
  legend: "M28 46 C 110 44, 230 44, 282 60 C 330 76, 322 118, 258 122 C 190 126, 110 116, 70 136 C 26 158, 40 204, 110 204 C 180 204, 250 200, 312 210",
  rescue: "M28 204 C 100 206, 104 112, 176 112 C 236 112, 250 150, 290 146",
  exorcism: "M26 216 C 84 216, 110 136, 170 136 C 230 136, 256 56, 314 56",
  legendary: "M28 150 C 40 100, 60 52, 120 50 C 190 48, 250 44, 290 70 C 326 94, 310 128, 250 130 C 190 132, 110 120, 72 146 C 34 172, 50 206, 120 208 C 190 210, 250 204, 312 212",
  mythic: "M28 62 C 44 30, 80 26, 104 46 C 128 66, 150 74, 176 56 C 202 38, 230 30, 262 42 C 316 62, 332 110, 290 122 C 260 130, 220 124, 180 128 C 140 132, 120 136, 96 128 C 72 120, 66 96, 84 92 C 104 88, 110 116, 94 140 C 80 160, 30 160, 34 190 C 38 222, 120 222, 312 226",
};

/** Where a route's design box (x 40–680, y 30–190 of the wide chart) lands
 *  in each frame: used to place the land (hills, towers), which follows
 *  the chart's proportions rather than the road's. */
const DESIGN = { x0: 40, x1: 680, y0: 30, y1: 190 };
const BOXES: Record<MapLayout, { x0: number; x1: number; y0: number; y1: number }> = {
  wide: DESIGN,
  phone: { x0: 20, x1: 320, y0: 30, y1: 240 },
};

export interface Geometry {
  tier: ExpeditionTierKey;
  layout: MapLayout;
  frame: Frame;
  route: Route;
  /** Design units (the wide chart's) into this frame. */
  map: (p: Pt) => Pt;
  /** How big a round thing drawn in design units is here. */
  k: number;
}

const geometries = new Map<string, Geometry>();

export function geometryFor(tier: ExpeditionTierKey, layout: MapLayout): Geometry {
  const id = `${tier}:${layout}`;
  const hit = geometries.get(id);
  if (hit) return hit;
  const box = BOXES[layout];
  const sx = (box.x1 - box.x0) / (DESIGN.x1 - DESIGN.x0);
  const sy = (box.y1 - box.y0) / (DESIGN.y1 - DESIGN.y0);
  const map = (p: Pt): Pt => ({ x: box.x0 + (p.x - DESIGN.x0) * sx, y: box.y0 + (p.y - DESIGN.y0) * sy });
  const d = layout === "wide" ? ROUTE_PATHS[tier] : PHONE_PATHS[tier];
  const geometry: Geometry = { tier, layout, frame: FRAMES[layout], route: sampleRoute(d), map, k: layout === "wide" ? 1 : 0.62 };
  geometries.set(id, geometry);
  return geometry;
}

// === contours ================================================================

type Field = (x: number, y: number) => number;

/** Smooth value noise in [-1, 1], seeded. */
function noise(seed: number): Field {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed + 1, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
  };
}

/** A hill: a smooth bump at a design point, its size kept round here. */
function bump(g: Geometry, cx: number, cy: number, r: number, amp: number): Field {
  const c = g.map({ x: cx, y: cy });
  const rr = (r * g.k) ** 2;
  return (x, y) => amp * Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / rr);
}

/** Two octaves of noise at a feature size in design units. */
function grain(g: Geometry, amp: number, size: number, seed: number): Field {
  const n = noise(seed);
  const s = size * g.k;
  return (x, y) => amp * (n(x / s, y / s) * 0.7 + n((x / s) * 2.1 + 17, (y / s) * 2.1 + 5) * 0.3);
}

function sum(...fields: Field[]): Field {
  return (x, y) => fields.reduce((total, field) => total + field(x, y), 0);
}

/** Distance to the road, per grid point: the valley's floor. */
function roadDistance(g: Geometry): Field {
  const pts: Pt[] = [];
  for (let s = 0; s <= g.route.length; s += 4) pts.push(pointAt(g.route, s / g.route.length));
  return (x, y) => {
    let best = Infinity;
    for (const p of pts) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

interface Contours {
  /** The ordinary contours, one path. */
  lines: string;
  /** Every fourth contour, drawn a little heavier, as a surveyor would. */
  index: string;
}

// Marching squares: for each of the 16 corner cases (tl 8, tr 4, br 2,
// bl 1 above the level), the cell edges a contour crosses (0 top, 1 right,
// 2 bottom, 3 left). The two saddles are settled by the cell's centre.
const CASES: Record<number, [number, number][]> = {
  1: [[3, 2]],
  2: [[2, 1]],
  3: [[3, 1]],
  4: [[0, 1]],
  6: [[0, 2]],
  7: [[3, 0]],
  8: [[3, 0]],
  9: [[0, 2]],
  11: [[0, 1]],
  12: [[3, 1]],
  13: [[2, 1]],
  14: [[3, 2]],
};

function chaikin(points: Pt[], closed: boolean, rounds = 2): Pt[] {
  let pts = points;
  for (let round = 0; round < rounds; round += 1) {
    const out: Pt[] = closed ? [] : [pts[0]];
    const n = pts.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

/**
 * The level sets of a field over the frame, as smooth polylines. `levels`
 * lines are spread evenly across the field's range, or `at` gives them.
 */
function traceContours(field: Field, frame: Frame, options: { cell: number; levels?: number; at?: number[]; indexEvery?: number; minLength?: number; keep?: (p: Pt) => boolean }): Contours {
  const { cell } = options;
  const nx = Math.ceil(frame.width / cell) + 1;
  const ny = Math.ceil(frame.height / cell) + 1;
  const values: number[][] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < ny; j += 1) {
    const row: number[] = [];
    for (let i = 0; i < nx; i += 1) {
      const v = field(i * cell, j * cell);
      row.push(v);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    values.push(row);
  }
  const count = options.levels ?? 8;
  const levels = options.at ?? Array.from({ length: count }, (_, k) => lo + ((hi - lo) * (k + 1)) / (count + 1));
  const every = options.indexEvery ?? 4;
  const lines: string[] = [];
  const index: string[] = [];

  levels.forEach((level, k) => {
    const points = new Map<string, Pt>();
    const links = new Map<string, string[]>();
    const edgePoint = (key: string, ax: number, ay: number, av: number, bx: number, by: number, bv: number) => {
      if (!points.has(key)) {
        const t = av === bv ? 0.5 : (level - av) / (bv - av);
        points.set(key, { x: (ax + (bx - ax) * t) * cell, y: (ay + (by - ay) * t) * cell });
      }
      return key;
    };
    const link = (a: string, b: string) => {
      links.set(a, [...(links.get(a) ?? []), b]);
      links.set(b, [...(links.get(b) ?? []), a]);
    };
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const tl = values[j][i];
        const tr = values[j][i + 1];
        const br = values[j + 1][i + 1];
        const bl = values[j + 1][i];
        const code = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const edge = (e: number) =>
          e === 0
            ? edgePoint(`h${i},${j}`, i, j, tl, i + 1, j, tr)
            : e === 1
              ? edgePoint(`v${i + 1},${j}`, i + 1, j, tr, i + 1, j + 1, br)
              : e === 2
                ? edgePoint(`h${i},${j + 1}`, i, j + 1, bl, i + 1, j + 1, br)
                : edgePoint(`v${i},${j}`, i, j, tl, i, j + 1, bl);
        let pairs = CASES[code];
        if (code === 5 || code === 10) {
          const centreHigh = (tl + tr + br + bl) / 4 > level;
          pairs = (code === 5) === centreHigh ? [[3, 0], [2, 1]] : [[0, 1], [3, 2]];
        }
        for (const [a, b] of pairs ?? []) link(edge(a), edge(b));
      }
    }
    // Join the segments into lines: open ones from their ends, then loops.
    const used = new Set<string>();
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const walk = (start: string): { pts: Pt[]; closed: boolean } => {
      const chain = [start];
      let prev: string | null = null;
      let cur = start;
      for (;;) {
        const next: string | undefined = (links.get(cur) ?? []).find((candidate) => candidate !== prev && !used.has(pairKey(cur, candidate)));
        if (!next) break;
        used.add(pairKey(cur, next));
        if (next === start) return { pts: chain.map((key) => points.get(key)!), closed: true };
        chain.push(next);
        prev = cur;
        cur = next;
      }
      return { pts: chain.map((key) => points.get(key)!), closed: false };
    };
    const chains: { pts: Pt[]; closed: boolean }[] = [];
    for (const [key, next] of links) if (next.length === 1 && !used.has(pairKey(key, next[0]))) chains.push(walk(key));
    for (const [key, next] of links) if (next.some((n) => !used.has(pairKey(key, n)))) chains.push(walk(key));

    const target = k % every === every - 1 ? index : lines;
    for (const chain of chains) {
      if (chain.pts.length < 3) continue;
      let length = 0;
      for (let i = 1; i < chain.pts.length; i += 1) length += Math.hypot(chain.pts[i].x - chain.pts[i - 1].x, chain.pts[i].y - chain.pts[i - 1].y);
      if (length < (options.minLength ?? 14)) continue;
      const smooth = chaikin(chain.pts, chain.closed);
      // Keep the markup small: drop points closer than a unit and a half.
      const kept: Pt[] = [];
      for (const p of smooth) {
        const last = kept[kept.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.6) kept.push(p);
      }
      if (options.keep) {
        // Cut the line where it leaves the kept region.
        let run: Pt[] = [];
        const flush = () => {
          if (run.length > 2) target.push(`M${run.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join("L")}`);
          run = [];
        };
        for (const p of kept) {
          if (options.keep(p)) run.push(p);
          else flush();
        }
        flush();
      } else {
        target.push(`M${kept.map((p) => `${fmt(p.x)} ${fmt(p.y)}`).join("L")}${chain.closed ? "Z" : ""}`);
      }
    }
  });
  return { lines: lines.join(""), index: index.join("") };
}

// === each route's land =======================================================

interface Land {
  field: (g: Geometry) => Field;
  levels?: number;
  at?: (g: Geometry) => number[];
  keep?: (g: Geometry) => (p: Pt) => boolean;
}

/** Where the Legendary route's ground gives out: just past its first fork
 *  (the threshold, a fifth of the way). */
export const THRESHOLD = 0.2;

/** How far along the road the nearest bit of road is, for any point: the
 *  land "before the threshold" is the land nearest the road before it,
 *  whichever way the road winds in a frame. */
function nearestFraction(g: Geometry): (p: Pt) => number {
  const pts: { p: Pt; f: number }[] = [];
  for (let s = 0; s <= g.route.length; s += 5) pts.push({ p: pointAt(g.route, s / g.route.length), f: s / g.route.length });
  return ({ x, y }) => {
    let best = { d: Infinity, f: 0 };
    for (const { p, f } of pts) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < best.d) best = { d, f };
    }
    return best.f;
  };
}

/** The Mythic road's crossing, the eye of the rift. */
function riftEye(g: Geometry): Pt {
  return g.layout === "wide" ? { x: 360, y: 104 } : { x: 90, y: 114 };
}

const LANDS: Partial<Record<ExpeditionTierKey, Land>> = {
  // Low rolling meadow.
  scout: {
    field: (g) =>
      sum(
        bump(g, 160, 40, 120, 1),
        bump(g, 490, 214, 150, 1.15),
        bump(g, 650, 22, 100, 0.85),
        bump(g, 290, 222, 80, 0.5),
        bump(g, 20, 214, 100, 0.65),
        bump(g, 420, 8, 80, 0.45),
        grain(g, 0.14, 80, 3),
      ),
    levels: 10,
  },
  // Parkland either side of a made road.
  gilded: {
    field: (g) => sum(bump(g, 100, 20, 140, 0.95), bump(g, 590, 222, 160, 1.05), bump(g, 710, 36, 100, 0.6), bump(g, 330, 222, 110, 0.45), bump(g, 420, 0, 90, 0.4), grain(g, 0.1, 90, 5)),
    levels: 8,
  },
  // A valley with the road along its floor.
  raid: {
    field: (g) => {
      const far = roadDistance(g);
      return sum((x, y) => 1.6 * Math.min(1, far(x, y) / (80 * g.k)) ** 0.85, bump(g, 620, 20, 90, 0.5), bump(g, 70, 222, 100, 0.45), grain(g, 0.16, 70, 7));
    },
    levels: 11,
  },
  // Ground falling away to the right, faster the further it goes.
  legend: {
    field: (g) => {
      const w = g.frame.width;
      return sum((x, y) => 2.8 * (1 - (Math.max(0, x) / w) ** 1.6) + 0.3 * (y / g.frame.height), bump(g, 120, 214, 110, 0.45), bump(g, 560, 14, 100, 0.4), grain(g, 0.22, 70, 11));
    },
    levels: 13,
  },
  // Wooded hills.
  rescue: {
    field: (g) => sum(bump(g, 190, 20, 140, 1), bump(g, 440, 222, 130, 0.9), bump(g, 20, 190, 90, 0.5), bump(g, 650, 10, 90, 0.4), grain(g, 0.12, 80, 13)),
    levels: 9,
  },
  // Hills this side of the threshold; nothing past it.
  legendary: {
    field: (g) => {
      // Hills either side of the road's first stretch, wherever the frame
      // puts it.
      const a = pointAt(g.route, 0.06);
      const b = pointAt(g.route, 0.14);
      const lift = 46 * g.k + 10;
      const hill = (p: Pt, r: number, amp: number): Field => {
        const rr = (r * g.k) ** 2;
        return (x, y) => amp * Math.exp(-((x - p.x) ** 2 + (y - p.y) ** 2) / rr);
      };
      return sum(
        hill({ x: a.x + a.nx * lift, y: a.y + a.ny * lift }, 90, 1.15),
        hill({ x: b.x - b.nx * lift, y: b.y - b.ny * lift }, 80, 0.9),
        hill({ x: a.x - a.nx * lift * 1.4, y: a.y - a.ny * lift * 1.4 }, 70, 0.6),
        grain(g, 0.12, 70, 17),
      );
    },
    levels: 10,
    keep: (g) => {
      const along = nearestFraction(g);
      return (p) => along(p) < THRESHOLD;
    },
  },
  // The rift: warped rings round the crossing.
  mythic: {
    field: (g) => {
      const eye = riftEye(g);
      const warp = noise(23);
      return (x, y) => {
        const dx = (x - eye.x) / (1.35 * (g.layout === "wide" ? 1 : 0.62));
        const dy = (y - eye.y) / (0.78 * (g.layout === "wide" ? 1 : 0.9));
        const a = Math.atan2(dy, dx);
        return Math.hypot(dx, dy) * (1 + 0.14 * warp(Math.cos(a) * 1.6 + 4, Math.sin(a) * 1.6 + 4));
      };
    },
    at: (g) => (g.layout === "wide" ? [16, 30, 46, 64, 86, 112, 142, 176, 214] : [14, 26, 40, 56, 76, 100, 128]),
  },
};

const traced = new Map<string, Contours>();

/** A route's contours in a frame, traced once. */
export function contoursFor(g: Geometry): Contours | null {
  const land = LANDS[g.tier];
  if (!land) return null;
  const id = `${g.tier}:${g.layout}`;
  const hit = traced.get(id);
  if (hit) return hit;
  const contours = traceContours(land.field(g), g.frame, {
    cell: g.layout === "wide" ? 7 : 6,
    levels: land.levels,
    at: land.at?.(g),
    keep: land.keep?.(g),
  });
  traced.set(id, contours);
  return contours;
}

// === drawing helpers ========================================================

/** A line through design points, carried into the frame and smoothed. */
function curve(g: Geometry, pts: [number, number][]): string {
  return smoothOpen(pts.map(([x, y]) => g.map({ x, y })));
}

function nearRoute(route: Route, x: number, y: number, within: number): boolean {
  for (let i = 0; i < route.points.length; i += 2) {
    const p = route.points[i];
    if (Math.abs(p.x - x) < within && Math.abs(p.y - y) < within && Math.hypot(p.x - x, p.y - y) < within) return true;
  }
  return false;
}

/** Short tufts of grass scattered over the ground, clear of the road. */
function tufts(g: Geometry, count: number, seed: number, clear = 18): string {
  const rand = mulberry32(seed);
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 12) {
    guard += 1;
    const x = 16 + rand() * (g.frame.width - 32);
    const y = 18 + rand() * (g.frame.height - 36);
    if (nearRoute(g.route, x, y, clear)) continue;
    const s = 2 + rand() * 1.2;
    out.push(`M${fmt(x - s)} ${fmt(y)}l${fmt(s * 0.55)} ${fmt(-s)}M${fmt(x)} ${fmt(y)}l0 ${fmt(-s * 1.3)}M${fmt(x + s)} ${fmt(y)}l${fmt(-s * 0.55)} ${fmt(-s)}`);
  }
  return out.join("");
}

/** Points scattered as round dots (zero-length strokes), clear of the road. */
function dots(g: Geometry, count: number, seed: number, region: (x: number, y: number) => boolean, clear = 10): string {
  const rand = mulberry32(seed);
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 30) {
    guard += 1;
    const x = 12 + rand() * (g.frame.width - 24);
    const y = 12 + rand() * (g.frame.height - 24);
    if (!region(x, y) || nearRoute(g.route, x, y, clear)) continue;
    out.push(`M${fmt(x)} ${fmt(y)}h.01`);
  }
  return out.join("");
}

/** Ticks across the road's north kerb every `every` units. */
function milestones(g: Geometry, every: number, reach: number, lift: number): string {
  const out: string[] = [];
  for (let s = every; s < g.route.length - every / 2; s += every) {
    const p = pointAt(g.route, s / g.route.length);
    const a = { x: p.x + p.nx * lift, y: p.y + p.ny * lift };
    out.push(`M${fmt(a.x)} ${fmt(a.y)}l${fmt(p.nx * reach)} ${fmt(p.ny * reach)}`);
  }
  return out.join("");
}

/** A ring of stakes round a point, open where the road comes in. */
function palisade(at: Pt, rx: number, ry: number, stakes: number, gapAngle: number): string {
  const out: string[] = [];
  for (let i = 0; i < stakes; i += 1) {
    const a = (i / stakes) * Math.PI * 2;
    const off = Math.abs(Math.atan2(Math.sin(a - gapAngle), Math.cos(a - gapAngle)));
    if (off < 0.45) continue;
    const x = at.x + Math.cos(a) * rx;
    const y = at.y + Math.sin(a) * ry;
    out.push(`M${fmt(x)} ${fmt(y + 2.5)}V${fmt(y - 4.5)}`);
  }
  return out.join("");
}

// === the ground, per route ==================================================

interface Ink {
  fog: boolean;
  /** A line of ink in steel (or white, on the void), at an opacity. */
  line: (opacity: number, width?: number) => Record<string, string | number>;
}

/**
 * The land a route crosses, drawn under everything else. Under a Fog week
 * the contours drop to 10% (spec §6.1).
 */
export function Terrain({ g, fog = false, uid }: { g: Geometry; fog?: boolean; uid: string }) {
  const ink: Ink = {
    fog,
    line: (opacity, width = 0.6) => ({
      fill: "none",
      stroke: g.tier === "mythic" ? "var(--color-content)" : "var(--color-steel)",
      strokeOpacity: fog ? Math.min(opacity, 0.1) : opacity,
      strokeWidth: width,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      vectorEffect: "non-scaling-stroke",
    }),
  };
  const contours = contoursFor(g);
  return (
    <g className="terrain" data-terrain={g.tier} aria-hidden>
      {contours ? (
        <>
          <path data-contours="lines" d={contours.lines} {...ink.line(g.tier === "mythic" ? 0.15 : 0.24, 0.7)} />
          <path data-contours="index" d={contours.index} {...ink.line(g.tier === "mythic" ? 0.28 : 0.4, 1)} />
        </>
      ) : null}
      {TERRAIN[g.tier](g, ink, uid)}
    </g>
  );
}

const TERRAIN: Record<ExpeditionTierKey, (g: Geometry, ink: Ink, uid: string) => ReactNode> = {
  scout: (g, ink) => (
    <>
      <path d={tufts(g, g.layout === "wide" ? 30 : 14, 21)} {...ink.line(0.2, 0.7)} />
      {/* The river, under the road once: a band of water that parts the
          contours, drawn as its two banks (a wide stroke with the canvas
          laid down its middle), and the current in it. */}
      <path d={river(g)} fill="none" stroke="var(--color-steel)" strokeOpacity={ink.fog ? 0.2 : 0.5} strokeWidth={g.layout === "wide" ? 9 : 8} strokeLinecap="round" />
      <path d={river(g)} fill="none" className="map-knockout" strokeWidth={g.layout === "wide" ? 7.4 : 6.4} strokeLinecap="round" />
      <path d={river(g)} {...ink.line(0.3, 0.6)} strokeDasharray="3 5" />
    </>
  ),
  gilded: (g, ink) => (
    <>
      {/* The paved band: a kerb either side of the road. */}
      <path d={[sliceRoute(g.route, 0.02, 0.98, 6.5), sliceRoute(g.route, 0.02, 0.98, -6.5)].join(" ")} {...ink.line(0.36, 0.8)} />
      <path d={milestones(g, g.layout === "wide" ? 40 : 30, 4, 7)} fill="none" stroke="var(--color-gold)" strokeOpacity={ink.fog ? 0.35 : 0.7} strokeWidth={1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </>
  ),
  raid: (g, ink) => {
    // A power line striding across the valley: three pylons and the cable.
    const poles = (g.layout === "wide" ? [[120, 196], [330, 204], [590, 190]] : [[90, 214], [360, 222], [630, 208]]).map(([x, y]) => g.map({ x, y }));
    const lift = g.layout === "wide" ? 7 : 6;
    const cable = poles.slice(1).map((b, i) => {
      const a = poles[i];
      return `M${fmt(a.x)} ${fmt(a.y - lift)}Q${fmt((a.x + b.x) / 2)} ${fmt((a.y + b.y) / 2 + 2)} ${fmt(b.x)} ${fmt(b.y - lift)}`;
    });
    const towers = (g.layout === "wide" ? [[214, 26], [246, 32]] : [[190, 16], [250, 20]]).map(([x, y]) => g.map({ x, y }));
    return (
      <>
        <path d={cable.join("")} {...ink.line(0.32, 0.7)} />
        <g color="var(--color-steel)" opacity={ink.fog ? 0.25 : 0.5}>
          {poles.map((p, i) => (
            <MapGlyph key={`pylon-${i}`} name="pylon" x={p.x} y={p.y} size={g.layout === "wide" ? 15 : 14} stroke={0.8} />
          ))}
          {towers.map((p, i) => (
            <MapGlyph key={`tower-${i}`} name="tower" x={p.x} y={p.y} size={(i === 0 ? 20 : 16) * (g.layout === "wide" ? 1 : 0.85)} stroke={0.85} />
          ))}
        </g>
      </>
    );
  },
  legend: (g, ink, uid) => (
    <>
      {/* The cave under the last third of the road: hatching that fades
          into the ground, and the mouth's lip along the road. */}
      <path fill={`url(#${uid}-cave)`} stroke="none" d={caveShape(g, 0.58, 0.99)} mask={`url(#${uid}-cave-fade)`} />
      <path d={sliceRoute(g.route, 0.6, 0.985, -8)} {...ink.line(0.42, 0.9)} />
    </>
  ),
  rescue: (g, ink) => {
    const end = pointAt(g.route, 1);
    const rx = g.layout === "wide" ? 32 : 26;
    const ry = g.layout === "wide" ? 22 : 24;
    const trees = dots(g, g.layout === "wide" ? 30 : 14, 51, (x, y) => (y < g.frame.height * 0.3 || y > g.frame.height * 0.76) && x < g.frame.width * 0.8, 20);
    const trunks = trees
      .split("M")
      .filter(Boolean)
      .map((chunk) => {
        const [x, y] = chunk.replace("h.01", "").split(" ").map(Number);
        return `M${fmt(x)} ${fmt(y + 3.2)}v3`;
      })
      .join("");
    return (
      <>
        {/* Woods: a stand of trees, a round crown on a stroke of trunk. */}
        <path d={trunks} {...ink.line(0.34, 0.8)} />
        <path d={trees} fill="none" stroke="var(--color-steel)" strokeOpacity={ink.fog ? 0.14 : 0.36} strokeWidth={g.layout === "wide" ? 7 : 6.5} strokeLinecap="round" />
        <path d={trees} fill="none" className="map-knockout" strokeWidth={g.layout === "wide" ? 5.4 : 5} strokeLinecap="round" />
        {/* The palisade round the camp the squad brings them home to. */}
        <ellipse cx={end.x} cy={end.y} rx={rx + 5} ry={ry + 4} fill="none" stroke="var(--color-steel)" strokeOpacity={0.2} strokeWidth={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        <path d={palisade(end, rx, ry, 30, Math.PI)} {...ink.line(0.6, 1.2)} />
      </>
    );
  },
  exorcism: (g) => {
    const mid = pointAt(g.route, 0.5);
    const r = g.layout === "wide" ? 64 : 58;
    return (
      <>
        {/* No ground: the rite happens nowhere in particular. A circle of
            salt poured by hand, a fine ring inside it, and a mark at each
            quarter. */}
        <circle cx={mid.x} cy={mid.y} r={r + 9} fill="none" stroke="var(--color-steel)" strokeOpacity={0.14} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <circle cx={mid.x} cy={mid.y} r={r} fill="none" stroke="var(--color-content)" strokeOpacity={0.55} strokeWidth={1.7} strokeDasharray="0.01 4" strokeLinecap="round" />
        <circle cx={mid.x} cy={mid.y} r={r - 8} fill="none" stroke="var(--color-steel)" strokeOpacity={0.26} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <g color="var(--color-steel)" opacity={0.55}>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 - Math.PI / 2 + Math.PI / 4;
            return <MapGlyph key={i} name="salt" x={mid.x + Math.cos(a) * (r + 9)} y={mid.y + Math.sin(a) * (r + 9)} size={11} stroke={0.9} />;
          })}
        </g>
      </>
    );
  },
  legendary: (g, ink) => {
    // Past the threshold the ground gives out and there is nothing under
    // the road but stars.
    const along = nearestFraction(g);
    const past = (margin: number) => (x: number, y: number) => along({ x, y }) > THRESHOLD + margin;
    const bright = dots(g, g.layout === "wide" ? 13 : 10, 71, past(0.04), 9);
    const dim = dots(g, g.layout === "wide" ? 27 : 18, 72, past(0.02), 7);
    const sparks = dots(g, g.layout === "wide" ? 3 : 2, 73, (x, y) => past(0.08)(x, y) && y > 20 && y < g.frame.height - 20, 24)
      .split("M")
      .filter(Boolean)
      .map((chunk) => {
        const [x, y] = chunk.replace("h.01", "").split(" ").map(Number);
        return `M${fmt(x)} ${fmt(y - 4)}V${fmt(y + 4)}M${fmt(x - 4)} ${fmt(y)}H${fmt(x + 4)}`;
      })
      .join("");
    // The threshold itself: a line across the road just past the first fork.
    const t = pointAt(g.route, THRESHOLD + (g.layout === "wide" ? 0.03 : 0.025));
    const reach = g.layout === "wide" ? 46 : 34;
    return (
      <>
        <path d={`M${fmt(t.x + t.nx * reach)} ${fmt(t.y + t.ny * reach)}L${fmt(t.x - t.nx * reach)} ${fmt(t.y - t.ny * reach)}`} {...ink.line(0.4, 0.8)} strokeDasharray="1 4" />
        <path d={bright} fill="none" stroke="var(--color-content)" strokeOpacity={ink.fog ? 0.3 : 0.75} strokeWidth={1.8} strokeLinecap="round" />
        <path d={dim} fill="none" stroke="var(--color-steel)" strokeOpacity={ink.fog ? 0.25 : 0.55} strokeWidth={1.1} strokeLinecap="round" />
        <path d={sparks} fill="none" stroke="var(--color-content)" strokeOpacity={ink.fog ? 0.2 : 0.5} strokeWidth={0.7} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </>
    );
  },
  mythic: (g, ink) => {
    const motes = dots(g, g.layout === "wide" ? 26 : 14, 82, () => true, 10);
    const eye = riftEye(g);
    return (
      <>
        <path d={motes} fill="none" stroke="var(--color-content)" strokeOpacity={ink.fog ? 0.2 : 0.45} strokeWidth={1.1} strokeLinecap="round" />
        {/* The rift itself, a tear at the eye. */}
        <path
          d={`M${fmt(eye.x - 6)} ${fmt(eye.y - 12)}L${fmt(eye.x - 1)} ${fmt(eye.y - 3)}L${fmt(eye.x - 5)} ${fmt(eye.y + 3)}L${fmt(eye.x + 2)} ${fmt(eye.y + 12)}`}
          {...ink.line(0.5, 1)}
        />
      </>
    );
  },
};

/** The Scouting Run's river, crossing the chart under the road. */
function river(g: Geometry): string {
  return curve(g, [[330, -6], [312, 40], [348, 86], [372, 126], [346, 170], [376, 228]]);
}

/** The cave under the road: the band between the road and the chart's
 *  foot, over part of the route. */
function caveShape(g: Geometry, from: number, to: number): string {
  const top = sliceRoute(g.route, from, to, -9).slice(1);
  const a = pointAt(g.route, from);
  const b = pointAt(g.route, to);
  return `M${top}L${fmt(b.x + 8)} ${fmt(g.frame.height)}L${fmt(a.x - 12)} ${fmt(g.frame.height)}Z`;
}

/** The box the cave's fade is drawn in: from its mouth to the chart's foot. */
function caveBox(g: Geometry): { x: number; y: number; width: number; height: number } {
  const a = pointAt(g.route, 0.58);
  const b = pointAt(g.route, 0.99);
  const x = Math.min(a.x, b.x) - 20;
  const y = Math.min(a.y, b.y) - 4;
  return { x, y, width: Math.abs(b.x - a.x) + 40, height: g.frame.height - y };
}

/** The terrain's own defs: the cave's hatch and its fade. Emitted inside
 *  the map's <defs>. */
export function TerrainDefs({ g, uid }: { g: Geometry; uid: string }) {
  if (g.tier !== "legend") return null;
  return (
    <>
      {/* Rock strata, not a hatch: a section through the ground, so the
          cave never reads as the fog's diagonal lines. */}
      <pattern id={`${uid}-cave`} width={14} height={5} patternUnits="userSpaceOnUse">
        <path d="M0 1.5h8M7 4h7M-1 4h2" stroke="var(--color-steel)" strokeOpacity={0.5} strokeWidth={0.7} strokeLinecap="round" />
      </pattern>
      <radialGradient id={`${uid}-cave-grad`} cx="0.62" cy="0.1" r="0.75">
        <stop offset="0" stopColor="white" stopOpacity={1} />
        <stop offset="0.6" stopColor="white" stopOpacity={0.55} />
        <stop offset="1" stopColor="white" stopOpacity={0} />
      </radialGradient>
      <mask id={`${uid}-cave-fade`} maskUnits="userSpaceOnUse" x={0} y={0} width={g.frame.width} height={g.frame.height}>
        <rect {...caveBox(g)} fill={`url(#${uid}-cave-grad)`} />
      </mask>
    </>
  );
}
