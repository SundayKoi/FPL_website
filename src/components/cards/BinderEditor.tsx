"use client";

// The owner's side of the binder: six slots, each a picker over their own
// copies, plus the share link.
//
// Optimistic on purpose — a pin is cosmetic and instantly reversible, so
// waiting on a round trip to redraw a dropdown would be the slower, worse
// version of the same thing. A rejected write rolls the slot back and says
// why.

import { useState, useTransition } from "react";
import { setBinderSlotAction, setBinderTitleAction } from "@/lib/binder/actions";
import { editionLabel } from "@/lib/packs/week";
import { tierLabel } from "./CardCopyPreview";

export interface BinderOption {
  inventoryId: number;
  playerName: string;
  editionWeek: string;
  tier: string;
  foil: boolean;
  signed: boolean;
}

/** "Jinx · Challenger · WK Aug 17 · Foil" — enough to tell two copies of
 *  one player apart, which is the whole reason a picker is needed. */
function optionLabel(option: BinderOption): string {
  const parts = [option.playerName, tierLabel(option.tier)];
  if (option.editionWeek) parts.push(editionLabel(option.editionWeek));
  if (option.foil) parts.push("Foil");
  if (option.signed) parts.push("Signed");
  return parts.join(" · ");
}

export default function BinderEditor({
  slots,
  options,
  token,
  title,
}: {
  /** slot number -> the copy pinned there, or null. Always length 6. */
  slots: (number | null)[];
  options: BinderOption[];
  token: string;
  title: string | null;
}) {
  const [picked, setPicked] = useState(slots);
  const [name, setName] = useState(title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  function choose(index: number, value: string) {
    const inventoryId = value === "" ? null : Number(value);
    const previous = picked;
    const next = picked.map((current, slot) => {
      if (slot === index) return inventoryId;
      // A copy can only sit in one slot; moving it empties the old one so
      // the UI matches what the server does.
      return inventoryId !== null && current === inventoryId ? null : current;
    });
    setPicked(next);
    setError(null);
    startTransition(async () => {
      const result = await setBinderSlotAction(index + 1, inventoryId);
      if (!result.ok) {
        setPicked(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section id="binder" aria-labelledby="binder-heading" className="scroll-mt-24 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="binder-heading" className="type-display text-2xl sm:text-3xl">
          Your binder
        </h2>
        <span className="text-xs uppercase tracking-[0.16em] text-steel">Public by link</span>
      </div>
      <p className="max-w-2xl text-sm text-steel">
        Pick up to six copies to put on display. Anyone with the link can see them — the rest of your
        collection stays private.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Binder name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => startTransition(async () => {
              const result = await setBinderTitleAction(name);
              if (!result.ok) setError(result.error);
            })}
            maxLength={60}
            placeholder="My binder"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>
        <a
          href={`/binder/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
        >
          View binder ↗
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/binder/${token}`).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="btn-coral px-4 py-2 text-xs"
        >
          {copied ? "Copied ✓" : "Copy share link"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {options.length === 0 ? (
        <p className="text-sm text-steel">
          Nothing to display yet — open a pack and the copies you pull become choosable here.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.length === 0 ? null : picked.map((inventoryId, index) => (
          <label key={index} className="flex flex-col gap-1 text-xs text-steel">
            Slot {index + 1}
            <select
              value={inventoryId ?? ""}
              onChange={(event) => choose(index, event.target.value)}
              className="input-brand px-3 py-2 text-sm"
            >
              <option value="">— empty —</option>
              {options.map((option) => (
                <option key={option.inventoryId} value={option.inventoryId}>
                  {optionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
