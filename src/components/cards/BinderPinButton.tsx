"use client";

// "Put this one in my binder", from the shelf where the card already is.
//
// The slot editor asks two questions — which card, and which of six slots.
// Only the first one is ever really on someone's mind, so this asks that
// one and fills the lowest free slot itself.
//
// Optimistic: pinning is cosmetic and instantly reversible, so the star
// flips on click and rolls back if the server refuses. The refusal that
// actually happens is a full binder, which is a normal state rather than
// an error, so it is said in place rather than thrown.

import { useState, useTransition } from "react";
import { toggleBinderCardAction } from "@/lib/binder/actions";

export default function BinderPinButton({
  inventoryId,
  pinned: initiallyPinned,
  playerName,
}: {
  inventoryId: number;
  pinned: boolean;
  playerName: string;
}) {
  const [pinned, setPinned] = useState(initiallyPinned);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <span className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={pinned ? `Take ${playerName} out of your binder` : `Put ${playerName} in your binder`}
        title={pinned ? "In your binder — click to remove" : "Add to your binder"}
        disabled={busy}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setError(null);
          startTransition(async () => {
            const result = await toggleBinderCardAction(inventoryId);
            if (!result.ok) {
              setPinned(!next);
              setError(result.error);
            }
          });
        }}
        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-60 ${
          pinned
            ? "border-gold bg-gold/20 text-gold"
            : "border-border bg-surface text-muted hover:border-gold/60 hover:text-gold"
        }`}
      >
        {pinned ? "★ In binder" : "☆ Binder"}
      </button>
      {error ? <span className="max-w-[12rem] text-center text-[10px] leading-4 text-red-400">{error}</span> : null}
    </span>
  );
}
