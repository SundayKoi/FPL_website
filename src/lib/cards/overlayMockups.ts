// PROPOSAL. Card overlays beyond the foil ladder, as mockups: each entry
// is a set of CSS layers PlayerCard3D draws over (or behind) a real card
// on /admin/overlays and nowhere else. Nothing here mints; a minted copy
// cannot reach these classes. If one ships, it gets a real source of
// truth (a column, a trigger, a provenance row) and this entry becomes
// the treatment that source turns on.
//
// The three the league kept from the first round, then the ones borrowed
// from sports cards, TCGs and digital collectibles.

export interface OverlayVariant {
  label: string;
  front: string[];
  chip?: string;
  artEcho?: string;
}

export interface OverlayMockup {
  key: string;
  title: string;
  /** What it looks like, in one line. */
  blurb: string;
  /** How a card would come to wear it. */
  earn: string;
  /** Where the idea comes from, for the page's grouping. */
  group: "kept" | "sports" | "tcg" | "digital";
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
  /** Several looks of one idea (the four plates, the wear grades): one
   *  card per variant instead of the two featured cards. */
  variants?: OverlayVariant[];
}

export const OVERLAY_MOCKUPS: OverlayMockup[] = [
  // ── Kept ──────────────────────────────────────────────────────────────
  {
    key: "holo_stamp",
    title: "Hologram stamp",
    blurb: "A holographic seal in the corner that runs through rainbow bands as the card tilts — the sticker on a real trading card.",
    earn: "Every foil, in place of the plain badge.",
    group: "kept",
    accent: "#9be7ff",
    front: ["card-ov-holo-stamp"],
    foil: true,
  },
  {
    key: "parallax_deep",
    title: "Layered parallax",
    blurb: "The character lifts off the backdrop and moves against it as you tilt — depth, not a flat splash.",
    earn: "Eclipses and record cards. Needs the art cut into layers per champion; this mockup fakes it with a masked echo of the same art.",
    group: "kept",
    accent: "#ffffff",
    front: [],
    artEcho: "card-ov-parallax-deep",
    foil: true,
  },
  {
    key: "ink_write",
    title: "Ink that writes itself",
    blurb: "The autograph draws on stroke by stroke, then holds.",
    earn: "Every signed copy. The mockup borrows a scrawl — the real one is the player's own ink.",
    group: "kept",
    accent: "#ffffff",
    front: [],
    ink: true,
  },

  // ── From sports cards ─────────────────────────────────────────────────
  {
    key: "printing_plates",
    title: "Printing plates",
    blurb: "The four CMYK plates a print is made from, each a one-colour version of the card and each a one of one.",
    earn: "Four per print per week: cyan, magenta, yellow, black. Announced like an Eclipse.",
    group: "sports",
    accent: "#e8e8e8",
    front: [],
    variants: [
      { label: "Cyan plate", front: ["card-ov-plate", "card-ov-plate-c"], chip: "PLATE · CYAN · 1/1" },
      { label: "Magenta plate", front: ["card-ov-plate", "card-ov-plate-m"], chip: "PLATE · MAGENTA · 1/1" },
      { label: "Yellow plate", front: ["card-ov-plate", "card-ov-plate-y"], chip: "PLATE · YELLOW · 1/1" },
      { label: "Black plate", front: ["card-ov-plate", "card-ov-plate-k"], chip: "PLATE · BLACK · 1/1" },
    ],
  },
  {
    key: "patch_card",
    title: "Patch card",
    blurb: "A window in the card holding a piece of the actual game: the map with their kills marked. The game-worn jersey, without the jersey.",
    earn: "Moment cards, from the kill positions the ingest keeps for that game.",
    group: "sports",
    accent: "#c8a16e",
    front: ["card-ov-patch"],
    chip: "PATCH · KILL MAP · WK 3",
  },
  {
    key: "superfractor",
    title: "Superfractor",
    blurb: "The case hit: a gold diamond-cut refractor so loud it is absurd. One copy a week, announced the moment it is pulled.",
    earn: "One per week across every pack. The chase.",
    group: "sports",
    accent: "#ffd166",
    front: ["card-ov-superfractor"],
    chip: "SUPERFRACTOR · 1/1",
    foil: true,
  },
  {
    key: "redemption",
    title: "Redemption card",
    blurb: "A voucher for a card that doesn't exist yet: pull it in week 2, cash it in after the final for whoever the Finals MVP turns out to be.",
    earn: "A rare pack slot in the regular season; redeems into a real print when the event happens.",
    group: "sports",
    accent: "#f5b62e",
    front: ["card-ov-redemption"],
    chip: "REDEEM AFTER THE FINAL",
  },
  {
    key: "rookie_stamp",
    title: "Rookie stamp",
    blurb: "The RC roundel, embossed in the corner of a player's first-ever card week — and never printed again.",
    earn: "Every print from the first edition a player appears in.",
    group: "sports",
    accent: "#ffffff",
    front: ["card-ov-rookie"],
  },
  {
    key: "dual_auto",
    title: "Dual auto",
    blurb: "Two signatures on one card — a duo's bot lane, a rivalry's two sides.",
    earn: "Duo and rivalry cards where both players have signed.",
    group: "sports",
    accent: "#ffffff",
    front: ["card-ov-dual-ink"],
    ink: true,
    chip: "DUAL AUTO",
  },

  // ── From TCGs ─────────────────────────────────────────────────────────
  {
    key: "reverse_holo",
    title: "Reverse holo",
    blurb: "The frame and the furniture shine; the art stays matte. The foil turned inside out.",
    earn: "A cheap parallel at the bottom of the ladder — one in every few packs.",
    group: "tcg",
    accent: "#c9d8ff",
    front: ["card-ov-reverse-holo"],
  },
  {
    key: "ghost_rare",
    title: "Ghost rare",
    blurb: "Near-white and embossed at rest; tilt it into the light and the art comes through. Eerie on purpose.",
    earn: "A rare parallel on the top tiers only.",
    group: "tcg",
    accent: "#e6ecff",
    front: ["card-ov-ghost-rare"],
    chip: "GHOST",
  },
  {
    key: "etched_foil",
    title: "Etched foil",
    blurb: "The shine follows the lines of the art instead of washing over it — a relief cut into the card.",
    earn: "A parallel of its own, sitting beside the skin-line ladder.",
    group: "tcg",
    accent: "#dfe6f0",
    front: ["card-ov-etched"],
    foil: true,
  },
  {
    key: "shiny",
    title: "Shiny",
    blurb: "The same card in the wrong colours: a hue-shifted art variant with a sparkle burst.",
    earn: "One in sixty-four prints, any tier.",
    group: "tcg",
    accent: "#ff9be7",
    front: ["card-ov-shiny-sparkle"],
    artEcho: "card-ov-shiny",
    chip: "★ SHINY",
  },
  {
    key: "secret_over",
    title: "Over-numbered secret",
    blurb: "A print numbered past the checklist — 201 of 200 — that was never on the list.",
    earn: "One hidden slot per week's edition, found by opening.",
    group: "tcg",
    accent: "#f5b62e",
    front: ["card-ov-secret"],
    chip: "SECRET · 201 / 200",
  },

  // ── From digital collectibles ─────────────────────────────────────────
  {
    key: "stattrak",
    title: "StatTrak",
    blurb: "A counter on the card that tracks something while you own it — fantasy points, Gauntlet rounds, expeditions survived. Trade it and it resets.",
    earn: "A parallel you can pull; the counter starts at zero in your hands.",
    group: "digital",
    accent: "#ff8a2a",
    front: ["card-ov-stattrak"],
  },
  {
    key: "wear",
    title: "Wear and slabbing",
    blurb: "Copies wear from being fielded. A never-fielded copy is mint; a veteran of twenty runs is battle-scarred. Slab a card and it can never be fielded again — and keeps its grade forever.",
    earn: "Every copy, from its own history. Slabbing is a choice the owner makes once.",
    group: "digital",
    accent: "#a9b7d6",
    front: [],
    variants: [
      { label: "Factory new", front: ["card-ov-wear-fn"], chip: "FACTORY NEW · 0.02" },
      { label: "Well-worn", front: ["card-ov-wear-ww"], chip: "WELL-WORN · 0.41" },
      { label: "Battle-scarred", front: ["card-ov-wear-bs"], chip: "BATTLE-SCARRED · 0.88" },
      { label: "Slabbed", front: ["card-ov-slab"], chip: "SLABBED · GRADE 10" },
    ],
  },
  {
    key: "infinity_split",
    title: "Infinity split",
    blurb: "Use a card enough and it splits: a new variant with a random border, flare and krackle. Every split is unique, and people chase the good combos.",
    earn: "Ten fantasy weeks fielded, or ten Gauntlet rounds won, on one copy.",
    group: "digital",
    accent: "#d27dff",
    front: ["card-ov-split-border", "card-ov-split-flare", "card-ov-split-krackle"],
    chip: "SPLIT ×3",
  },
  {
    key: "souvenir",
    title: "Souvenir sticker",
    blurb: "A pack opened during a live game leaves a sticker of that game on the cards inside. The card remembers where it was opened.",
    earn: "Any pack opened while a fixture is live.",
    group: "digital",
    accent: "#2ee6a8",
    front: ["card-ov-souvenir"],
  },
  {
    key: "serial_match",
    title: "Serial match",
    blurb: "A print number that matches the card's overall — print 87 of an 87 — lights the OVR ring. The jersey-number premium, translated.",
    earn: "Any copy whose print number equals its overall or its level.",
    group: "digital",
    accent: "#f5b62e",
    front: ["card-ov-serial-match"],
    chip: "PRINT #87 · MATCHES OVR",
  },
];

export const OVERLAY_GROUP_TITLES: Record<OverlayMockup["group"], string> = {
  kept: "Kept from the first round",
  sports: "From sports cards",
  tcg: "From trading card games",
  digital: "From digital collectibles",
};
