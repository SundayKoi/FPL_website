// Skin-line parallels — a PROPOSAL, previewed on the admin mockup page and
// minted by nothing.
//
// A patron's idea: the parallel ladder (Prisma → Aurora → Refractor →
// Cracked Ice) is hard to tell apart at a glance and says nothing about the
// game. League's skin lines do both jobs already — PROJECT is orange
// circuitry, Harrowing is green fog, Arcade is pixels and scanlines — and
// every player knows them. So instead of four abstract shines, each season
// mints three parallels named for skin lines, new ones every season, so a
// Season 5 PROJECT card can only have come from Season 5.
//
// Everything here is the design surface of that idea: the candidate lines,
// what each looks like, and where it would sit on the ladder. The CSS that
// draws each one lives in globals.css as `card-foil-line-<key>`; the odds
// and the frozen-copy rules do not change, because the rungs do not — a
// line takes over a rung's weight, name and dust multiplier.

export type LadderRung = "aurora" | "refractor" | "ice";

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
    look: "Orange circuit traces on black glass, one hot bar of light that rakes with the pointer.",
    accent: "#ff7a1a",
    blend: "screen",
  },
  {
    key: "harrowing",
    className: "card-foil-line-harrowing",
    label: "Harrowing",
    skinLine: "Harrowing (Halloween)",
    look: "Violet fog and drifting green wisps, a lantern glow that breathes at the edges.",
    accent: "#9df64a",
    blend: "screen",
  },
  {
    key: "academy",
    className: "card-foil-line-academy",
    label: "Academy",
    skinLine: "Battle Academia",
    look: "Warm parchment wash, ruled gold lines, a crest of light in the top corner.",
    accent: "#f4d27a",
    blend: "screen",
  },
  {
    key: "arcade",
    className: "card-foil-line-arcade",
    label: "Arcade",
    skinLine: "Arcade",
    look: "CRT scanlines, a pixel grid, magenta and cyan split like a bad cabinet signal.",
    accent: "#ff3cac",
    blend: "screen",
  },
  {
    key: "arcana",
    className: "card-foil-line-arcana",
    label: "Arcana",
    skinLine: "Arcana",
    look: "Indigo night, gold sigils and a slow-turning sunburst — a tarot card that moves.",
    accent: "#e5c26b",
    blend: "screen",
  },
  {
    key: "battlecast",
    className: "card-foil-line-battlecast",
    label: "Battlecast",
    skinLine: "Battlecast",
    look: "Brushed steel, hazard chevrons, a red targeting sweep that locks on with the tilt.",
    accent: "#ff2a2a",
    blend: "color-dodge",
  },
];

/** The recommended shape: three lines a season on the three rungs above
 *  the base. Prisma stays the base and Eclipse stays above everything;
 *  neither is a skin line and neither rotates. */
export interface SeasonSet {
  season: string;
  /** Which line takes which rung, rarest last. */
  rungs: Record<LadderRung, SkinLine["key"]>;
}

/** A worked example for the mockup page — Season 5 as it might look. The
 *  order is by how loud the treatment is: the rarest rung gets the one you
 *  cannot mistake for anything else. */
export const EXAMPLE_SEASON_SET: SeasonSet = {
  season: "S5",
  rungs: { aurora: "academy", refractor: "project", ice: "battlecast" },
};

export const RUNG_LABELS: Record<LadderRung, string> = {
  aurora: "2nd rung · replaces Aurora",
  refractor: "3rd rung · replaces Refractor",
  ice: "top rung · replaces Cracked Ice",
};

export function skinLineByKey(key: string): SkinLine | undefined {
  return SKIN_LINES.find((line) => line.key === key);
}
