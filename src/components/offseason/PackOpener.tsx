"use client";

// The pack counter: what is left of this week's allowance, the Open button,
// and the five cards that just came out.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { openOffseasonPackAction } from "@/lib/offseason/actions";
import { PACK_PRICE, type OffseasonCopy } from "@/lib/offseason/packs";
import { OffseasonCardShelf } from "./OffseasonCards";

const money = (dollars: number) => `$${dollars.toLocaleString("en-US")}`;

export default function PackOpener({ remaining: initialRemaining }: { remaining: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [pulled, setPulled] = useState<OffseasonCopy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One id per click, kept until an answer arrives: retrying after a lost
  // response gets that pack back instead of buying another.
  const requestId = useRef<string | null>(null);
  const packsLeft = Math.floor(remaining / PACK_PRICE);

  const open = () => {
    requestId.current ??= crypto.randomUUID();
    const id = requestId.current;
    setError(null);
    startTransition(async () => {
      try {
        const result = await openOffseasonPackAction(id);
        requestId.current = null;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setRemaining(result.remaining);
        setPulled(result.copies);
        router.refresh();
      } catch {
        setError("The pack didn't come back. Try again: you won't be charged twice.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted">
          <span className="font-display text-2xl font-bold text-white">{money(remaining)}</span> left this week ·{" "}
          {packsLeft} pack{packsLeft === 1 ? "" : "s"}
        </p>
        <button type="button" onClick={open} disabled={pending || packsLeft === 0} className="btn-primary px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
          {pending ? "Opening…" : `Open a pack · ${money(PACK_PRICE)}`}
        </button>
        {packsLeft === 0 ? <p className="text-sm text-muted">This week&apos;s allowance is spent. It resets on Monday.</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {pulled ? (
        <section aria-label="Your pack" className="flex flex-col gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Your pack</h3>
          <OffseasonCardShelf copies={pulled} reveal />
        </section>
      ) : null}
    </div>
  );
}
