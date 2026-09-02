"use client";

import { useState, type RefObject } from "react";
import { matchDraftOverlayHref } from "@/lib/match-draft/rules";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

export default function BroadcasterFixtureHeader({
  fixture,
  twitchUrl,
  onOpenHeadToHead,
  headToHeadTriggerRef,
}: {
  fixture: FixtureRow;
  twitchUrl: string | null;
  onOpenHeadToHead?: () => void;
  headToHeadTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const meta = stageMeta(fixture.stage);

  const copyOverlayUrl = async () => {
    const path = matchDraftOverlayHref(fixture);
    const absoluteUrl = new URL(path, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopyState("copied");
    } catch {
      setFallbackUrl(absoluteUrl);
      setCopyState("failed");
    }
  };

  return <header className="card-brand flex flex-wrap items-center justify-between gap-4 p-5">
    <div>
      <p className="label-dash text-gold">Fixture</p>
      <h1 className="type-display mt-1 text-2xl sm:text-3xl">
        {fixture.team_a ?? "TBD"} <span className="text-muted">vs</span> {fixture.team_b ?? "TBD"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {formatKickoff(fixture.scheduled_at)} · Bo{fixture.best_of} · {meta.label}
        {fixture.division ? ` · ${fixture.division} division` : ""}
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" aria-live="polite" className="sr-only">
        {copyState === "copied"
          ? "OBS overlay URL copied"
          : copyState === "failed"
            ? "Clipboard unavailable. Copy the OBS overlay URL from the field."
            : ""}
      </span>
      <a
        href={matchDraftOverlayHref(fixture)}
        className="rounded-full border border-primary/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary hover:text-white"
      >
        Open draft
      </a>
      {onOpenHeadToHead ? <button
        ref={headToHeadTriggerRef}
        type="button"
        onClick={onOpenHeadToHead}
        aria-haspopup="dialog"
        className="btn-rivalry rounded-full px-3 py-1.5 text-xs uppercase tracking-wide"
      >
        Head-to-head
      </button> : null}
      <button
        type="button"
        onClick={() => void copyOverlayUrl()}
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-primary hover:text-primary"
      >
        {copyState === "copied" ? "Copied ✓" : "Copy OBS overlay"}
      </button>
      {twitchUrl ? <a
        href={twitchUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-primary hover:text-primary"
      >
        Watch on Twitch
      </a> : null}
      {copyState === "failed" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          OBS overlay URL
          <input aria-label="OBS overlay URL" readOnly value={fallbackUrl} className="input-brand px-2 py-2" />
        </label>
      )}
    </div>
  </header>;
}
