// The Patron Flame's wardrobe.
//
// Patrons pick the colour their flame burns — the customisation half of
// patronage. A curated set rather than a free colour wheel, for the same
// reason the site has a palette at all: every option here is tuned to stay
// legible on navy and to stay VISUALLY DISTINCT from the tier frames, so a
// flame can never read as a rating. The flame's shape (dashed ring + comet)
// does most of that work; the palette does the rest.
//
// Client-safe on purpose: the card renderer needs these colours in the
// browser, and there is nothing secret about a paint chip.

export interface PatronFlameStyle {
  label: string;
  /** The dashed ring. Translucent, so the card edge shows through. */
  dash: string;
  /** The comet's white-hot centre. */
  hot: string;
  /** The comet's trailing colour and glow. */
  core: string;
  /** "embers": drifting sparks rise inside the ring, tinted by the
   *  flame's own palette (the champions-card technique, scaled down). */
  effect?: "embers";
  /** Total days of patronage required to wear it. The wardrobe shows the
   *  flame locked until then; setPatronFlameAction enforces it. */
  tenureDays?: number;
}

/** Six months of patronage, in granted days — what unlocks Sovereign. */
export const SOVEREIGN_TENURE_DAYS = 180;

export type PatronFlameKey =
  | "ember"
  | "gilded"
  | "frostfire"
  | "venom"
  | "royal"
  | "blood"
  | "emberdrift"
  | "crackedice"
  | "sovereign";

export const PATRON_FLAMES: Record<PatronFlameKey, PatronFlameStyle> = {
  ember: { label: "Ember", dash: "rgb(232 193 75 / 0.55)", hot: "#ffd989", core: "#ff6d5a" },
  gilded: { label: "Gilded", dash: "rgb(232 193 75 / 0.7)", hot: "#fff3c4", core: "#e8c14b" },
  frostfire: { label: "Frostfire", dash: "rgb(134 210 255 / 0.55)", hot: "#eaf7ff", core: "#35b5ff" },
  venom: { label: "Venom", dash: "rgb(127 240 176 / 0.55)", hot: "#eafff5", core: "#3fdc7f" },
  royal: { label: "Royal", dash: "rgb(201 165 255 / 0.55)", hot: "#f3eaff", core: "#9b6dff" },
  blood: { label: "Blood", dash: "rgb(255 130 130 / 0.55)", hot: "#ffd9d0", core: "#ff5063" },
  // The 2026-08 wardrobe expansion. Ember Drift carries rising sparks;
  // Cracked Ice is the near-white glitter of the top foil parallel.
  emberdrift: { label: "Ember Drift", dash: "rgb(255 140 90 / 0.6)", hot: "#ffe1b0", core: "#ff7a3d", effect: "embers" },
  crackedice: { label: "Cracked Ice", dash: "rgb(220 245 255 / 0.6)", hot: "#ffffff", core: "#a8e6ff" },
  // The tenure flame: gold that burns, for six months of patronage.
  sovereign: {
    label: "Sovereign",
    dash: "rgb(255 214 120 / 0.75)",
    hot: "#fff7dc",
    core: "#f0b93c",
    effect: "embers",
    tenureDays: SOVEREIGN_TENURE_DAYS,
  },
};

export const PATRON_FLAME_KEYS = Object.keys(PATRON_FLAMES) as PatronFlameKey[];

export const DEFAULT_PATRON_FLAME: PatronFlameKey = "ember";

/** Whether a patronage window is still open — the one check every flame
 *  surface makes, kept here (reads the wall clock) so server components
 *  call it instead of Date.now() in render. */
export function patronActive(until: string | null | undefined): boolean {
  return Boolean(until && new Date(until).getTime() > Date.now());
}

/** Whether `tenureDays` of granted patronage unlocks the flame. Most of
 *  the wardrobe has no gate; Sovereign asks for six months. */
export function flameUnlocked(key: PatronFlameKey, tenureDays: number): boolean {
  return tenureDays >= (PATRON_FLAMES[key].tenureDays ?? 0);
}

/** A stored preference narrowed to a real flame. Anything unrecognised —
 *  including the null a patron who never picked carries — burns Ember. */
export function patronFlameOf(value: string | null | undefined): PatronFlameKey {
  return (PATRON_FLAME_KEYS as readonly string[]).includes(value ?? "")
    ? (value as PatronFlameKey)
    : DEFAULT_PATRON_FLAME;
}
