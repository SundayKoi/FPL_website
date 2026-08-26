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
}

export const PATRON_FLAMES = {
  ember: { label: "Ember", dash: "rgb(232 193 75 / 0.55)", hot: "#ffd989", core: "#ff6d5a" },
  gilded: { label: "Gilded", dash: "rgb(232 193 75 / 0.7)", hot: "#fff3c4", core: "#e8c14b" },
  frostfire: { label: "Frostfire", dash: "rgb(134 210 255 / 0.55)", hot: "#eaf7ff", core: "#35b5ff" },
  venom: { label: "Venom", dash: "rgb(127 240 176 / 0.55)", hot: "#eafff5", core: "#3fdc7f" },
  royal: { label: "Royal", dash: "rgb(201 165 255 / 0.55)", hot: "#f3eaff", core: "#9b6dff" },
  blood: { label: "Blood", dash: "rgb(255 130 130 / 0.55)", hot: "#ffd9d0", core: "#ff5063" },
} as const;

export type PatronFlameKey = keyof typeof PATRON_FLAMES;

export const PATRON_FLAME_KEYS = Object.keys(PATRON_FLAMES) as PatronFlameKey[];

export const DEFAULT_PATRON_FLAME: PatronFlameKey = "ember";

/** A stored preference narrowed to a real flame. Anything unrecognised —
 *  including the null a patron who never picked carries — burns Ember. */
export function patronFlameOf(value: string | null | undefined): PatronFlameKey {
  return (PATRON_FLAME_KEYS as readonly string[]).includes(value ?? "")
    ? (value as PatronFlameKey)
    : DEFAULT_PATRON_FLAME;
}
