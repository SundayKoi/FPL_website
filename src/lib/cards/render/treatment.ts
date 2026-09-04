// What a copy's cosmetics LOOK like in a flat PNG render — the derivations
// the satori layout in cardImage.tsx reads, kept here as plain functions so
// they can be tested without a renderer.
//
// The live card in the browser gets its parallels from CSS: animated
// gradients, colour-dodge blends, a corona that swings with the pointer.
// None of that survives satori, which knows flexbox and little else. So a
// parallel that is a MOVING LIGHT on the site has to become a STATIC MARK
// in the picture: a named badge, a coloured frame, a hallmark. This module
// decides which marks a copy earns; cardImage.tsx only places them.
//
// The rules deliberately match PlayerCard3D's, because the same copy shown
// two ways that disagree is worse than either:
//
//   - Prisma is unlabelled. It is the base — every foil minted before
//     parallels existed IS one — and badging it would make an ordinary
//     foil read as a new thing.
//   - Eclipse does not take a name badge, it takes its serial. On a real
//     card the serial is what sells the rarity, and this one cannot be
//     beaten: 1 of 1.
//   - A matte copy wears nothing, whatever `foil_type` happens to hold.
//     The column is plain text with a check constraint, and rows exist
//     that carry a type without the flag; the flag is what mints a foil.

import type { CardTier } from "@/lib/cards/build";
import { validSignatureDataUrl } from "@/lib/cards/signing";
import { ECLIPSE_FOIL_TYPE, FOIL_TYPE_LABELS, foilTypeOf, type FoilType } from "@/lib/packs/config";
import { lineTreatmentFor } from "@/lib/cards/skinLines";

/** Frame colour per tier — the same eight the share render has always used. */
export const TIER_COLORS: Record<CardTier["key"], string> = {
  bronze: "#b08d57",
  silver: "#c0c9d2",
  gold: "#e6c14b",
  platinum: "#4fd0bf",
  emerald: "#3fdc7f",
  diamond: "#8fd3ff",
  master: "#c78fff",
  challenger: "#ffd166",
};

/**
 * The frame colour for a card whose tier key is not one of the eight.
 *
 * Not defensive padding: a ROSTER plate's tier key is "team" and a pulled
 * moment carries its own labels, and both are ordinary card_inventory rows
 * that this renderer must picture. Reading TIER_COLORS straight would hand
 * satori `6px solid undefined` and fail the whole render.
 */
export const DEFAULT_TINT = "#8fa3b8";

/** Page background and card panel of an ordinary print. */
export const GROUND = "#0b1420";
export const PANEL = "#101c2c";

/** Eclipse's own ground: the card is not a tier card with a film over it,
 *  it is a different object, so it takes the whole frame's palette. */
export const ECLIPSE_GROUND = "#07060c";
export const ECLIPSE_PANEL = "#0c0b16";
export const ECLIPSE_GOLD = "#e8c56a";

/** The accent each parallel is named in. Static stand-ins for moving
 *  light: the colour a viewer would remember that foil by. */
export const FOIL_ACCENTS: Record<FoilType, string> = {
  prisma: "#b7a4ff",
  aurora: "#7ef0c8",
  refractor: "#8fd3ff",
  ice: "#dff3ff",
  eclipse: ECLIPSE_GOLD,
};

/** The Eclipse hallmark, and the ribbon an inked copy wears. Uppercase
 *  because both are printed in a tracked-out uppercase style — the string
 *  carries the casing so a test can assert on exactly what prints. */
export const ECLIPSE_HALLMARK = "1 OF 1";
export const SIGNED_RIBBON = "SIGNED";

export interface TreatmentInput {
  /** `card.tier.key` — anything, including a key the ladder doesn't hold. */
  tierKey?: string | null;
  /** The flag, which is what mints a foil. */
  foil: boolean;
  /** `card_inventory.foil_type`, plain text, possibly unrecognised. */
  foilType: string | null;
  signed: boolean;
  /** The ink itself (a PNG data URI), or null. */
  autograph: string | null;
  /** The season the copy was minted in — which decides whether its
   *  parallel is drawn and named as a skin-line tier (SEASON_LINES). */
  season?: string | null;
}

export interface CardTreatment {
  /** The parallel this copy prints, or null on a matte card. */
  parallel: FoilType | null;
  eclipse: boolean;
  /** Tier colour, always resolvable. Bars and accents ride this. */
  tint: string;
  /** The frame the panel actually wears (gold on an Eclipse). */
  border: string;
  panel: string;
  ground: string;
  /** The parallel's colour — badge ink, ribbon, hallmark. */
  accent: string;
  /** Name badge text, or null when the copy earns none. */
  badge: string | null;
  /** "1 OF 1", on an Eclipse only. */
  hallmark: string | null;
  /** "SIGNED", on an autographed copy. */
  ribbon: string | null;
  /** The autograph to print over the art, or null. */
  ink: string | null;
}

/**
 * Everything the flat render needs to know about one copy's cosmetics.
 *
 * The ink is validated rather than trusted. satori fetches an `<img src>`
 * itself at render time with no onError to fall through, so a junk value in
 * `card.autograph` — a relative path, an http URL to something slow or
 * gone — does not degrade to a card without a signature, it fails the
 * whole image and the unfurl with it. Only the exact shape the signing flow
 * writes (`validSignatureDataUrl`, the same guard card_art_prefs' check
 * constraint enforces) is allowed near the renderer.
 *
 * The ribbon does not depend on the ink surviving that check: `signed` is
 * the column that says this copy came out autographed, and a copy whose ink
 * is missing or malformed is still a signed copy and should say so.
 */
export function cardTreatment(input: TreatmentInput): CardTreatment {
  const tint = TIER_COLORS[input.tierKey as CardTier["key"]] ?? DEFAULT_TINT;
  const parallel = input.foil ? foilTypeOf(input.foilType) : null;
  const eclipse = parallel === ECLIPSE_FOIL_TYPE;
  // Under a season line the parallel is a tier of that line, and it is
  // named at every tier — Standard included, because the line's name is
  // the season's mark and the whole point.
  const line = parallel && !eclipse ? lineTreatmentFor(input.season, parallel) : null;
  const accent = line ? line.accent : parallel ? FOIL_ACCENTS[parallel] : tint;
  const signed = input.signed || validSignatureDataUrl(input.autograph);
  return {
    parallel,
    eclipse,
    tint,
    border: eclipse ? ECLIPSE_GOLD : tint,
    panel: eclipse ? ECLIPSE_PANEL : PANEL,
    ground: eclipse ? ECLIPSE_GROUND : GROUND,
    accent,
    badge: line ? line.label : parallel && parallel !== "prisma" && !eclipse ? FOIL_TYPE_LABELS[parallel] : null,
    hallmark: eclipse ? ECLIPSE_HALLMARK : null,
    ribbon: signed ? SIGNED_RIBBON : null,
    ink: validSignatureDataUrl(input.autograph) ? input.autograph : null,
  };
}
