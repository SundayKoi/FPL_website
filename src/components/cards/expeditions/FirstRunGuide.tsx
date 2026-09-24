"use client";

// The first-visit guide: three lines above the stepper for a collector who
// has never sent a squad, and the one button that does the first round for
// them. Dismissed into localStorage — presentation only, so a cleared
// browser simply sees it again.

import { useState, useSyncExternalStore } from "react";
import ExpeditionIcon from "../expeditionIcons";
import Term from "./Term";

export const GUIDE_KEY = "expeditions:guide:v1";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/** The server cannot know, so it renders the guide; a browser that
 *  dismissed it hides it on hydration. */
function readServer(): boolean {
  return false;
}

export default function FirstRunGuide({
  onSuggest,
  canSuggest,
}: {
  onSuggest: () => void;
  /** Whether three cards are free to suggest. */
  canSuggest: boolean;
}) {
  const stored = useSyncExternalStore(subscribe, readDismissed, readServer);
  const [hidden, setHidden] = useState(false);
  if (stored || hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(GUIDE_KEY, "dismissed");
    } catch {
      // Private mode or storage off: the guide hides for this visit.
    }
  }

  return (
    <section data-testid="guide" aria-labelledby="guide-title" className="card-brand card-featured flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <span className="label-dash">New here</span>
        <h2 id="guide-title" className="type-display mt-1 text-2xl sm:text-3xl">
          Three steps, then come back later
        </h2>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {["Pick three cards.", "Pick a run.", "Send them, and come back in a few hours."].map((line, index) => (
          <li key={line} className="flex items-center gap-3 rounded-lg border border-line bg-canvas/40 px-3 py-2.5 text-sm text-white">
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-content-center rounded-full border border-coral/60 font-mono text-xs font-bold text-coral">
              {index + 1}
            </span>
            {line}
          </li>
        ))}
      </ol>
      <p className="max-w-2xl text-sm text-steel">
        On the way the squad stops at a <Term term="fork">fork</Term> and asks what to do. If you are away, they play it safe.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSuggest}
          disabled={!canSuggest}
          aria-describedby={canSuggest ? undefined : "guide-reason"}
          className="btn-coral min-h-11 px-5 text-sm"
        >
          <ExpeditionIcon name="spark" />
          Suggest a squad and a run
        </button>
        <button type="button" onClick={dismiss} className="min-h-11 min-w-11 px-3 text-sm text-steel underline-offset-4 hover:text-white hover:underline">
          Got it, hide this
        </button>
        {canSuggest ? null : (
          <span id="guide-reason" data-reason className="text-xs text-steel">
            Needs three cards at home.
          </span>
        )}
      </div>
    </section>
  );
}
