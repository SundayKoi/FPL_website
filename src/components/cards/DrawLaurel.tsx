// The Weekly Draw's laurel — permanent provenance on a copy that won.
// A layer like PatronFlame, not a frame swap: gold roundel, bottom-left,
// clear of every renderer's corner indices and footer rails.
//
// Server-renderable: no hooks, no handlers, so it drops into the champions
// relic and the moment plate (both static) as readily as into the player
// card's tilt rig.
//
// `position` is the whole placement, not an override appended to a default:
// two competing `bottom-*` utilities on one element are settled by
// stylesheet order rather than by the call site, which is a coin flip. The
// default is the bottom-left pocket every renderer keeps empty except the
// player card front, whose stat rail owns the bottom half — that one caller
// passes a top-left placement instead (see PlayerCard3D).

export default function DrawLaurel({
  weekStart,
  position = "bottom-[9%] left-[6%]",
}: {
  weekStart: string;
  position?: string;
}) {
  return (
    <span
      // A bare span has a generic role, and ARIA lets an assistive
      // technology drop aria-label on one — this mark's only text is the
      // label, so it says outright that it is an image.
      role="img"
      aria-label="Weekly Draw winner"
      title={`Won the Weekly Draw — week of ${weekStart}`}
      className={`absolute ${position} grid h-7 w-7 place-content-center rounded-full border border-[#e8c14b]/80 bg-black/70`}
      style={{ boxShadow: "0 0 10px rgb(232 193 75 / 0.45)" }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path d="M5 3 C5 12 9 16 12 17 C15 16 19 12 19 3 C16 5 14 5 12 4 C10 5 8 5 5 3 Z"
              fill="none" stroke="#e8c14b" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="12" cy="20" r="1.4" fill="#e8c14b" />
      </svg>
    </span>
  );
}
