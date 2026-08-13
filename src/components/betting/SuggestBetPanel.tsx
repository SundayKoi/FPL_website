"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suggestProp } from "@/lib/betting/actions";
import type { PropSuggestion } from "@/lib/betting/types";

const STATUS_STYLE: Record<PropSuggestion["status"], string> = {
  PENDING: "border-line text-steel",
  APPROVED: "border-emerald-400/40 text-emerald-400",
  REJECTED: "border-red-400/40 text-red-400",
};

/** Collapsible "Suggest a bet" box: question + two side labels + optional
 * note, plus the member's recent suggestions with review status. */
export function SuggestBetPanel({ suggestions }: { suggestions: PropSuggestion[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const complete = question.trim().length >= 5 && sideA.trim() && sideB.trim();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await suggestProp(question, sideA, sideB, note || undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQuestion("");
      setSideA("");
      setSideB("");
      setNote("");
      setSent(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-semibold text-white">Custom bets</h2>
          <p className="text-xs text-steel">
            Got a prop in mind — draft prices, milestones, anything two-sided? Suggest it and staff turn it into a market.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSent(false);
          }}
          className="btn-pill ml-auto text-sm"
        >
          {open ? "Close" : "Suggest a bet"}
        </button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs text-steel">
            The question
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
              placeholder="How much will Chime go for in the draft?"
              className="rounded border border-line bg-transparent px-3 py-2 text-sm text-white placeholder:text-steel/60"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-steel">
              Side A
              <input
                value={sideA}
                onChange={(e) => setSideA(e.target.value)}
                maxLength={40}
                placeholder="Over 500"
                className="rounded border border-line bg-transparent px-3 py-2 text-sm text-white placeholder:text-steel/60"
              />
            </label>
            <label className="grid gap-1 text-xs text-steel">
              Side B
              <input
                value={sideB}
                onChange={(e) => setSideB(e.target.value)}
                maxLength={40}
                placeholder="Under 500"
                className="rounded border border-line bg-transparent px-3 py-2 text-sm text-white placeholder:text-steel/60"
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-steel">
            Note for the reviewers (optional — e.g. when it should lock, how it settles)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Lock when the draft starts; settle on final sale price"
              className="rounded border border-line bg-transparent px-3 py-2 text-sm text-white placeholder:text-steel/60"
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {sent && !error && <p className="text-sm text-emerald-400">Sent — staff will review it.</p>}
          <div>
            <button type="button" onClick={submit} disabled={!complete || pending} className="btn-pill text-sm disabled:opacity-40">
              {pending ? "Sending…" : "Send suggestion"}
            </button>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {suggestions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[s.status]}`}>{s.status}</span>
              <span className="text-white">{s.question}</span>
              <span className="text-xs text-steel">
                {s.side_a} / {s.side_b}
              </span>
              {s.status === "REJECTED" && s.reason && <span className="text-xs text-red-400">— {s.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
