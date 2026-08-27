"use client";

// The sealed pack, and the tearing of it.
//
// By the time this component mounts the pack has already been paid for and
// rolled on the server — the cards behind the foil are fixed. Nothing here can
// change what comes out, which is exactly the point: the rip is theater built
// on an honest outcome, the way a real pack is already decided before you get
// your thumbnail under the crimp.
//
// The one thing the theater is allowed to know is *how good* the pull is, and
// it spends that on the aura: a rarity-colored glow that starts dim and swells
// as the tear widens, so the pack tells you something is coming before it tells
// you what. Drag across the crimped top to rip; three clicks or a held Enter
// get there too, and prefers-reduced-motion skips the whole thing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { RarityClass } from "@/lib/packs/config";
import { ripOpen, ripTick } from "@/lib/packs/sounds";

/** Horizontal drag, in px, that takes the tear from sealed to open. Tuned
 *  against the pack's own width — a swipe most of the way across it, so
 *  opening it is deliberate rather than a twitch. Left where it was when the
 *  pack grew to 300px for the full-screen stage: a tear that scaled with the
 *  art would have made the drag longer for no reason. */
const RIP_DISTANCE = 240;

/** Past this the pack is coming open whether you keep dragging or not — the
 *  last 15% is the foil giving way, not the user's work. */
const OPEN_AT = 0.85;

/** Progress added per Enter/Space press. Holding the key repeats keydown, so
 *  the pack tears open under a held key at roughly drag speed. */
const KEY_STEP = 0.12;

/** Clicks to open, for anyone who can't (or doesn't want to) drag. */
const CLICKS_TO_OPEN = 3;

/** Burst → cards. Long enough for the flash to bloom and the wrapper to clear
 *  the frame; the sting keeps playing over the first card landing. */
const BURST_MS = 900;

/** A pointer that wandered further than this between down and up was a drag,
 *  not a click — otherwise every half-hearted tear also counts toward the
 *  three-click path. */
const CLICK_SLOP = 6;

const AURA_CLASS: Record<RarityClass, string> = {
  common: "pack-rarity-common",
  rare: "pack-rarity-rare",
  epic: "pack-rarity-epic",
  legendary: "pack-rarity-legendary",
};

/** Teeth in the torn edge. Enough to read as ripped paper at 260px wide,
 *  few enough that the clip-path stays a one-line string. */
const TEETH = 18;

/** A zigzag run of clip-path points between two vertical offsets (percent of
 *  the element's height), left to right — or right to left, for an edge being
 *  closed off from the far side. */
