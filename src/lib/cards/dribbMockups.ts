// PROPOSAL. The Dribb card — a five-copy chase print that is not a player:
// Dribb, a 99 in every column, on Bard, drawn in a treatment nothing else
// on the board wears. Four looks, as mockups on /admin/dribb and nowhere
// else, through PlayerCard3D's `overlay` prop (the same road every overlay
// proposal takes). Nothing here mints; no minted copy can reach these
// classes. When one ships it gets a real source of truth — a `dribb`
// stamp on the copy, a global counter capped at five, a gate in the
// roller — and this entry becomes the treatment that stamp turns on.

import type { OverlayMockup } from "./overlayMockups";
import { PACK_SIZE } from "@/lib/packs/config";

/** How many will ever exist. */
export const DRIBB_COPIES = 5;

/** The two rates on the table, per CARD (one roll per slot, like Secret). */
export const DRIBB_RATES = [1 / 5000, 1 / 10000] as const;

export interface DribbLook extends Pick<OverlayMockup, "key" | "title" | "blurb" | "accent" | "front" | "chip" | "artEcho" | "back"> {
  /** What the light is doing, for the caption. */
  motion: string;
}

export const DRIBB_LOOKS: DribbLook[] = [
  {
    key: "celestial",
    title: "Celestial",
    blurb:
      "Bard's own sky. A star field drifts behind the art, a gold halo turns behind the rating, and the whole face is washed the deep blue of the Caretaker's cloak.",
    motion: "The stars drift on their own; the halo turns; the wash deepens toward the edges.",
    accent: "#ffd98a",
    front: ["card-ov-dribb-celestial", "card-ov-dribb-halo"],
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "kintsugi",
    title: "Kintsugi",
    blurb:
      "Black glass, cracked and mended with gold. The seams glow as the card tilts toward the light, and the rim is a solid band of leaf.",
    motion: "Tilt it: the gold in the cracks brightens where the pointer is and fades where it is not.",
    accent: "#f3d37a",
    front: ["card-ov-dribb-kintsugi"],
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "aether",
    title: "Aether",
    blurb:
      "An oil-slick shimmer over the whole face and a second, colour-split copy of the art that slides against the first — the card looks like it is not quite in this dimension.",
    motion: "The shimmer cycles through the spectrum on its own; the split art answers the pointer.",
    accent: "#c9a6ff",
    front: ["card-ov-dribb-aether"],
    artEcho: "card-ov-dribb-aberration",
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "corona",
    title: "Corona",
    blurb:
      "A solar flare runs around the border without stopping, the rim burns white-hot, and embers rise off the bottom edge. The loudest thing the site has ever printed.",
    motion: "The flare orbits; the embers climb; the rim pulses.",
    accent: "#ffb347",
    front: ["card-ov-dribb-corona", "card-ov-dribb-embers"],
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
];

/**
 * Aether, pushed further. Each keeps the thin-film shimmer and the
 * colour-split echo, and adds one thing the base look does not do.
 */
export const AETHER_VARIANTS: DribbLook[] = [
  {
    key: "aether-prism",
    title: "Aether · Prism",
    blurb: "The shimmer, plus a rainbow ring that orbits the border and a bar of white light that leaks across the face every few seconds.",
    motion: "The ring turns; the light leak crosses left to right and repeats.",
    accent: "#e6b8ff",
    front: ["card-ov-dribb-aether", "card-ov-dribb-aether-ring", "card-ov-dribb-aether-leak"],
    artEcho: "card-ov-dribb-aberration",
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "aether-rift",
    title: "Aether · Rift",
    blurb: "A tear runs across the card and everything inside it is inverted — the art, the name, the light — as if a strip of another dimension shows through.",
    motion: "The tear's edges glow and drift; the split art slides harder against the base.",
    accent: "#d27dff",
    front: ["card-ov-dribb-aether", "card-ov-dribb-aether-rift"],
    artEcho: "card-ov-dribb-aberration-wide",
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "aether-nebula",
    title: "Aether · Nebula",
    blurb: "Violet and teal clouds drift under the shimmer with a field of faint stars — the oil slick becomes deep space.",
    motion: "The clouds roll slowly in opposite directions; the stars hold still.",
    accent: "#b28cff",
    front: ["card-ov-dribb-aether-nebula", "card-ov-dribb-aether"],
    artEcho: "card-ov-dribb-aberration",
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
  {
    key: "aether-glass",
    title: "Aether · Glass",
    blurb: "The shimmer sealed under a pane of glass: a specular highlight follows the pointer, caustic lines sweep across, and the edge catches the light like a bevel.",
    motion: "The highlight tracks your pointer; the caustics crawl on their own.",
    accent: "#dff3ff",
    front: ["card-ov-dribb-aether", "card-ov-dribb-aether-glass"],
    artEcho: "card-ov-dribb-aberration",
    chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  },
];

/** The odds, in words a reader keeps: one Dribb per how many packs. */
export function dribbPacksPerPull(rate: number): number {
  return Math.round(1 / (rate * PACK_SIZE));
}
