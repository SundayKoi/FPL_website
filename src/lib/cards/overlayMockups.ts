// PROPOSAL. Card overlays beyond the foil ladder, as mockups: each entry
// is a set of CSS layers PlayerCard3D draws over (or behind) a real card
// on /admin/overlays and nowhere else. Nothing here mints; a minted copy
// cannot reach these classes. If one ships, it gets a real source of
// truth (a column, a trigger, a provenance row) and this entry becomes
// the treatment that source turns on.

export interface OverlayMockup {
  key: string;
  title: string;
  /** What it looks like, in one line. */
  blurb: string;
  /** How a card would come to wear it. */
  earn: string;
  /** Which family of effect, for the page's grouping. */
  group: "tilt" | "data" | "reactive" | "chase";
  accent: string;
  /** Layers drawn over the front, above the foil. */
  front: string[];
  /** Layers drawn over the back. */
  back?: string[];
  /** A chip in the corner, like a mutation's. */
  chip?: string;
  /** Draws a second copy of the art that answers the pointer. */
  artEcho?: string;
  /** Animates the autograph so it writes itself. */
  ink?: boolean;
  /** Best seen on a foil. */
  foil?: boolean;
}

export const OVERLAY_MOCKUPS: OverlayMockup[] = [
  {
    key: "holo_stamp",
    title: "Hologram stamp",
    blurb: "A holographic seal in the corner that runs through rainbow bands as the card tilts — the sticker on a real trading card.",
    earn: "Every foil, in place of the plain badge. Cheapest wow on the list.",
    group: "tilt",
    accent: "#9be7ff",
    front: ["card-ov-holo-stamp"],
    foil: true,
  },
  {
    key: "parallax_deep",
    title: "Layered parallax",
    blurb: "The character lifts off the backdrop and moves against it as you tilt — depth, not a flat splash.",
    earn: "Eclipses and record cards. Needs the art cut into layers per champion; this mockup fakes it with a masked echo of the same art.",
    group: "tilt",
    accent: "#ffffff",
    front: [],
    artEcho: "card-ov-parallax-deep",
    foil: true,
  },
  {
    key: "constellation",
    title: "Constellation back",
    blurb: "The ten stat bars mapped as stars on the back, joined into a shape only this player makes. Click the card to flip it.",
    earn: "Every card. A carry and a support draw visibly different skies.",
    group: "tilt",
    accent: "#c9d8ff",
    front: [],
    back: ["card-ov-constellation"],
  },
  {
    key: "heat_foil",
    title: "Momentum heat foil",
    blurb: "The game's gold line as a heat gradient: cold at the top, burning at the bottom — a comeback you can see from across the room.",
    earn: "Moment cards, from the gold series the ingest already keeps for that game.",
    group: "data",
    accent: "#ff6a3d",
    front: ["card-ov-heat"],
    foil: true,
  },
  {
    key: "record_corona",
    title: "Record corona",
    blurb: "A living record card's ring: the record counts up on first view, a 'held since' line, and the ring cracks the moment the record falls.",
    earn: "One per stat, league-wide, moving to whoever breaks it.",
    group: "data",
    accent: "#f5b62e",
    front: ["card-ov-corona"],
    chip: "RECORD · 9 SOLO KILLS · SINCE WK 3",
  },
  {
    key: "ink_write",
    title: "Ink that writes itself",
    blurb: "The autograph draws on stroke by stroke, then holds. People will hover it twenty times.",
    earn: "Every signed copy. The mockup borrows a signature — the real one is the player's own ink.",
    group: "data",
    accent: "#ffffff",
    front: [],
    ink: true,
  },
  {
    key: "ghost_double",
    title: "Ghost double",
    blurb: "A faint second image offset behind the card — the shape of the run it stood in as someone's Gauntlet ghost.",
    earn: "A card fielded in a run that defended in next week's bracket. One echo per week it stood.",
    group: "data",
    accent: "#a9b7d6",
    front: [],
    artEcho: "card-ov-ghost",
  },
  {
    key: "provenance",
    title: "Provenance watermark",
    blurb: "Prior owners' initials tiled faintly around the border, like passport stamps. A card that has travelled looks it.",
    earn: "Any copy with two or more owners in its provenance chain.",
    group: "data",
    accent: "#d8c8a8",
    front: ["card-ov-provenance"],
  },
  {
    key: "matchday",
    title: "Match-day glow",
    blurb: "A pulsing border in the team's colour while that team is playing. Look at the shelf and see who is on stage right now.",
    earn: "Every card of a team during its live game, from the fixture list.",
    group: "reactive",
    accent: "#2ee6a8",
    front: ["card-ov-matchday"],
  },
  {
    key: "spree",
    title: "Live spree",
    blurb: "Flame licks up the edge while the player is on a killing spree in a live game, growing with the spree.",
    earn: "During a live game, from the live ingest the live drops already use.",
    group: "reactive",
    accent: "#ff7a3d",
    front: ["card-ov-spree"],
    chip: "LIVE · SPREE 5",
  },
  {
    key: "night_pull",
    title: "Night pull",
    blurb: "A night-sky treatment with a thin moon — a card opened between midnight and five. Nothing to do with form; everything to do with when.",
    earn: "Any pack opened 00:00–05:00 Eastern.",
    group: "chase",
    accent: "#8fb4ff",
    front: ["card-ov-night"],
    chip: "PULLED 02:14",
  },
  {
    key: "supernova",
    title: "Supernova",
    blurb: "Rays turning behind a burning core — the one-off foil for a record broken by a mile, or a pentakill moment.",
    earn: "Once per event. Never reprinted.",
    group: "chase",
    accent: "#ffd166",
    front: ["card-ov-supernova"],
    foil: true,
  },
  {
    key: "patina",
    title: "Patina",
    blurb: "Sepia, edge wear and a few scratches on prints from past seasons. Old cards look old; a mint reprint looks new.",
    earn: "Any copy from a season before the current one, deepening a little each season.",
    group: "chase",
    accent: "#c8a16e",
    front: ["card-ov-patina"],
  },
];

export const OVERLAY_GROUP_TITLES: Record<OverlayMockup["group"], string> = {
  tilt: "Tilt-driven — the physical card",
  data: "Data-driven — the card tells its own story",
  reactive: "Reactive — the card knows what is happening",
  chase: "Rarity chase",
};
