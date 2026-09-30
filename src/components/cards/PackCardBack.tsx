// A card back in the pack opening's line. Rendered only by PackOpening, a
// client component, so it carries no directive of its own.

import type { RarityClass } from "@/lib/packs/config";
import { PATRON_FLAMES, patronFlameOf } from "@/lib/patron/flames";
import PatronFlame from "@/components/patron/PatronFlame";
import { PACK_RARITY_CLASS } from "./packOpeningModel";

/** Fixed sparkle placements on a signed card's back, as percentages. */
const BACK_SPARKS = [
  { left: "12%", top: "14%", delay: "0s" },
  { left: "78%", top: "26%", delay: "0.7s" },
  { left: "22%", top: "76%", delay: "1.4s" },
];

/** The back of a card in the line: FPL-branded, and glowing in the rarity of
 *  the card behind it. A patron's packs deal from their own deck — the back
 *  borders and marks itself in their flame, with the flame riding it. */
export default function PackCardBack({
  rarity,
  signed,
  godPack = false,
  label,
  revealed,
  flame = null,
  onFlip,
}: {
  rarity: RarityClass;
  signed: boolean;
  godPack?: boolean;
  label: string;
  /** Already turned — the back is still in the DOM for the flip to rotate
   *  away, but it must stop being a button the moment it faces backwards. */
  revealed: boolean;
  /** The opener's flame — patrons flip their own card backs. */
  flame?: string | null;
  onFlip: () => void;
}) {
  const flameStyle = flame ? PATRON_FLAMES[patronFlameOf(flame)] : null;
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={revealed}
      aria-hidden={revealed}
      tabIndex={revealed ? -1 : undefined}
      aria-label={label}
      className={`pack-card-back ${PACK_RARITY_CLASS[rarity]} ${godPack ? "god-pack-card-back" : ""}`}
      style={flameStyle ? { borderColor: flameStyle.dash } : undefined}
    >
      <span className="pack-back-glow" aria-hidden />
      {signed
        ? BACK_SPARKS.map((spark) => (
            <span
              key={spark.left}
              aria-hidden
              className="pack-back-spark"
              style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
            >
              ✦
            </span>
          ))
        : null}
      <span className="pack-back-mark">
        {godPack ? <span className="pack-back-god">GOD</span> : null}
        <span
          className="type-display pack-back-fpl"
          style={flameStyle ? { color: flameStyle.hot, textShadow: `0 0 16px ${flameStyle.core}` } : undefined}
        >
          FPL
        </span>
        <span className="pack-back-rule" aria-hidden style={flameStyle ? { background: flameStyle.core } : undefined} />
      </span>
      {flameStyle ? <PatronFlame flame={flame} radius="0.8rem" /> : null}
    </button>
  );
}
