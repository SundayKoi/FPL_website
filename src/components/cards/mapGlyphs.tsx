// The living map's glyphs: one monoline set, drawn in an 18×18 box with a
// 1.5 stroke and round ends — the hand of the board's 14px icons
// (expeditionIcons.tsx), a size up, because these sit on a chart.
//
// A place's glyph is keyed by its FAMILY, not its title: the toll bridge
// is a bridge, the ferry and the river crossing are both a boat. Every
// place key a road can draw (ROADS in routes.ts) maps to one here, and
// mapGlyphs.test.tsx fails on a key that does not — a new place on a road
// with no glyph would otherwise fall back silently to the waypoint.
//
// Keys only. A client component holds this table, and a key is what the
// server already sends for a KNOWN place; an unknown place has no key in
// its view at all, and draws the `?`.

import type { SVGProps } from "react";

export type MapGlyphName =
  | "water"
  | "orchard"
  | "boat"
  | "fair"
  | "bridge"
  | "gate"
  | "ledger"
  | "lantern"
  | "mask"
  | "stair"
  | "hourglass"
  | "reactor"
  | "mast"
  | "ridge"
  | "barricade"
  | "kennel"
  | "shaft"
  | "chapel"
  | "furnace"
  | "checkpoint"
  | "village"
  | "bell"
  | "vault"
  | "throne"
  | "sleeper"
  | "camp"
  | "gavel"
  | "void-road"
  | "orrery"
  | "hollow"
  | "cathedral"
  | "eclipse"
  | "throne-glass"
  | "shore"
  | "door"
  | "threshold"
  | "doors"
  | "choir"
  | "mirror"
  | "rift"
  | "sky"
  | "tide"
  | "signpost"
  | "table"
  | "keeper"
  // Not places: the chart's own marks.
  | "unknown"
  | "waypoint"
  | "start"
  | "home"
  | "cloud"
  | "eye"
  | "pylon"
  | "tower"
  | "cairn"
  | "boss"
  | "ghost"
  | "salt";

/** Each glyph as one path in an 18×18 box. Dots are zero-length strokes
 *  (`h.01`), which the round cap turns into a point. */