function zigzag(from: number, to: number, reverse: boolean): string {
  const points: string[] = [];
  for (let i = 0; i <= TEETH; i += 1) {
    const x = (i / TEETH) * 100;
    const y = i % 2 === 0 ? from : to;
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  if (reverse) points.reverse();
  return points.join(", ");
}

/** The pack below the tear: torn along the top, square to the bottom. The
 *  teeth sit at 13–17.5% of the pack's height, just under where the strip
 *  ends, so pulling the strip away exposes a ragged edge rather than a
 *  suspiciously straight one. */
const BODY_CLIP = `polygon(${zigzag(13, 17.5, false)}, 100% 100%, 0% 100%)`;

/** The strip that comes off in your hand: the crimp along the top, the other
 *  half of the same tear along the bottom. */
const STRIP_CLIP = `polygon(0% 0%, 100% 0%, ${zigzag(100, 78, true)})`;

/** Where the burst's ✦ particles fly. Fixed rather than random so the burst
 *  looks composed instead of scattered. */
const BURST_PARTICLES = [
  { dx: -96, dy: -74 }, { dx: -46, dy: -104 }, { dx: 8, dy: -118 }, { dx: 62, dy: -96 },
  { dx: 104, dy: -52 }, { dx: -108, dy: -14 }, { dx: 96, dy: 16 }, { dx: -30, dy: 44 },
];

/** Idle sparkle positions for a signed pull, as percentages of the stage. */
const SIGNED_SPARKS = [
  { left: "8%", top: "16%", delay: "0s" }, { left: "84%", top: "24%", delay: "0.5s" },
  { left: "16%", top: "72%", delay: "1s" }, { left: "88%", top: "64%", delay: "1.5s" },
  { left: "50%", top: "6%", delay: "0.8s" }, { left: "44%", top: "92%", delay: "1.9s" },
];

/** Exported so the full-screen opening (PackOpening) asks the same question
 *  the same way — one answer for the whole ritual, not one per component. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function PackRip({
  bestRarity,
  hasSigned,
  champions = false,
  muted,
  onOpened,
  onProgress,
}: {
  /** The best rarity in the pack — what the aura is colored and paced by. */
  bestRarity: RarityClass;
  /** Anything in the pack autographed, which earns sparkles at any rarity. */
  hasSigned: boolean;
  /** A Faceless Pack — the wrapper prints the drop's own markings, not the
   *  player-pack promise (this is one relic, not five cards and a rare). */
  champions?: boolean;
  muted: boolean;
  /** The wrapper is gone; start the card reveal. */
  onOpened: () => void;
  /** How far the tear has got, 0–1, whenever it moves. The stage around the
   *  pack rides this — the vignette and the light rays swell with the rip —
   *  and 1 means the foil has given way, i.e. the burst is playing. */
  onProgress?: (progress: number) => void;
}) {
  const [progress, setProgress] = useState(0);
  const [opening, setOpening] = useState(false);
  // Read once, on mount: the pack is on screen for seconds, and re-deciding
  // mid-rip whether to have a rip would be worse than either answer.
  const [reduced] = useState(prefersReducedMotion);

  const progressRef = useRef(0);
  const openingRef = useRef(false);
  const dragRef = useRef<{ id: number; startX: number; base: number } | null>(null);
  const movedRef = useRef(0);
  const clicksRef = useRef(0);
  const mutedRef = useRef(muted);
  // Held in a ref so the open effects don't re-fire if the parent hands us a
  // fresh closure on some unrelated render.
  const onOpenedRef = useRef(onOpened);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    mutedRef.current = muted;
    onOpenedRef.current = onOpened;
    onProgressRef.current = onProgress;
  });

  // Reported from an effect rather than from advance() so every path that
  // moves the tear — drag, clicks, held Enter, the burst's jump to 1 — is
  // covered by one line instead of three call sites that could drift.
  useEffect(() => {
    onProgressRef.current?.(progress);
  }, [progress]);

  // No rip at all when motion is off: the pack was already paid for, and
  // making someone sit through an animation they've asked not to see is a
  // worse deal than skipping straight to the cards.
  useEffect(() => {
    if (reduced) onOpenedRef.current();
  }, [reduced]);

  // The burst plays out, then the cards take the stage.
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => onOpenedRef.current(), BURST_MS);
    return () => clearTimeout(timer);
  }, [opening]);

  const burst = useCallback(() => {
    if (openingRef.current) return;
    openingRef.current = true;
    progressRef.current = 1;
    setProgress(1);
    setOpening(true);
    if (!mutedRef.current) ripOpen(bestRarity, hasSigned);
  }, [bestRarity, hasSigned]);

  /** Move the tear to `next`, crackling if it widened, and let go of the top
   *  strip once the foil has given up. */
  const advance = useCallback(
    (next: number) => {
      if (openingRef.current) return;
      const value = Math.min(1, Math.max(0, next));
      if (value > progressRef.current && !mutedRef.current) ripTick(value);
      progressRef.current = value;
      setProgress(value);
      if (value >= OPEN_AT) burst();
    },
    [burst],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (openingRef.current) return;
    dragRef.current = { id: event.pointerId, startX: event.clientX, base: progressRef.current };
    movedRef.current = 0;
    // Capture so the tear keeps tracking once the pointer leaves the pack —
    // which it always does, because the drag is wider than the pack is.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* no capture: the tear just stops at the pack's edge */
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    // Distance, not direction — foil tears whichever way your thumb goes, and
    // measuring the absolute offset means dragging back eases the tear shut.
    const dx = Math.abs(event.clientX - drag.startX);
    movedRef.current = Math.max(movedRef.current, dx);
    advance(drag.base + dx / RIP_DISTANCE);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.id !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* nothing held it */
    }
  }

  function handleClick() {
    if (openingRef.current) return;
    // A drag fires a click on release; that's the tear, not a tap.
    if (movedRef.current > CLICK_SLOP) {
      movedRef.current = 0;
      return;
    }
    clicksRef.current += 1;
    // Each click walks a third of the way, so the accessible path still looks
    // like a pack being torn rather than a pack teleporting open.
    const clicked = (clicksRef.current / CLICKS_TO_OPEN) * 0.95;
    advance(Math.max(progressRef.current, clicked));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    // Space scrolls the page and Enter would double up with the click path.
    event.preventDefault();
    advance(progressRef.current + KEY_STEP);
  }

  if (reduced) return null;

  const rarityClass = AURA_CLASS[bestRarity] ?? AURA_CLASS.common;
  // The tease: dim at rest, blinding by the time the foil lets go.
  const auraStyle: CSSProperties = {
    opacity: 0.28 + progress * 0.72,
    transform: `scale(${1 + progress * 0.22})`,
  };
  const stripStyle: CSSProperties = opening
    ? {
        clipPath: STRIP_CLIP,
        transform: "translate(155%, -190px) rotate(36deg)",
        opacity: 0,
        transition: "transform 720ms cubic-bezier(0.2,0.7,0.3,1), opacity 720ms ease-out",
      }
    : {
        clipPath: STRIP_CLIP,
        transform: `translate(${progress * 64}%, ${-progress * 28}px) rotate(${progress * 10}deg)`,
      };

  return (
    <div className={`pack-stage ${rarityClass}`} data-testid="pack-stage">
      <div className="pack-aura-wrap" style={auraStyle} aria-hidden>
        <div className="pack-aura" />
      </div>

      {hasSigned
        ? SIGNED_SPARKS.map((spark) => (
            <span
              key={`${spark.left}-${spark.top}`}
              aria-hidden
              className="pack-spark"
              style={{ left: spark.left, top: spark.top, animationDelay: spark.delay }}
            >
              ✦
            </span>
          ))
        : null}

      {opening ? (
        <>
          <div className="pack-burst" aria-hidden />
          {BURST_PARTICLES.map((particle) => (
            <span
              key={`${particle.dx}:${particle.dy}`}
              aria-hidden
              className="pack-burst-spark"
              style={{ "--dx": `${particle.dx}px`, "--dy": `${particle.dy}px` } as CSSProperties}
            >
              ✦
            </span>
          ))}
        </>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        aria-label="Sealed pack — drag across the crimped top to rip it open"
        className={`pack-wrapper ${opening ? "pack-wrapper-out" : "pack-idle"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {/* The light spilling out of the tear, behind both halves. */}
        <div className="pack-tear" aria-hidden style={{ opacity: Math.min(1, progress * 1.4) }} />

        <div className="pack-body" aria-hidden style={{ clipPath: BODY_CLIP }}>
          <div className="pack-foil">
            <div className="pack-sheen" />
            <div className="pack-mark">
              <span className="type-display pack-mark-fpl">{champions ? "🂡" : "FPL"}</span>
              <span className="pack-mark-sub">{champions ? "The Faceless Drop" : "Player Cards"}</span>
              <span className="pack-mark-rule" />
              <span className="pack-mark-count">
                {champions ? "1 card · The Hand of five" : "5 cards · 1 guaranteed rare"}
              </span>
            </div>
          </div>
        </div>

        <div className="pack-strip" aria-hidden style={stripStyle}>
          <div className="pack-foil pack-strip-foil">
            <div className="pack-crimp" />
            <span className="pack-tear-hint">tear here ▸</span>
          </div>
        </div>
      </div>

      <p className="pack-hint" aria-hidden>
        {progress <= 0 ? "Rip it — drag across the top" : progress < OPEN_AT ? "Keep going…" : "Open!"}
      </p>
      <p className="sr-only">
        Drag across the top of the pack to rip it open, click it three times, or hold Enter.
      </p>
    </div>
  );
}
