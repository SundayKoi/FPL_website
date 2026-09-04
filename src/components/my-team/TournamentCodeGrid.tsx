"use client";

import { useState } from "react";
import type { MatchCode } from "@/lib/captain/queries";
import { buildTournamentCodeSlots } from "@/lib/my-team/presentation";
import type { FixtureRow } from "@/lib/schedule/types";

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access is optional; the posted code remains visible.
    }
  }
  return <button type="button" aria-label={`${copied ? "Copied" : "Copy"} ${label}`} onClick={() => void copy()} className="shrink-0 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{copied ? "Copied" : "Copy"}</button>;
}

export function TournamentCodeGrid({ fixture, codes }: { fixture: FixtureRow | null; codes: MatchCode[] }) {
  const [copiedAll, setCopiedAll] = useState(false);

  if (!fixture) {
    return <section className="card-brand p-5" aria-label="Tournament codes"><p className="label-dash">Tournament codes</p><p className="mt-3 text-sm text-muted">No upcoming match. Tournament codes will appear here when a fixture is posted.</p></section>;
  }

  const slots = buildTournamentCodeSlots(codes, fixture.best_of);
  const posted = slots.flatMap((slot) => slot.code ? [slot.code] : []);
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(posted.map((code) => code.code).join("\n"));
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // Clipboard access is optional; the posted codes remain visible.
    }
  }

  return (
    <section className="card-brand p-5" aria-label="Tournament codes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="label-dash">Tournament codes</p><h2 className="mt-1 type-display text-2xl">Series code grid</h2></div>
        {posted.length > 0 ? <button type="button" onClick={() => void copyAll()} className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:border-action-text hover:text-action-text">{copiedAll ? "Copied" : "Copy all"}</button> : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {slots.map((slot) => (
          <article key={slot.gameNumber} className="flex min-h-28 flex-col justify-between rounded border border-border-subtle/60 bg-canvas/60 p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs uppercase tracking-wide text-prestige">Game {slot.gameNumber}</span>{slot.code ? <CopyButton label={`Game ${slot.gameNumber}`} text={slot.code.code} /> : null}</div>
            {slot.code ? <code className="mt-4 break-all font-mono text-sm text-white">{slot.code.code}</code> : <p className="mt-4 text-sm text-muted">Not posted yet</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
