"use client";

import { useEffect, useRef } from "react";

/**
 * An armed confirm that nobody follows through on should stand down.
 * Every two-tap on the site ("Dust", "Confirm $120", "Stand up") stayed
 * armed for as long as the page was open, so a button you nearly pressed
 * ten minutes ago was still one click from spending. This disarms it
 * after a moment of nothing.
 */
export function useAutoDisarm(active: boolean, disarm: () => void, ms = 6000): void {
  const disarmRef = useRef(disarm);
  useEffect(() => {
    disarmRef.current = disarm;
  });
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => disarmRef.current(), ms);
    return () => window.clearTimeout(timer);
  }, [active, ms]);
}
