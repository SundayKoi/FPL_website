// Expedition provenance — what a copy brought back from the field.
//
// Three grades on one component, each a superset of the one below it:
//
//   trail   a steel compass roundel, nothing else
//   sigil   that roundel struck in gold, plus two weathered corner accents
//   legend  the sigil treatment plus the gilded ember frame (legend-embers)
//
// Built as layers over the card, exactly like DrawLaurel and PatronFlame,
// rather than as a frame swap: a marked copy is still the card it was, and
// a copy can wear a laurel AND a mark at once. Server-renderable — no
// hooks, no handlers — so it drops into the champions relic and the moment
// plate (both static) as readily as into the player card's tilt rig.
//
// `position` and `frame` are WHOLE placement strings, not overrides
// appended to a default, for DrawLaurel's reason: two competing `bottom-*`
// utilities on one element are settled by stylesheet order rather than by
// the call site, which is a coin flip. Every renderer has different
// furniture in its corners, so each caller names its own pocket:
//   - the player card front is a stat rail from its midpoint down and an
//     OVR ring + serial at the top right, so the roundel rides the free
//     right edge between them;
//   - a champions relic keeps its flipped corner index at bottom right,
//     so the roundel sits above it on the same edge;
//   - the moment plate's bottom right is clear, which is the default.
// The laurel is bottom-left (top-left on a player card) in all three, and
// the accents' ink hugs the outer 10px, so laurel and mark never touch.

export type ExpeditionMarkKind = "trail" | "sigil" | "legend";

const GRADE_LABEL: Record<ExpeditionMarkKind, string> = {
  trail: "Trail",
  sigil: "Sigil",
  legend: "Legend",
};

/** Steel for a trail mark, struck gold from sigil up. */
const TRAIL_INK = "#8d8388";
const GOLD_INK = "#e8c14b";

/** The worn bronze wash on a corner accent. One gradient, aimed at the
 *  corner it decorates so the paint is densest on the card's edge and has
 *  faded out well before any content — 135deg as briefed would pool the
 *  bronze *inward*, over the OVR ring on a player card. */
const ACCENT_WASH = (deg: number) =>
  `linear-gradient(${deg}deg, rgb(176 141 87 / 0.5), transparent 60%)`;

export default function ExpeditionMark({
  mark,
  date,
  position = "bottom-[9%] right-[6%]",
  frame = "inset-0 rounded-2xl",
}: {
  mark: ExpeditionMarkKind;
  /** The day the expedition was claimed — the copy's provenance. */
  date: string;
  /** The whole placement class string for the roundel. */
  position?: string;
  /** The whole box class string for the legend ember frame. */
  frame?: string;
}) {
  const gilded = mark !== "trail";
  const ink = gilded ? GOLD_INK : TRAIL_INK;

  return (
    <>
      {mark === "legend" ? (
        // Full-face, but masked to a band at the edges (globals.css) — the
        // Legend Finish is a frame that burns, not a veil over the art.
        <span
          aria-hidden
          data-testid="legend-embers"
          className={`legend-embers absolute ${frame}`}
        />
      ) : null}

      {gilded ? (
        <>
          {/* Two brackets on the card's diagonal, ink inset 10px so it
              lands inside the corner radius rather than poking out of it
              (the player card's tilt layer does not clip). */}
          <span
            aria-hidden
            data-testid="expedition-accent"
            className="pointer-events-none absolute right-2.5 top-2.5 h-10 w-10 rounded-tr-lg border-r border-t border-[#b08d57]/70"
            style={{ background: ACCENT_WASH(225) }}
          />
          <span
            aria-hidden
            data-testid="expedition-accent"
            className="pointer-events-none absolute bottom-2.5 left-2.5 h-10 w-10 rounded-bl-lg border-b border-l border-[#b08d57]/70"
            style={{ background: ACCENT_WASH(45) }}
          />
        </>
      ) : null}

      <span
        // A bare span has a generic role, and ARIA lets an assistive
        // technology drop aria-label on one — this mark's only text is the
        // label, so it says outright that it is an image.
        role="img"
        aria-label={`Expedition mark — ${GRADE_LABEL[mark]}`}
        title={`${GRADE_LABEL[mark]} mark — returned from an expedition on ${date}`}
        className={`absolute ${position} grid h-6 w-6 place-content-center rounded-full border bg-black/70`}
        style={{
          borderColor: gilded ? `${GOLD_INK}cc` : `${TRAIL_INK}cc`,
          boxShadow: gilded ? "0 0 9px rgb(232 193 75 / 0.45)" : "0 1px 3px rgb(0 0 0 / 0.7)",
        }}
      >
        {/* A compass rose: the ring, the needle's outline, and its north
            half filled so the bearing reads at 14px. */}
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="none" stroke={ink} strokeWidth="1.5" />
          <path
            d="M12 4.5 L14.8 12 L12 19.5 L9.2 12 Z"
            fill="none"
            stroke={ink}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M12 4.5 L14.8 12 L9.2 12 Z" fill={ink} />
        </svg>
      </span>
    </>
  );
}
