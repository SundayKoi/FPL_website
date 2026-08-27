// The Dash Fire overlay — FPL's dashed-label motif, on fire, riding the
// EDGE of whatever it decorates: a dashed ring flush with the border and a
// three-spark comet endlessly lapping it.
//
// A layer, not a frame swap. The element's own border (a card's tier
// frame, a panel's line) stays fully visible underneath, which is what
// keeps money from ever looking like a rating.
//
// No "use client": this is just divs and CSS vars, so server components
// (the public binder, the supporters page) render it as easily as the
// client card does. Colours arrive as CSS custom properties so one
// stylesheet serves every flame in the wardrobe.

import { PATRON_FLAMES, patronFlameOf } from "@/lib/patron/flames";

export default function PatronFlame({
  flame,
  /** Matches the host's corner rounding so the comet hugs the corners.
   *  The card is rounded-2xl (1rem); panels pass their own. */
  radius = "1rem",
}: {
  flame: string | null | undefined;
  radius?: string;
}) {
  const style = PATRON_FLAMES[patronFlameOf(flame)];
  return (
    <span
      aria-hidden
      data-testid="patron-flame"
      className="patron-flame-layer"
      style={
        {
          "--flame-dash": style.dash,
          "--flame-hot": style.hot,
          "--flame-core": style.core,
          "--flame-radius": radius,
        } as React.CSSProperties
      }
    >
      <span className="patron-flame-ring" />
      <span className="patron-flame-spark" />
      <span className="patron-flame-spark" />
      <span className="patron-flame-spark" />
      {/* LAST child on purpose: the spark nth-child sizing above counts
          from the ring, and an early sibling would shift all three. */}
      {style.effect === "embers" ? <span className="patron-flame-embers" data-testid="patron-flame-embers" /> : null}
    </span>
  );
}
