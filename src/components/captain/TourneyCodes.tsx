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
      className="shrink-0 rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Section 2 of the captain page: tourney codes for the resolved next-match
 * fixture. RLS (match_codes_select) is what actually keeps this private —
 * this component just renders whatever the server handed it, per-fixture,
 * ordered by game number.
 */
export default function TourneyCodes({ codes }: { codes: MatchCode[] }) {
  return (
    <section className="card-brand p-5">
      <h2 className="label-dash">Tourney codes</h2>
      {codes.length === 0 ? (
        <p className="mt-3 text-sm text-steel">
          No codes posted yet — your admin will add them before the match.
        </p>
      ) : (
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
      )}
    </section>
  );
}
