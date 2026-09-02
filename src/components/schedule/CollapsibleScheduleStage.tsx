"use client";

import { useState, type ReactNode } from "react";

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
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const contentId = `${stageId}-content`;

  return (
    <div id={stageId} className="card-brand scroll-mt-24 overflow-hidden">
      <div className="border-b border-border">
        <button
          type="button"
          aria-controls={contentId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left hover:bg-surface/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        >
          <span className="type-display text-xl">{label}</span>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span>{note}</span>
            <span aria-hidden className="text-base leading-none text-primary">
              {isOpen ? "−" : "+"}
            </span>
          </span>
        </button>
      </div>
      {isOpen ? <div id={contentId}>{children}</div> : null}
    </div>
  );
}
