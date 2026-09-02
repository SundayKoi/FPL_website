// Skin-line parallels — a PROPOSAL, previewed on the admin mockup page and
// minted by nothing.
//
// A patron's idea: the parallel ladder (Prisma → Aurora → Refractor →
// Cracked Ice) is hard to tell apart at a glance and says nothing about the
// game. League's skin lines do both jobs already — PROJECT is orange
// circuitry, Harrowing is green fog, Arcade is pixels and scanlines — and
// every player knows them. So instead of four abstract shines, each season
// mints its foils in one skin line, a new one every season, so a Season 5
// PROJECT card can only have come from Season 5 — and inside the line, four
// tiers on today's four rates, so a season's pulls are not all the same
// pull.
//
// Everything here is the design surface of that idea: the candidate lines,
// what each looks like, and where it would sit on the ladder. Each line
// owns ONE shape and no line owns a streak — Refractor has the diagonal
// rake already, and a line that sweeps a bar reads as another refractor.
// The CSS that draws each one lives in globals.css as
// `card-foil-line-<key>`, and the tier modifiers and layers as
// `card-foil-tier-<key>`; the odds and the frozen-copy
// rules do not change, because the rungs do not — a tier takes over a
// rung's weight, name and dust multiplier.

export interface SkinLine {
  key: string;
  /** What the card and the badge call it. */
  label: string;
  /** The League skin line it is drawn from. */
  skinLine: string;
  /** One line on what the light does — for the mockup page and for the
   *  Discord write-up when a season's set is announced. */
  look: string;
  /** The colour a viewer would remember it by: badge ink, and the accent
   *  the flat PNG render would use in place of moving light. */
  accent: string;
  /** How the light composites over the art. */
  blend: "screen" | "color-dodge";
  /** The utility that draws it — spelled out in full here, because
   *  Tailwind only emits a utility it can read verbatim in source, and a
   *  name built at runtime is one it cannot. */
  className: string;
}

/** The six candidates the patron named, drawn. */
export const SKIN_LINES: SkinLine[] = [
  {
    key: "project",
    className: "card-foil-line-project",
    label: "PROJECT",
    skinLine: "PROJECT",
    look: "An orthogonal circuit grid with nodes at the crossings, and one thin visor slit of hot light across the eyes.",
    accent: "#ff7a1a",
    blend: "screen",
  },
  {
    key: "harrowing",
    className: "card-foil-line-harrowing",
    label: "Harrowing",
    skinLine: "Harrowing (Halloween)",
    look: "A crescent moon top-right with a green halo, violet fog drifting under it.",
    accent: "#9df64a",
    blend: "screen",
  },
  {
    key: "academy",
    className: "card-foil-line-academy",
    label: "Academy",
    skinLine: "Battle Academia",
    look: "Gilded page corners top-left and bottom-right, a crimson wax seal, a parchment wash.",
    accent: "#f4d27a",
    blend: "screen",
  },
  {
    key: "arcade",
    className: "card-foil-line-arcade",
    label: "Arcade",
    skinLine: "Arcade",
    look: "An 8-bit mosaic of coarse pixels under CRT scanlines, one raster band walking down the screen.",
    accent: "#ff3cac",
    blend: "screen",
  },
  {
    key: "arcana",
    className: "card-foil-line-arcana",
    label: "Arcana",
    skinLine: "Arcana",
    look: "A gold sunburst turning slowly inside a fixed ring on indigo night — a tarot card that moves.",
    accent: "#e5c26b",
    blend: "screen",
  },
  {
    key: "battlecast",
    className: "card-foil-line-battlecast",
    label: "Battlecast",
    skinLine: "Battlecast",
    look: "A targeting reticle over the face — two rings and a crosshair — brushed steel, a hazard strip along the foot.",
    accent: "#ff2a2a",
    blend: "color-dodge",
  },
];

/** The recommended shape: ONE line a season, and four tiers inside it on
 *  the four rates the ladder already has. Eclipse stays above everything;
 *  it is not a tier of anything and does not rotate. */
export interface SeasonSet {
  season: string;
  /** The line every foil that season is drawn in. */
  line: SkinLine["key"];
}

/** A worked example for the mockup page — Season 5 as it might look. */
export const EXAMPLE_SEASON_SET: SeasonSet = { season: "S5", line: "project" };

export function skinLineByKey(key: string): SkinLine | undefined {
  return SKIN_LINES.find((line) => line.key === key);
}

/**
 * The four tiers inside one season's line, on today's four rates.
 *
 * One line a season with a single look would make every foil that season
 * the same pull, which is the boredom the ladder exists to prevent. So the
 * line is the motif and the tier is how much of it you got: Standard is
 * the line as drawn; Chroma, Prestige and Ultimate are League's own words
 * for "more of the same skin, rarer", laid over it. Each tier sits on the
 * rung — and the weight, and the dust multiplier — of the parallel it
 * replaces, so nothing about the odds moves.
 */
export type LineTierKey = "standard" | "chroma" | "prestige" | "ultimate";

export interface LineTier {
  key: LineTierKey;
  /** Empty on Standard: the base tier wears the line's name alone, as
   *  Prisma wears no badge today. */
  label: string;
  /** Today's parallel whose rung, weight and dust multiplier it takes. */
  replaces: "prisma" | "aurora" | "refractor" | "ice";
  /** A class set ON the line's own layer: it restates the line's colours
   *  (or, for Ultimate, its intensity) without adding a shape. */
  modifier: string;
  /** Sibling layers over the line: the sheen, the frame, the embers. */
  layers: string[];
  /** What the tier does to the line, in one line — for the mockup page. */
  does: string;
}

/** A tier never adds a shape. It restates the line's own shape in a richer
 *  material, the way League's own tiers do: Chroma recolours it, Prestige
 *  gilds it, Ultimate sets it alight. */
export const LINE_TIERS: LineTier[] = [
  {
    key: "standard",
    label: "",
    replaces: "prisma",
    modifier: "",
    layers: [],
    does: "The line as drawn, in its own colours.",
  },
  {
    key: "chroma",
    label: "Chroma",
    replaces: "aurora",
    modifier: "card-foil-tier-chroma",
    layers: ["card-foil-tier-chroma-sheen"],
    does: "The same shape in the line's chroma palette, an iridescent sheen turning over it.",
  },
  {
    key: "prestige",
    label: "Prestige",
    replaces: "refractor",
    modifier: "card-foil-tier-prestige",
    layers: ["card-foil-tier-prestige-frame"],
    does: "The same shape gilded — every colour becomes gold — inside a gold frame.",
  },
  {
    key: "ultimate",
    label: "Ultimate",
    replaces: "ice",
    modifier: "card-foil-tier-ultimate",
    layers: ["card-foil-tier-ultimate-embers"],
    does: "The same shape at full saturation, embers of its own accent rising, the frame lit.",
  },
];

/** What the badge says for a line at a tier — "PROJECT", then "PROJECT
 *  Chroma", "PROJECT Prestige", "PROJECT Ultimate". */
export function lineTierLabel(line: SkinLine, tier: LineTier): string {
  return tier.label ? `${line.label} ${tier.label}` : line.label;
}
