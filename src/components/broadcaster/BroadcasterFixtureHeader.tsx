"use client";

import { useState } from "react";
import { matchDraftOverlayHref } from "@/lib/match-draft/rules";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

export default function BroadcasterFixtureHeader({
  fixture,
  twitchUrl,
}: {
  fixture: FixtureRow;
  twitchUrl: string | null;
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
        {fixture.team_a ?? "TBD"} <span className="text-steel">vs</span> {fixture.team_b ?? "TBD"}
      </h1>
      <p className="mt-2 text-sm text-steel">
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
        className="rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
      >
        Open draft
      </a>
      <button
        type="button"
        onClick={() => void copyOverlayUrl()}
        className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-gold hover:text-gold"
      >
        {copyState === "copied" ? "Copied ✓" : "Copy OBS overlay"}
      </button>
      {twitchUrl ? <a
        href={twitchUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-pink hover:text-pink"
      >
        Watch on Twitch
      </a> : null}
      {copyState === "failed" && (
        <label className="flex flex-col gap-1 text-xs text-steel">
          OBS overlay URL
          <input aria-label="OBS overlay URL" readOnly value={fallbackUrl} className="input-brand px-2 py-2" />
        </label>
      )}
    </div>
  </header>;
}
