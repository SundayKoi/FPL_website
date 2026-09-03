"use client";

import type { ReactNode } from "react";
import { useUrlState } from "@/lib/ui/useUrlState";

/** "stages=week_1,-playoffs": a stage you opened, a stage you closed. Only
 *  the ones you touched are listed, so a fresh link still opens the way the
 *  page decided it should. */
function parseStages(value: string): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const entry of value.split(",").filter(Boolean)) {
    if (entry.startsWith("-")) out.set(entry.slice(1), false);
    else out.set(entry, true);
  }
  return out;
}

function serializeStages(stages: Map<string, boolean>): string {
  return [...stages.entries()].map(([id, open]) => (open ? id : `-${id}`)).join(",");
}

export default function CollapsibleScheduleStage({
  stageId,
  label,
  note,
  initiallyOpen,
  children,
}: {
  stageId: string;
  label: string;
  note: string;
  initiallyOpen: boolean;
  children: ReactNode;
}) {
  const [view, setView] = useUrlState({ stages: "" });
  const touched = parseStages(view.stages);
  const isOpen = touched.has(stageId) ? touched.get(stageId)! : initiallyOpen;
  const contentId = `${stageId}-content`;

  function toggle() {
    // Start from the live URL so sibling stages' choices survive ours.
    const current = parseStages(new URLSearchParams(window.location.search).get("stages") ?? "");
    const next = !isOpen;
    if (next === initiallyOpen) current.delete(stageId);
    else current.set(stageId, next);
    setView({ stages: serializeStages(current) });
  }

  return (
    <div id={stageId} className="card-brand scroll-mt-24 overflow-hidden">
      <div className="border-b border-border-subtle">
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={isOpen}
          onClick={toggle}
          className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left hover:bg-surface/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          <span className="type-display text-xl">{label}</span>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span>{note}</span>
            <span aria-hidden className="text-base leading-none text-action-text">
              {isOpen ? "−" : "+"}
            </span>
          </span>
        </button>
      </div>
      {isOpen ? <div id={contentId}>{children}</div> : null}
    </div>
  );
}
