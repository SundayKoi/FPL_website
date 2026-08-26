"use client";

import { useState } from "react";
import type { MatchCode } from "@/lib/captain/queries";

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyAllButton({ codes }: { codes: MatchCode[] }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(codes.map((code) => code.code).join("\n")).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
    >
      {copied ? "Copied" : "Copy all"}
    </button>
  );
}

/**
 * Tourney codes for the resolved My Team next-match fixture. RLS
 * (match_codes_select) is what actually keeps this private —
 * this component just renders whatever the server handed it, per-fixture,
 * ordered by game number.
 */
export default function TourneyCodes({ codes }: { codes: MatchCode[] }) {
  return (
    <details className="card-brand group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-coral [&::-webkit-details-marker]:hidden">
        <span role="heading" aria-level={2} className="label-dash">Tourney codes</span>
        <span aria-hidden className="text-xl leading-none text-coral transition group-open:rotate-45">+</span>
      </summary>
      <section aria-label="Tourney codes" className="border-t border-line px-5 pb-5 pt-4">
        {codes.length === 0 ? (
          <p className="mt-3 text-sm text-steel">
            No codes posted yet — a captain or admin will add them before the match.
          </p>
        ) : (
          <>
            <div className="flex justify-end">
              <CopyAllButton codes={codes} />
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {codes.map((code) => (
                <li
                  key={code.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-line/60 bg-navy/60 px-3 py-2"
                >
                  <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-steel">
                    Game {code.game_number}
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-sm text-white">{code.code}</code>
                  {code.note && <span className="w-full text-xs text-steel sm:w-auto">{code.note}</span>}
                  <CopyButton code={code.code} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </details>
  );
}
