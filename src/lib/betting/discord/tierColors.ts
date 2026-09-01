// The embed stripe for a card's tier, in one place.
//
// It lived inside rip.ts until /flex wanted the same ladder. Two copies of
// a colour table is two chances for a Diamond to read blue in one command
// and purple in another — and the whole job of the stripe is that a card
// looks the same wherever the bot shows it, the way it does on the shelf.
//
// Deliberately not "server-only": it is nine numbers and no IO, so a test
// or a client surface can read it without dragging a server module in.

/** Embed stripe per tier — the same ladder the site's tier styling walks. */
export const TIER_COLORS: Record<string, number> = {
  bronze: 0xb08d57,
  silver: 0xc7ccd6,
  gold: 0xe8c14b,
  platinum: 0x35d0ba,
  emerald: 0x2ecc71,
  diamond: 0x6ea8ff,
  master: 0xa96fe3,
  grandmaster: 0xe04747,
  challenger: 0x9ee7ff,
};