export const GLYPH_PATHS: Record<MapGlyphName, string> = {
  // Three swells: a riverbed, a flooded works, black water.
  water: "M2 6.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0M2 10.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0M4.2 14.5c1.2-1 2.4-1 3.6 0s2.4 1 3.6 0",
  // Two trees over a wall.
  orchard: "M1.5 16h15M3.5 16v-2.5h11V16M3.5 7.2a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0M6.3 10v3.5M9.4 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12.4 9v4.5",
  // A hull, a mast, a sail, a swell.
  boat: "M2.5 10.5h13l-2.3 3.2H4.8zM9 10.5V2.5M9 3.2l4.6 6.1H9M2 16.5c1.2-.8 2.3-.8 3.5 0s2.3.8 3.5 0 2.3-.8 3.5 0 2.3.8 3.5 0",
  // A pavilion and its pennant.
  fair: "M2 16h14M3.5 16 9 7.5l5.5 8.5M9 7.5V2l3.8 1.4L9 4.8M6.8 16 9 12.3l2.2 3.7",
  // A deck on two piers, the arch between.
  bridge: "M1.5 7h15M3.5 7v9M14.5 7v9M3.5 16a5.5 5 0 0 1 11 0M6.5 7V4.5M11.5 7V4.5M3.5 4.5h11",
  // Two pillars, an arch, the bars.
  gate: "M3 16.5V4M15 16.5V4M3 8.5a6 5 0 0 1 12 0M6.3 16.5V5.4M9 16.5V3.6M11.7 16.5V5.4M1.5 16.5h15",
  // An open book, ruled.
  ledger: "M9 5c-2-1.5-4.5-1.8-6.5-1.2v10.5c2-.6 4.5-.3 6.5 1.2 2-1.5 4.5-1.8 6.5-1.2V3.8C13.5 3.2 11 3.5 9 5zM9 5v10.5M4.6 7.2H7M4.6 9.8H7M11 7.2h2.4M11 9.8h2.4",
  // A hanging lantern and its flame.
  lantern: "M9 1.5v2M6.5 3.5h5M6.2 3.5c-.8 1.5-1.2 3-1.2 5.5s.4 4 1.2 5.5h5.6c.8-1.5 1.2-3 1.2-5.5s-.4-4-1.2-5.5M6.5 16.5h5M9 7.2v3.6",
  // A masquerade mask on its stick.
  mask: "M2 6.5c2.5-1 4.5-.6 7 .8 2.5-1.4 4.5-1.8 7-.8-.2 3.5-1.8 6-4.2 6-1.4 0-2.1-1-2.8-2-.7 1-1.4 2-2.8 2C3.8 12.5 2.2 10 2 6.5zM4.8 8.7c.8-.6 1.8-.6 2.5 0M10.7 8.7c.7-.6 1.7-.6 2.5 0M14.3 12.2l1.7 4.3",
  // Steps climbing.
  stair: "M2 16h3.5v-3.5H9V9h3.5V5.5H16M2 16V12.5M16 5.5V2",
  // The stairwell of hours.
  hourglass: "M4.5 2h9M4.5 16h9M5.5 2c0 3.5 3.5 4.5 3.5 7s-3.5 3.5-3.5 7M12.5 2c0 3.5-3.5 4.5-3.5 7s3.5 3.5 3.5 7M7.2 14.4h3.6",
  // The trefoil.
  reactor:
    "M7.75 6.83 5.75 3.37A6.5 6.5 0 0 1 12.25 3.37L10.25 6.83A2.5 2.5 0 0 0 7.75 6.83zM11.5 9h4A6.5 6.5 0 0 1 12.25 14.63L10.25 11.17A2.5 2.5 0 0 0 11.5 9zM7.75 11.17 5.75 14.63A6.5 6.5 0 0 1 2.5 9h4A2.5 2.5 0 0 0 7.75 11.17zM9 9h.01",
  // A lattice mast sending.
  mast: "M6.3 16.5 9 5l2.7 11.5M7.3 12.3h3.4M8.2 8.6h1.6M5 16.5h8M6.4 2.6a3.4 3.4 0 0 0 0 4.8M11.6 2.6a3.4 3.4 0 0 1 0 4.8M4.2 1.2a5.8 5.8 0 0 0 0 7.6M13.8 1.2a5.8 5.8 0 0 1 0 7.6",
  // A ridge line, snow on the peak.
  ridge: "M1.5 15.5 6.5 7.5l3 4 3-6.5 4 10.5M10.8 8.6l1.7 1.3 1.3-1.6M1.5 15.5h15",
  // A striped plank on two legs.
  barricade: "M2 6.5h14v4H2zM4 10.5v6M14 10.5v6M2.5 16.5h3M12.5 16.5h3M6.5 6.5 4 10.5M10.5 6.5 8 10.5M14.5 6.5 12 10.5",
  // A kennel.
  kennel: "M1.5 9.5 9 3.5l7.5 6M3.5 8v8.5h11V8M7 16.5v-3a2 2 0 0 1 4 0v3",
  // A mine's headframe.
  shaft: "M4 16.5 7 4h4l3 12.5M5.2 11.5h7.6M6.2 7.5h5.6M9 4V1.5M2.5 16.5h13M9 11.5v5",
  // A chapel with the water at its door.
  chapel: "M4.5 13V7.8L9 4l4.5 3.8V13M9 4V1M7.6 2.2h2.8M7.6 13v-2.6a1.4 1.4 0 0 1 2.8 0V13M2 14c1.2-.8 2.3-.8 3.5 0s2.3.8 3.5 0 2.3-.8 3.5 0 2.3.8 3.5 0M4.5 16.8c1-.6 2-.6 3 0s2 .6 3 0 2-.6 3 0",
  // A furnace, two stacks, a flame.
  furnace: "M3 16.5V7.5h12v9M1.5 16.5h15M6 16.5V13a3 3 0 0 1 6 0v3.5M6 7.5V4M11.5 7.5V2.5M9 15.4c-1-.8-1-1.9 0-3.1 1 1.2 1 2.3 0 3.1z",
  // A boom across the road.
  checkpoint: "M3.5 16.5V5.5M1.5 16.5h4M3.5 7.5 16.5 4.3M6.8 6.7l.9 2.1M10.2 5.9l.9 2.1M13.6 5l.9 2.1M3.5 5.5a1 1 0 1 0 0-.01",
  // Two houses, nobody in.
  village: "M1.5 16h15M2.5 16v-5.5l3.5-3 3.5 3V16M9.5 16V8.6l3-2.6 3 2.6V16M5 16v-2.4h2V16M12 11h1",
  // A bell.
  bell: "M9 2v1.8M4.5 13c1-1.5 1.2-3 1.2-5a3.3 3.3 0 0 1 6.6 0c0 2 .2 3.5 1.2 5zM3.2 13h11.6M7.5 15a1.5 1.5 0 0 0 3 0",
  // A vault's door and wheel.
  vault: "M2.5 3h13v12h-13zM5.8 9a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M9 5.8v6.4M5.8 9h6.4M4.5 15v1.5M13.5 15v1.5",
  // A throne, crowned.
  throne: "M5 16.5v-5h8v5M5 11.5V3.5l2 1.6 2-2.6 2 2.6 2-1.6v8M3.5 11.5h11M5 14h8",
  // A closed eye.
  sleeper: "M2 8c2.2 3 4.5 4.3 7 4.3S13.8 11 16 8M4.4 11.1 3.2 12.8M9 12.3v2.2M13.6 11.1l1.2 1.7M12 3.2h2.6L12 5.8h2.6",
  // A tent behind a fence.
  camp: "M1.5 16.5h15M3 16.5 7.5 8.5l4.5 8M7.5 8.5V5.8M7.5 5.8l2.4.9-2.4.9M6 16.5l1.5-2.8L9 16.5M13.6 16.5V11M15.8 16.5V11M13 12.8h3.3",
  // A gavel.
  gavel: "M7.5 6 11 2.5l3 3-3.5 3.5zM9 7.5 3.5 13M2.5 16h8",
  // A road that stops being a road.
  "void-road": "M2 16.5c2.8-2 4.8-4.8 6.5-8M5.5 16.5c2.4-2 4-4.4 5.3-7.4M10.8 5.2h.01M12.4 3h.01M14.6 5.6h.01M15.8 2.2h.01M13.3 8h.01",
  // Orbits and a sun.
  orrery: "M7.4 9a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0M4.5 9a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M3.9 3.9A7.2 7.2 0 1 1 3.1 13M13.5 9h.01M3.9 3.9h.01",
  // A pit.
  hollow: "M2 9.5c0-2 3.1-3.5 7-3.5s7 1.5 7 3.5-3.1 3.5-7 3.5-7-1.5-7-3.5zM5.3 9.6c0-.9 1.7-1.6 3.7-1.6s3.7.7 3.7 1.6M9 13v3.5M5 12.5l-.8 2.5M13 12.5l.8 2.5",
  // A pointed arch with teeth in it.
  cathedral: "M3 16.5V8l6-6 6 6v8.5M1.5 16.5h15M6.5 16.5V11a2.5 2.5 0 0 1 5 0v5.5M6.5 12.4l.8.9.9-.9.8.9.8-.9.9.9.8-.9",
  // The sun gone out, its corona.
  eclipse: "M4 9a5 5 0 1 0 10 0a5 5 0 1 0-10 0M9 1v1.4M9 15.6V17M1 9h1.4M15.6 9H17M3.3 3.3l1 1M13.7 13.7l1 1M3.3 14.7l1-1M13.7 4.3l1-1",
  // A throne of glass, faceted.
  "throne-glass": "M5 16.5v-5h8v5M5 11.5V4l4-2 4 2v7.5M3.5 11.5h11M7 4.6l2 3 2-3M9 7.6v3.9",
  // A far shore past the swell.
  shore: "M1.5 8.5h15M3.5 8.5c1.4-2.4 2.8-3.4 4.2-3.4S10.3 6 11.3 8.5M2 12c1.2-.8 2.3-.8 3.5 0s2.3.8 3.5 0 2.3-.8 3.5 0 2.3.8 3.5 0M4 15.5c1-.6 2-.6 3 0s2 .6 3 0 2-.6 3 0",
  // A door standing open.
  door: "M4 16.5v-14h9v14M2.5 16.5h13M13 2.5 9 4v12.5M10.5 9.5v1.2",
  // A doorway, and the step across it.
  threshold: "M4 13V6.5a5 5 0 0 1 10 0V13M2 13h14M3.5 15.8h11M9 13V9",
  // Three doors in a row.
  doors: "M1.5 16h15M2.5 16V8.5a1.8 1.8 0 0 1 3.6 0V16M7.2 16V6a1.8 1.8 0 0 1 3.6 0v10M11.9 16V8.5a1.8 1.8 0 0 1 3.6 0V16",
  // Two notes, beamed.
  choir: "M6.5 14V4.5l8-2V12M6.5 7l8-2M4.8 14a1.7 1.4 0 1 0 3.4 0a1.7 1.4 0 1 0-3.4 0M12.8 12a1.7 1.4 0 1 0 3.4 0a1.7 1.4 0 1 0-3.4 0",
  // An oval glass on a stand.
  mirror: "M4.5 8a4.5 6 0 1 0 9 0a4.5 6 0 1 0-9 0M7.2 5.2l-1.1 2.2M9.2 4 6.8 8.9M9 14v2.5M6.5 16.5h5",
  // A crack in the world, shards off it.
  rift: "M9.5 1.5 7 6.2l3.6 2.6L7.2 12.4 9.8 16.5M4.3 4.6 2.6 4M13.7 13.2l1.7.6M3.8 9.5H2M14.2 8.4H16",
  // Stars falling.
  sky: "M3.6 2.2 6.8 8.4M9.2 1.4l3.2 6.2M12.6 6.6l2.8 5.4M6.8 8.4h.01M12.4 7.6h.01M15.4 12h.01M2 16h14",
  // A wave rearing.
  tide: "M1.5 12.5c2.5 0 3.6-2.6 3.6-5.1A4 4 0 0 1 13 7.2c0 1.6-1.1 2.6-2.4 2.6-1 0-1.6-.7-1.6-1.5M1.5 15.8c1.5-.9 3-.9 4.5 0s3 .9 4.5 0 3-.9 4.5 0",
  // A signpost: the way home.
  signpost: "M9 16.5V2M9 3.8h5.4l1.6 1.6-1.6 1.6H9M9 9H3.6L2 10.6l1.6 1.6H9M6.5 16.5h5",
  // A table set with one candle.
  table: "M2 9h14M4 9v7.5M14 9v7.5M4 13h10M9 9V6.2M9 5c-.7-.6-.7-1.4 0-2.3.7.9.7 1.7 0 2.3z",
  // A hooded figure with a key.
  keeper: "M6.5 5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M4.5 16.5c0-5 2-8.5 4.5-8.5s4.5 3.5 4.5 8.5M15 3v13.5M15 3.5h1.5M15 5.5h1",
  // The question the road has not answered.
  unknown: "M6.2 6.7a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1v.7M9 14.3h.01",
  // A place with no glyph of its own.
  waypoint: "M9 16.5s-5-4.8-5-8.8a5 5 0 0 1 10 0c0 4-5 8.8-5 8.8zM7.4 7.7a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0",
  // The squad sets out under a flag.
  start: "M5 16.5V2.5M5 3.2h9l-2.2 3 2.2 3H5M3 16.5h4",
  // Home.
  home: "M2.5 9.2 9 3.3l6.5 5.9M4.5 7.6v8.9h9V7.6M7.5 16.5v-4h3v4",
  // A storm cloud.
  cloud: "M5.2 13.5h8.3a3.1 3.1 0 0 0 .3-6.2 4.6 4.6 0 0 0-8.8-.9 3.6 3.6 0 0 0 .2 7.1z",
  // The Watch.
  eye: "M1.5 9C3.5 5.5 6 4 9 4s5.5 1.5 7.5 5c-2 3.5-4.5 5-7.5 5S3.5 12.5 1.5 9zM6.7 9a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0",
  // A pylon's lattice.
  pylon: "M9 1.5 5.2 16.5M9 1.5l3.8 15M3 5h12M4.2 8.5h9.6M6.2 12.5h5.6M5.4 5l7.4 3.5M12.6 5 5.2 8.5M6.2 12.5l6.4-4M11.8 12.5l-6.4-4",
  // A cooling tower, steaming.
  tower: "M4 16.5c1.6-3.6 1.6-7.2 0-11.5h10c-1.6 4.3-1.6 7.9 0 11.5zM6.3 3c.5-.6.5-1.2 0-1.8M9 3.4c.6-.8.6-1.6 0-2.4M11.7 3c.5-.6.5-1.2 0-1.8",
  // A cairn: the league's landmark.
  cairn: "M3.8 15.2c0-1.2 2.3-2 5.2-2s5.2.8 5.2 2-2.3 1.5-5.2 1.5-5.2-.3-5.2-1.5zM5.4 11.2c0-1.1 1.6-1.9 3.6-1.9s3.6.8 3.6 1.9-1.6 1.6-3.6 1.6-3.6-.5-3.6-1.6zM6.8 7.4c0-1 1-1.7 2.2-1.7s2.2.7 2.2 1.7-1 1.4-2.2 1.4-2.2-.4-2.2-1.4zM9 4.4V1.8",
  // A horned helm: the league's boss.
  boss: "M4.5 9a4.5 4.5 0 0 1 9 0v3L12 13.5V16H6v-2.5L4.5 12zM7 10.4h.01M11 10.4h.01M5 6.2 2.4 3.2M13 6.2l2.6-3",
  // A ghost.
  ghost: "M4.5 16V8.5a4.5 4.5 0 0 1 9 0V16l-1.5-1.3L10.5 16 9 14.7 7.5 16 6 14.7zM7.2 8.4h.01M10.8 8.4h.01",
  // A ring of salt.
  salt: "M3 9a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9 1.5v1.2M9 15.3v1.2M1.5 9h1.2M15.3 9h1.2",
};

