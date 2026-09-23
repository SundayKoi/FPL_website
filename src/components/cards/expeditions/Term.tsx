"use client";

// A game word, explained where it is used. The plain word is a button; a
// tap opens one or two sentences from glossary.ts and a link to the rules
// tab. Every game word above the fold on the expedition board is either
// one of these or follows its plain word.
//
// The popover is `position: fixed`, placed from the button's rectangle and
// clamped to the viewport, so a term at the right edge of a phone screen
// never widens the page. It closes on Escape, on a tap elsewhere and on
// scroll (a fixed box would otherwise float away from its word).
//
// Everything renders as spans: a Term sits inside running text, often in a
// <p>, and a <div> there would be invalid HTML and a hydration error.

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/expeditions/glossary";

/** The event the drawer listens for: open the Rules tab and show it. */
export const OPEN_RULES_EVENT = "expeditions:open-rules";

const POPOVER_WIDTH = 320;
const EDGE = 16;

export default function Term({
  term,
  children,
  extra,
  variant = "inline",
  className = "",
  testId,
  buttonTestId,
}: {
  term: GlossaryKey;
  /** The visible word. Defaults to the glossary's plain label. */
  children?: ReactNode;
  /** More about THIS use of the word — this week's weather, say. */
  extra?: ReactNode;
  /** `inline` sits in a sentence; `chip` is a small bordered pill. */
  variant?: "inline" | "chip";
  className?: string;
  /** On the wrapper (which also holds the definition). */
  testId?: string;
  /** On the button alone. */
  buttonTestId?: string;
}) {
  const entry = GLOSSARY[term];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const wrapper = useRef<HTMLSpanElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect || typeof window === "undefined") return;
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
    // Below the word when there is room, above it when the word is low on
    // the screen — a popover that opens off the bottom is a popover nobody
    // reads on a phone.
    const below = rect.bottom + 8;
    setStyle(
      window.innerHeight - below < 180 && rect.top > 200
        ? { left, width, bottom: window.innerHeight - rect.top + 8 }
        : { left, width, top: below },
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true, capture: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const label = children ?? entry.label;
  const heading = entry.label.charAt(0).toUpperCase() + entry.label.slice(1);

  return (
    <span ref={wrapper} data-term={term} data-testid={testId} className={variant === "chip" ? "inline-flex" : "inline"}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        data-testid={buttonTestId}
        onClick={() => {
          if (!open) place();
          setOpen((value) => !value);
        }}
        className={
          variant === "chip"
            ? `inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border border-line bg-panel/80 px-3 text-left text-xs text-white transition hover:border-steel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`
            : // The hit area is 44px tall and 24px wider than the word, but
              // the negative margins give the line back exactly that space:
              // the word sits in its sentence as if it were plain text, and
              // lines are not pushed apart.
              `-mx-3 -my-3 inline-flex min-h-11 min-w-11 items-center justify-center px-3 align-baseline underline decoration-dotted decoration-steel/70 underline-offset-4 transition hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus ${className}`
        }
      >
        {label}
      </button>
      <span id={id} role="note" hidden={!open} className="term-popover" style={style}>
        <span className="block text-xs font-bold uppercase tracking-[0.14em] text-gold">{heading}</span>
        <span className="mt-1 block text-sm text-white">{entry.says}</span>
        {extra ? <span className="mt-1.5 block text-xs text-steel">{extra}</span> : null}
        <a
          href="#expedition-rules"
          onClick={(event) => {
            event.preventDefault();
            setOpen(false);
            window.dispatchEvent(new CustomEvent(OPEN_RULES_EVENT));
          }}
          className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-coral underline-offset-4 hover:underline"
        >
          More in the rules →
        </a>
      </span>
    </span>
  );
}
