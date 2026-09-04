// Skin-line parallels — one League skin line a season, drawn over the
// parallel ladder.
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
// what each looks like, where each sits on the ladder — and SEASON_LINES,
// which says which line a season's foils are drawn in. The storage never
// changed: a copy still carries prisma/aurora/refractor/ice in
// `foil_type`, the roller still walks the ladder, dust still reads the
// ladder's multipliers. A season with a line simply DRAWS and NAMES each
// rung as that line's tier (prisma → Standard, aurora → Chroma, refractor
// → Prestige, ice → Ultimate), so a Season 5 Chroma is an Aurora that
// says Battlecast, everywhere it shows. Eclipse is not a tier of anything
// and never rotates. Each line
// owns ONE shape and no line owns a streak — Refractor has the diagonal
// rake already, and a line that sweeps a bar reads as another refractor.
// PROJECT owns the glitch (scanlines, tears, a raster band) and Arcade owns
// the pixels and the rainbow; they were the other way round once and read
// as one line in two colours.
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
    look: "A glitching hologram: scanlines, a raster band, signal tears that jitter, a visor slit across the eyes, and the edge of the card lit orange from inside.",
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
    look: "An 8-bit mosaic of coarse pixels over a rainbow that rolls across the card.",
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

/** The set the mockup page works through: the live season's own line, so
 *  the "today, then this season" row on that page is what the shop shows. */
export const EXAMPLE_SEASON_SET: SeasonSet = { season: "S5", line: "battlecast" };

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

// === The season's line ======================================================

/** Which skin line each season's foils are drawn in. A season not listed
 *  draws the ladder as itself (Prisma, Aurora, Refractor, Cracked Ice).
 *  Keyed by league_settings.current_season / academy_season. */
export const SEASON_LINES: Record<string, SkinLine["key"]> = {
  S5: "battlecast",
};

/** The line a season's foils wear, or null for the plain ladder. */
export function seasonLineOf(season: string | null | undefined): SkinLine | null {
  const key = season ? SEASON_LINES[season] : undefined;
  return key ? (skinLineByKey(key) ?? null) : null;
}

/** The tier a ladder parallel sits on inside a line. Eclipse and anything
 *  unrecognised map to nothing: they are not tiers of a line. */
export function lineTierOf(foilType: string | null | undefined): LineTier | null {
  return LINE_TIERS.find((tier) => tier.replaces === foilType) ?? null;
}

/** What a copy's parallel is called, given the season it was minted in:
 *  the line's tier where the season has a line, the ladder's own name
 *  everywhere else. Eclipse is Eclipse. */
export function parallelLabelFor(
  season: string | null | undefined,
  foilType: string | null | undefined,
  ladderLabel: string,
): string {
  const line = seasonLineOf(season);
  const tier = line ? lineTierOf(foilType) : null;
  return line && tier ? lineTierLabel(line, tier) : ladderLabel;
}

/** What PlayerCard3D draws for a copy under a season line — the same shape
 *  the mockup pages pass as `preview`, so the card needs no second path. */
export interface LineTreatment {
  label: string;
  className: string;
  modifier: string;
  blend: SkinLine["blend"];
  accent: string;
  layers: string[];
  /** The tier, for anything that keys off it (the flat render's badge). */
  tier: LineTierKey;
}

export function lineTreatmentFor(season: string | null | undefined, foilType: string | null | undefined): LineTreatment | null {
  const line = seasonLineOf(season);
  const tier = line ? lineTierOf(foilType) : null;
  if (!line || !tier) return null;
  return {
    label: lineTierLabel(line, tier),
    className: line.className,
    modifier: tier.modifier,
    blend: line.blend,
    accent: line.accent,
    layers: tier.layers,
    tier: tier.key,
  };
}