/** Every place key a road can draw, by family. */
export const PLACE_GLYPHS: Readonly<Record<string, MapGlyphName>> = {
  // Scouting Run
  riverbed: "water",
  orchard: "orchard",
  ferry: "boat",
  fair: "fair",
  // The Gilded Road
  toll: "bridge",
  gate: "gate",
  ledgers: "ledger",
  lanterns: "lantern",
  ball: "mask",
  stair: "stair",
  // Deep Raid
  reactor: "reactor",
  waterworks: "water",
  mast: "mast",
  ridge: "ridge",
  barricade: "barricade",
  pits: "kennel",
  // Legend Hunt
  shaft: "shaft",
  chapel: "chapel",
  furnaces: "furnace",
  checkpoint: "checkpoint",
  village: "village",
  belltower: "bell",
  vault: "vault",
  throne: "throne",
  sleeper: "sleeper",
  // Rescue
  camp: "camp",
  crossing: "boat",
  auction: "gavel",
  // Mythic route
  unmade: "void-road",
  stairwell: "hourglass",
  blackwater: "water",
  orrery: "orrery",
  hollow: "hollow",
  cathedral: "cathedral",
  eclipse: "eclipse",
  glassthrone: "throne-glass",
  farshore: "shore",
  lastdoor: "door",
  // Legendary route
  threshold: "threshold",
  stairs: "stair",
  doors: "doors",
  singing: "choir",
  choir: "choir",
  mirrors: "mirror",
  rift: "rift",
  sky: "sky",
  tide: "tide",
  home: "signpost",
  table: "table",
  keeper: "keeper",
};

/** The glyph for a place: its family's, `?` for a place the squad does not
 *  know (no key), the waypoint for a key with no family yet. */
export function glyphFor(key: string | null | undefined): MapGlyphName {
  if (!key) return "unknown";
  return Object.hasOwn(PLACE_GLYPHS, key) ? PLACE_GLYPHS[key] : "waypoint";
}

/**
 * One glyph, centred on (x, y) and drawn `size` units square. The stroke
 * is given in the chart's units and held there whatever the size, so a
 * 14-unit glyph and an 18-unit one carry the same line.
 */
export function MapGlyph({
  name,
  x,
  y,
  size = 18,
  stroke = 1.5,
  ...rest
}: { name: MapGlyphName; x: number; y: number; size?: number; stroke?: number } & Omit<SVGProps<SVGPathElement>, "d" | "x" | "y" | "stroke">) {
  const k = size / 18;
  return (
    <path
      d={GLYPH_PATHS[name]}
      transform={`translate(${round(x - size / 2)} ${round(y - size / 2)}) scale(${round(k, 1000)})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={round(stroke / k, 100)}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-glyph={name}
      {...rest}
    />
  );
}

function round(n: number, by = 10): number {
  return Math.round(n * by) / by;
}
