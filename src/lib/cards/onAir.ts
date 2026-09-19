// The On Air card — the casters' print, as pure rules.
//
// Not a player and not the Dribb. The league's two stream casters — the
// profiles an owner has marked `is_broadcaster` on /admin — each get a
// card of their own, a 100 in every column, in a broadcast treatment
// nothing else on the board wears: SMPTE colour bars bleeding in from the
// right of the photo block, a lit ON AIR lamp under the tier row, an audio
// waveform along the foot and a blinking REC dot. A caster who has set no
// champion prints the colour-bar TEST PATTERN where the art would be —
// no signal, and that is the feature, not a fallback.
//
// The gate (ON_AIR_CHANCE, once per pack), the cap (ON_AIR_COPIES, per
// caster per season) and the tier it files under (ON_AIR_TIER) live in
// src/lib/packs/config.ts with the rest of the economy. This file owns
// what a copy IS and how it is drawn; the roller (src/lib/packs/open.ts)
// decides WHEN — only while a Live Drops window is open, and only if the
// Dribb did not already take the pack's last slot — against the database's
// per-caster count, and migration 20261020000001 is what makes
// twenty-five a fact: a check that the number is 1..25 and a partial
// unique index on (season, caster, number), with dust_card refusing it and
// launch_expedition keeping it off any route that can lose it.
//
// NOT a secret, unlike the Dribb: /cards/rarities lists it, the shop's
// live notice mentions it and the go-live announcement names the odds.
// Being in the room while the games run is the whole scarcity.

import type { OverlayPreview } from "@/components/cards/PlayerCard3D";
import { ON_AIR_CHANCE, ON_AIR_COPIES } from "@/lib/packs/config";
import type { PlayerCardData } from "./build";

export { ON_AIR_CHANCE, ON_AIR_COPIES, ON_AIR_TIER } from "@/lib/packs/config";

/** One caster's card settings — a broadcaster profile joined to its row in
 *  `on_air_casters`. A broadcaster with no row is in the pool with these
 *  defaults; `champion: null` is the no-signal print. */
export interface OnAirCaster {
  profileId: string;          // profiles.id
  name: string;               // profiles.display_name
  champion: string | null;    // on_air_casters.champion (null = no signal)
  skin: number;               // on_air_casters.skin
  roleLabel: string;          // on_air_casters.role_label, default "Caster"
  tagline: string | null;     // on_air_casters.tagline → the card's motto
}

/** The stamp a minted copy carries: which caster, which of their prints
 *  this season, and the window it was pulled in. */
export interface OnAirMark {
  profileId: string;
  name: string;
  number: number;
  of: number;
  window: string;
}

/** The lamp's red. Every layer reads it through `--ov-accent`, and the
 *  stamp's coin wears it too, so the card and its coin can never drift. */
export const ON_AIR_ACCENT = "#ff3b3b";

/** The house specimen: a made-up caster on Bard, for the rarities page
 *  (src/lib/cards/samples.ts) and the admin desk's look preview. Dribb is
 *  the league's stand-in face everywhere a card has to be drawn without
 *  naming a real person, and a caster is no exception. */
export const ON_AIR_SPECIMEN: OnAirCaster = {
  profileId: "specimen",
  name: "Dribb",
  champion: "Bard",
  skin: 0,
  roleLabel: "Play-by-play",
  tagline: "Chimes on the three, every time.",
};

/** The slug a copy is stored under. Prefixed, and never a player's: a
 *  caster who also plays in the league has a card of their own, and the
 *  two must not collide on the shelf or in a trade. */
export function onAirSlug(caster: Pick<OnAirCaster, "name">): string {
  const name = caster.name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `on-air-${name}`;
}

/** "3 of 25" — how a copy's number reads. */
export function onAirLabel(mark: Pick<OnAirMark, "number" | "of">): string {
  return `${mark.number} of ${mark.of}`;
}

/** The look — the CSS utilities that draw it (globals.css, "The On Air
 *  card"). The chip here is the SPECIMEN's; a minted copy reads its own
 *  caster and number through onAirLook(). */
