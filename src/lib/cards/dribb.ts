// The Dribb card — the five-copy chase print, as pure rules.
//
// Not a player. Dribb is the made-up 99 the rarities page uses as its
// specimen (src/lib/cards/samples.ts), minted for real five times and no
// more, in the Aether Rift treatment: a thin-film shimmer over the whole
// face, a colour-split echo of the art that slides against the base, and a
// slanted tear across the card where everything behind it is inverted.
//
// The gate (DRIBB_CHANCE, once per pack), the cap (DRIBB_COPIES) and the
// tier it files under (DRIBB_TIER) live in src/lib/packs/config.ts with
// the rest of the economy. This file owns what a copy IS and how it is
// drawn; the roller (src/lib/packs/open.ts) decides WHEN, against the
// database's count, and migration 20260929000001 is what makes five a
// fact: a partial unique index on the copy's number, a check that the
// number is 1..5, dust_card refusing it, launch_expedition keeping it off
// any route that can lose a card.
//
// A secret: no page lists it. Nothing here is imported by the rarities
// guide or the stats page, and it must stay that way.

import type { OverlayPreview } from "@/components/cards/PlayerCard3D";
import { DRIBB_CHANCE, DRIBB_COPIES } from "@/lib/packs/config";
import type { PlayerCardData } from "./build";
import { sampleCard } from "./samples";

export { DRIBB_CHANCE, DRIBB_COPIES, DRIBB_TIER } from "@/lib/packs/config";

/** The slug a Dribb copy is stored under. Never a real player's. */
export const DRIBB_SLUG = "dribb";

/** The look — the CSS utilities that draw it (globals.css, "The Dribb
 *  card"). The same layers the mockup page previewed; a minted copy turns
 *  them on through `card.dribb`, not through the admin-only prop.
 *
 *  The chip here is the SPECIMEN's: the mockup page and any preview that
 *  has no copy in hand. A minted copy reads its own number through
 *  dribbLook() — every copy printing "1 OF 5" would make the second one
 *  a lie on the one card whose whole point is which of the five it is. */
export const DRIBB_LOOK: OverlayPreview = {
  front: ["card-ov-dribb-aether", "card-ov-dribb-aether-rift"],
  artEcho: "card-ov-dribb-aberration-wide",
  chip: `DRIBB · 1 OF ${DRIBB_COPIES}`,
  accent: "#d27dff",
};

/** The look a given copy wears — the specimen's layers, stamped with that
 *  copy's own number. */
export function dribbLook(dribb: { number: number; of: number }): OverlayPreview {
  return { ...DRIBB_LOOK, chip: `DRIBB · ${dribb.number} OF ${dribb.of}` };
}

/** "1 of 5" — how a copy's number reads. */
export function dribbLabel(dribb: { number: number; of: number }): string {
  return `${dribb.number} of ${dribb.of}`;
}

/**
 * The copy, frozen: Dribb as the rarities page draws him, numbered. The
 * serial line prints "#00N/5" off serial and collectionSize, which is the
 * whole pitch on one line. `season` is the pack's, so the copy sits on
 * the shelf it was pulled into.
 */
export function dribbCard(number: number, season: string): PlayerCardData {
  return {
    ...sampleCard(),
    slug: DRIBB_SLUG,
    tag: "",
    season,
    serial: number,
    collectionSize: DRIBB_COPIES,
    motto: "Five, and no more.",
    dribb: { number, of: DRIBB_COPIES },
  };
}

/** One rand per PACK: whether this pack's last slot becomes the Dribb.
 *  Whether it mints is decided afterwards against the database (how many
 *  have been found), the half that cannot be pure. */
export function rollDribb(rand: () => number): boolean {
  return rand() < DRIBB_CHANCE;
}
