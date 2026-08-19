"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from 0 the first time it scrolls into view (and
 * again whenever `value` changes). Server-rendering and reduced-motion
 * visitors just see the final value — the animation is progressive polish,
 * never a data gate.
 */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CountUp({
  value,
  decimals = 0,
  duration = 900,
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Only meaningful while armed — until then the real value renders directly,
  // so SSR and no-JS visitors never see a zero.
  const [display, setDisplay] = useState(0);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!armed) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, value, duration]);

  return (
    <span ref={ref} className={className}>
      {(armed ? display : value).toFixed(decimals)}
      {suffix}
    </span>
  );
}