export const ON_AIR_LOOK: OverlayPreview = {
  front: ["card-ov-onair-bars", "card-ov-onair-lamp", "card-ov-onair-wave", "card-ov-onair-rec"],
  chip: "ON AIR",
  accent: ON_AIR_ACCENT,
};

/** The look a given copy wears: the specimen's layers, stamped with the
 *  caster's name and this copy's number — and, when the caster set no
 *  champion, the full test pattern UNDER the rest, because there is no art
 *  for the bars to bleed over. */
export function onAirLook(mark: OnAirMark, hasArt: boolean): OverlayPreview {
  return {
    ...ON_AIR_LOOK,
    front: hasArt ? ON_AIR_LOOK.front : ["card-ov-onair-nosignal", ...ON_AIR_LOOK.front],
    chip: `ON AIR · ${mark.name.toUpperCase()} · ${mark.number} OF ${mark.of}`,
  };
}

/**
 * The copy, frozen: the caster as the card prints them, numbered. A 100 in
 * every column — the Dribb is the 99, and the casters are the only 100s on
 * the board. `season` is the pack's, because the twenty-five are counted
 * per season; `window` is the Live Drops label the pack was opened under,
 * and it is stamped here as the copy's LIVE mark too — the slot is
 * REPLACED after the roller stamps the others, so nothing else would.
 */
export function onAirCard(caster: OnAirCaster, number: number, season: string, window: string): PlayerCardData {
  return {
    slug: onAirSlug(caster),
    name: caster.name,
    tag: "ON AIR",
    teamName: null,
    teamImageUrl: null,
    teamAbbr: null,
    role: caster.roleLabel,
    overall: 100,
    // A placeholder exactly as the Dribb's is: the inventory tier column
    // (ON_AIR_TIER) is what prices and sorts a copy, and this wrapper only
    // decides which frame the renderer draws.
    tier: { key: "challenger", label: "Challenger" },
    archetype: "On Air",
    signature: caster.champion ? { champion: caster.champion, games: 100 } : null,
    artSkin: caster.skin,
    motto: caster.tagline ?? "We'll be right back after these messages.",
    serial: number,
    collectionSize: ON_AIR_COPIES,
    topChampions: caster.champion ? [{ champion: caster.champion, games: 100, wins: 100 }] : [],
    form: [true, true, true, true, true],
    subStats: [
      { key: "mic", label: "Mic", value: 100 },
      { key: "hype", label: "Hype", value: 100 },
      { key: "reads", label: "Reads", value: 100 },
      { key: "calls", label: "Calls", value: 100 },
      { key: "signal", label: "Signal", value: 100 },
    ],
    highlights: [{ label: "On the desk", value: window, detail: "Printed while the stream was live" }],
    badges: [{ key: "onair", label: "On Air", detail: "Only prints while a Live Drops window is open" }],
    standout: false,
    wins: 100,
    losses: 0,
    winratePct: 100,
    level: 100,
    pentas: 100,
    season,
    live: { label: window },
    onAir: { profileId: caster.profileId, name: caster.name, number, of: ON_AIR_COPIES, window },
  };
}

/** One rand per PACK: whether this pack's last slot becomes an On Air
 *  print. The window is the gate in front of this one — the roller only
 *  calls it while a Live Drops window is open — and WHICH caster, and
 *  whether any can still print, is decided afterwards against the
 *  database, the half that cannot be pure. */
export function rollOnAir(rand: () => number): boolean {
  return rand() < ON_AIR_CHANCE;
}

/** The caster to print: fewest copies this season; a tie goes to rand().
 *  Skips casters at the cap. null when none can print. */
export function pickOnAirCaster(
  casters: OnAirCaster[],
  found: Record<string, number>,
  rand: () => number,
): OnAirCaster | null {
  const open = casters.filter((caster) => (found[caster.profileId] ?? 0) < ON_AIR_COPIES);
  if (open.length === 0) return null;
  const fewest = Math.min(...open.map((caster) => found[caster.profileId] ?? 0));
  const tied = open.filter((caster) => (found[caster.profileId] ?? 0) === fewest);
  // One rand, and only when it decides something: a single candidate is
  // not a draw, and spending randomness on it would move every roll after.
  if (tied.length === 1) return tied[0];
  return tied[Math.min(Math.floor(rand() * tied.length), tied.length - 1)];
}
