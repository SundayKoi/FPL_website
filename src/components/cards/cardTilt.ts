// The pointer tilt shared by the client-side card rigs (PlayerCard3D's
// face and the champions relic's wrapper). A plain module (no
// "use client"): the hook is only ever called from client components.
//
// Tilt is written straight to the DOM rather than held in React state —
// each rig supplies its own `writeTilt` for the nodes it moves; this module
// owns the rest values and the one-frame-per-burst scheduling around it.

import { useCallback, useEffect, useRef, type RefObject } from "react";

export const MAX_TILT_DEG = 10;

/** Resting values for the two pointer-driven layers. They live in the JSX as
 *  constant strings so React writes them once at mount and never diffs them
 *  again — everything after that is written straight to the DOM. */
export const REST_TRANSFORM = "rotateX(0deg) rotateY(0deg)";
export const REST_GLARE = "radial-gradient(circle at 50% 35%, rgb(255 255 255 / 0.5), transparent 55%)";
export const REST_TRANSITION = "transform 250ms ease-out";
export const TRACKING_TRANSITION = "transform 60ms linear";

/** Tilt in degrees about each axis, and the light's position as percents. */
type WriteTilt = (tiltX: number, tiltY: number, glareX: number, glareY: number) => void;

/**
 * Pointer moves fire faster than the display refreshes, so the handler only
 * parks the coordinates and one queued frame does the single write — and it
 * measures the card inside that frame, so a burst of moves costs one layout
 * read instead of one per event. A frame still queued at unmount is
 * cancelled.
 *
 * `trackPointer` is the move handler's whole job; `cancelTilt` drops a
 * queued frame and forgets the pointer, the first step of a rig's reset.
 */
export function useCardTilt(frameRef: RefObject<HTMLElement | null>, writeTilt: WriteTilt) {
  // Latest pointer position, parked for the next animation frame.
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafRef = useRef(0);

  const scheduleTilt = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const frame = frameRef.current;
      const pointer = pointerRef.current;
      if (!frame || !pointer) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = (pointer.clientX - rect.left) / rect.width;
      const py = (pointer.clientY - rect.top) / rect.height;
      writeTilt((0.5 - py) * MAX_TILT_DEG * 2, (px - 0.5) * MAX_TILT_DEG * 2, px * 100, py * 100);
    });
  }, [frameRef, writeTilt]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const trackPointer = (event: { clientX: number; clientY: number }) => {
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    scheduleTilt();
  };

  const cancelTilt = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pointerRef.current = null;
  };

  return { trackPointer, cancelTilt };
}
