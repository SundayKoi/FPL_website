// The expedition board's icons: one 14px monoline set, drawn in the same
// hand as the route map (thin light ink, round caps), so a status reads the
// same on a chip, a pill, a run card and the fork prompt. Colour never
// carries meaning alone — every icon sits beside its word.
//
// Hook-free and server-renderable. Every glyph is decorative (aria-hidden):
// the word next to it is what a screen reader hears.

import type { ReactNode, SVGProps } from "react";

export type ExpeditionIconName =
  | "away"
  | "lost"
  | "wounded"
  | "sealed"
  | "signed"
  | "foil"
  | "relic"
  | "edge"
  | "fragment"
  | "fork"
  | "safe"
  | "risk"
  | "dead"
  | "home"
  | "convoy"
  | "campaign"
  | "clock"
  | "lock"
  | "check"
  | "power"
  | "spark"
  | "info"
  | "chevron"
  | "landmark";

/** Each glyph in a 16×16 box, drawn with a 1.5 stroke. */
const GLYPHS: Record<ExpeditionIconName, ReactNode> = {
  // A path leaving over the horizon: the card is out on the road.
  away: (
    <>
      <path d="M2 13c3-1 4-4 6-4s3 3 6 2" />
      <path d="M10 3.5 13 6.5 10 9.5" />
      <path d="M13 6.5H6" />
    </>
  ),
  // A compass with no needle: nobody knows where it is.
  lost: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.3 6.4a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1" />
      <path d="M8 11.2v.1" />
    </>
  ),
  // A bandage across the card.
  wounded: (
    <>
      <rect x="2.5" y="5.5" width="11" height="5" rx="2.5" transform="rotate(-35 8 8)" />
      <path d="M7 7.3v1.4M9 7.3v1.4" transform="rotate(-35 8 8)" />
    </>
  ),
  // The slab: a card sealed in a case.
  sealed: (
    <>
      <rect x="3.5" y="2" width="9" height="12" rx="1.5" />
      <path d="M3.5 5h9" />
      <rect x="5.5" y="7" width="5" height="5" rx=".5" />
    </>
  ),
  // A pen nib: ink on the card.
  signed: (
    <>
      <path d="M3 13l1.2-3.6L10.5 3a1.4 1.4 0 0 1 2 2L6.2 11.3z" />
      <path d="M9.4 4.1l2.5 2.5" />
    </>
  ),
  // A four-point glint: a foil print.
  foil: <path d="M8 1.8l1.4 4.8 4.8 1.4-4.8 1.4L8 14.2 6.6 9.4 1.8 8l4.8-1.4z" />,
  // A cut gem: a relic.
  relic: (
    <>
      <path d="M4 3h8l2.5 3.5L8 14 1.5 6.5z" />
      <path d="M1.5 6.5h13M6 3l2 11 2-11" />
    </>
  ),
  // A spark: a card's edge.
  edge: <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" />,
  // A torn map corner.
  fragment: (
    <>
      <path d="M2.5 3.5 6 2.5l4 1.5 3.5-1v9.5L10 13.5 6 12l-3.5 1z" />
      <path d="M6 2.5V12M10 4v9.5" />
    </>
  ),
  // The road splitting in two.
  fork: (
    <>
      <path d="M8 14V8.5" />
      <path d="M8 8.5 4 3.5M8 8.5l4-5" />
      <path d="M2.8 5 4 3.5 5.6 4M10.4 4 12 3.5l1.2 1.5" />
    </>
  ),
  // A tent: the squad camps.
  safe: (
    <>
      <path d="M1.5 13.5 8 3l6.5 10.5z" />
      <path d="M8 13.5 6.3 9.5h3.4z" />
    </>
  ),
  // A warning triangle.
  risk: (
    <>
      <path d="M8 2 14.5 13.5h-13z" />
      <path d="M8 6.5v3.2M8 11.6v.1" />
    </>
  ),
  // A headstone.
  dead: (
    <>
      <path d="M4 14V6.5a4 4 0 0 1 8 0V14" />
      <path d="M2.5 14h11M8 6.5v4M6.3 8h3.4" />
    </>
  ),
  // A house: the squad is home.
  home: (
    <>
      <path d="M2.5 7.5 8 2.5l5.5 5" />
      <path d="M4 6.5V13.5h8V6.5" />
      <path d="M6.8 13.5v-3.5h2.4v3.5" />
    </>
  ),
  // Two squads, one road.
  convoy: (
    <>
      <circle cx="5" cy="8" r="2.5" />
      <circle cx="11" cy="8" r="2.5" />
      <path d="M1 13.5h14" />
    </>
  ),
  // A pennant: a campaign.
  campaign: (
    <>
      <path d="M4 14.5V1.5" />
      <path d="M4 2.5h8.5l-2 3 2 3H4" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.8V8l2.2 1.6" />
    </>
  ),
  lock: (
    <>
      <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  // A rising bar: power.
  power: (
    <>
      <path d="M3 13.5V10M6.3 13.5V7.5M9.7 13.5V5M13 13.5V2.5" />
    </>
  ),
  spark: (
    <>
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
      <path d="M4 4l1.6 1.6M10.4 10.4 12 12M12 4l-1.6 1.6M5.6 10.4 4 12" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.2v3.8M8 5v.1" />
    </>
  ),
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  // A signpost: a place named after whoever reached it first.
  landmark: (
    <>
      <path d="M7 14.5V1.8" />
      <path d="M7 3h5.5L14 4.8 12.5 6.6H7" />
      <path d="M4.5 14.5h5" />
    </>
  ),
};

export default function ExpeditionIcon({
  name,
  className = "",
  size = 14,
  ...rest
}: { name: ExpeditionIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "children">) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  );
}
