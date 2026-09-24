"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dustSeasonEndCopyAction, quoteSeasonEndDustAction } from "@/lib/season-end/commerce-actions";

export default function SeasonEndDustButton({ inventoryId }: { inventoryId: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function dust() {
    setError(null);
    startTransition(async () => {
      const quote = await quoteSeasonEndDustAction(inventoryId);
      if (!quote.ok) { setError(quote.error); return; }
      if (!window.confirm(`Dust this copy for +${(quote.value ?? 0).toLocaleString("en-US")} betting dollars? This cannot be undone.`)) return;
      const result = await dustSeasonEndCopyAction(inventoryId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={dust}
        title="See this copy's dust value before confirming"
        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-steel transition hover:border-coral hover:bg-coral/10 hover:text-coral disabled:opacity-50"
      >
        {busy ? "Checking…" : "Dust copy"}
      </button>
      {error ? <span role="alert" className="text-xs text-coral">{error}</span> : null}
    </span>
  );
}
