// The walkout: a pull good enough to stop the opening takes the whole
// screen. Rendered only by PackOpening, a client component, so it carries
// no directive of its own.

import PlayerCard3D from "./PlayerCard3D";
import { PACK_RARITY_CLASS, pullRarity, walkoutLabels, type Pull } from "./packOpeningModel";

/** The storm behind a walkout. Deterministic, so it reads as composed. */
const STORM_SPARKS = [
  { left: "8%", top: "18%", delay: "0s" }, { left: "22%", top: "62%", delay: "0.4s" },
  { left: "34%", top: "12%", delay: "0.9s" }, { left: "68%", top: "20%", delay: "0.2s" },
  { left: "82%", top: "58%", delay: "1.1s" }, { left: "90%", top: "26%", delay: "0.6s" },
  { left: "14%", top: "84%", delay: "1.3s" }, { left: "74%", top: "82%", delay: "0.8s" },
  { left: "46%", top: "88%", delay: "1.6s" }, { left: "56%", top: "6%", delay: "1.0s" },
];

export default function PackWalkout({
  pull,
  finale,
  flame,
  onDismiss,
}: {
  pull: Pull;
  /** The God Pack's last card: its own label in place of the pull's. */
  finale: boolean;
  flame: string | null;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`pack-walkout ${PACK_RARITY_CLASS[pullRarity(pull)]} ${finale ? "god-pack-finale" : ""}`}
      onClick={onDismiss}
      role="presentation"
    >
      <div className="pack-rays" aria-hidden style={{ opacity: 0.45 }} />
      {STORM_SPARKS.map((spark) => (
        <span
          key={spark.left + spark.top}
          aria-hidden
          className="pack-storm-spark"
          style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
        >
          ✦
        </span>
      ))}
      <div className="relative flex flex-col items-center gap-1">
        {finale ? (
          <span className="pack-walkout-label god-pack-finale-label">THE FINAL PULL</span>
        ) : null}
        {!finale ? walkoutLabels(pull).map((label) => (
          <span key={label} className="pack-walkout-label">
            {label}
          </span>
        )) : null}
      </div>
      {/* Clicks inside the card belong to the card (it flips), not to the
          backdrop — the walkout is dismissed by its own button or by the
          space around it. */}
      <div className="pack-walkout-card" onClick={(event) => event.stopPropagation()} role="presentation">
        {pull.card ? <PlayerCard3D card={pull.card} bloom gyro forceFoil={pull.foil} foilType={pull.foilType} flame={flame} /> : pull.renderFace}
      </div>
      <button
        type="button"
        autoFocus
        // Stopped, not bubbled: the backdrop dismisses too, and one click
        // reaching both handlers would eat the next queued walkout as
        // well as this one.
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        className="btn-primary relative px-6 py-2.5 text-sm"
      >
        Continue
      </button>
    </div>
  );
}
