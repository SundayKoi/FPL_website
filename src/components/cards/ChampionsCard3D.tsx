"use client";

// The champions relic, tilting: PlayerCard3D renders this for a copy that
// carries a champions-drop print (card.champWin).

import { useCallback, useRef, useState } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import PatronFlame from "@/components/patron/PatronFlame";
import ChampionsCard from "./ChampionsCard";
import { REST_GLARE, REST_TRANSFORM, REST_TRANSITION, TRACKING_TRANSITION, useCardTilt } from "./cardTilt";

/** The champions relic's foil at rest — matches the fixed opacity
 *  ChampionsCard renders with, so the release writes back what React set. */
const CHAMP_FOIL_REST = 0.5;
const CHAMP_FOIL_PEAK = 0.85;

/**
 * The tilt rig around a ChampionsCard — the same pointer treatment a
 * player card gets, wrapped around the server-renderable relic instead of
 * rebuilt inside it. ChampionsCard stays hook-free (the admin preview
 * renders it directly, static); this wrapper owns the rotation, a soft
 * glare, and driving the relic's own foil layers by hand, direct DOM
 * writes and one rAF per frame, exactly like PlayerCardFace's writeTilt.
 */
export default function ChampionsCard3D({
  card,
  interactive,
  foil,
  foilType,
  flame,
  className = "",
}: {
  card: PlayerCardData;
  interactive: boolean;
  foil: boolean;
  foilType: string | null;
  flame: string | null;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const glareRef = useRef<HTMLDivElement | null>(null);
  const [hovering, setHovering] = useState(false);

  const writeTilt = useCallback((tiltX: number, tiltY: number, glareX: number, glareY: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    frame.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    const glare = glareRef.current;
    if (glare) {
      // Quieter than a player card's glare — white light on black felt
      // reads twice as loud.
      glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / 0.22), transparent 55%)`;
    }
    // The relic's own foil layers, driven from outside: the parallel layer
    // chases the light and the whole sheet brightens as the card turns,
    // same numbers as a player card's pulled foil.
    const foilWrap = frame.querySelector<HTMLElement>('[data-testid="champ-foil"]');
    if (foilWrap) {
      const layer = foilWrap.querySelector<HTMLElement>(":scope > div:first-child");
      if (layer) layer.style.backgroundPosition = `${glareX * 1.6 - 30}% ${glareY * 1.6 - 30}%`;
      const cosmos = foilWrap.querySelector<HTMLElement>(".card-foil-cosmos");
      if (cosmos) {
        cosmos.style.backgroundPosition = `${glareX * 0.5}% ${glareY * 0.5}%, ${100 - glareX * 0.4}% ${100 - glareY * 0.4}%`;
      }
      const fromCentre = Math.min(1, Math.hypot(glareX - 50, glareY - 50) / 50);
      foilWrap.style.opacity = String(CHAMP_FOIL_REST + fromCentre * (CHAMP_FOIL_PEAK - CHAMP_FOIL_REST));
    }
  }, []);

  const { trackPointer, cancelTilt } = useCardTilt(frameRef, writeTilt);

  const reset = () => {
    if (!interactive) return;
    cancelTilt();
    const frame = frameRef.current;
    if (frame) {
      frame.style.transition = REST_TRANSITION;
      const foilWrap = frame.querySelector<HTMLElement>('[data-testid="champ-foil"]');
      if (foilWrap) {
        foilWrap.style.opacity = String(CHAMP_FOIL_REST);
        const layer = foilWrap.querySelector<HTMLElement>(":scope > div:first-child");
        if (layer) layer.style.backgroundPosition = "";
        const cosmos = foilWrap.querySelector<HTMLElement>(".card-foil-cosmos");
        if (cosmos) cosmos.style.backgroundPosition = "";
      }
    }
    writeTilt(0, 0, 50, 35);
    setHovering(false);
  };

  return (
    <div
      data-motion={hovering ? "live" : "rest"}
      className={`relative [perspective:1100px] ${className}`}
      style={{ width: "20rem" }}
    >
      <div
        ref={frameRef}
        style={{ transform: REST_TRANSFORM }}
        onPointerEnter={() => {
          if (!interactive) return;
          if (frameRef.current) frameRef.current.style.transition = TRACKING_TRANSITION;
          setHovering(true);
        }}
        onPointerMove={(event) => {
          if (!interactive) return;
          trackPointer(event);
        }}
        onPointerLeave={reset}
        onPointerCancel={reset}
        className="relative"
      >
        <ChampionsCard card={card} foil={foil} foilType={foilType} signed={Boolean(card.autograph)} />
        <div
          ref={glareRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-200"
          style={{ background: REST_GLARE, opacity: hovering ? 1 : 0, mixBlendMode: "soft-light" }}
        />
        {flame ? <PatronFlame flame={flame} radius="0.75rem" /> : null}
      </div>
    </div>
  );
}
