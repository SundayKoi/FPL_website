// The OBS overlay's portrait-slot cap, as a plain module.
//
// Both the draft pages (server components) and MatchDraftBoard (a client
// component) need this. It must NOT live in the board: a server component
// that imports a function from a "use client" module receives a client
// reference, not the function, and calling it throws on every render — which
// took every draft link down the night this shipped inside the board.
//
// 350px is what the league's stream scene was built around: the match
// graphic covers the middle of the canvas and only the outer band of each
// column shows, and a 350px slot fits inside that band whole. ?slot=700 is
// the wide portrait for a scene with the room for it.

export type OverlaySlotWidth = 350 | 700;
export const DEFAULT_OVERLAY_SLOT_WIDTH: OverlaySlotWidth = 350;

/** Reads ?slot= for the overlay: 700 when asked for, otherwise the default. */
export function overlaySlotWidthFrom(value: string | undefined): OverlaySlotWidth {
  return value === "700" ? 700 : DEFAULT_OVERLAY_SLOT_WIDTH;
}
