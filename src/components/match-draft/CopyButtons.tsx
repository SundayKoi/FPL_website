"use client";

import { useState } from "react";

/** Copies a shareable drafter URL (built from the page's own origin, so it
 *  works on any deploy) with per-button "Copied" feedback. */
export function CopyLinkButton({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`${window.location.origin}${path}`).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

/** The current game's tourney code with a copy button — rendered in the
 *  draft-complete banner so captains go straight from draft to lobby. */
export function TourneyCodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-2 rounded border border-border-subtle/60 bg-canvas/60 px-2.5 py-1.5">
      <code className="font-mono text-sm text-white">{code}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="rounded-full border border-border-strong bg-surface px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
