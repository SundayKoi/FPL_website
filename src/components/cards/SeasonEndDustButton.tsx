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
      if (!window.confirm(`Dust this copy for ${(quote.value ?? 0).toLocaleString("en-US")} betting dollars? This cannot be undone.`)) return;
      const result = await dustSeasonEndCopyAction(inventoryId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={busy} onClick={dust} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline disabled:opacity-50">{busy ? "Dusting…" : "Dust copy"}</button>
      {error ? <span role="alert" className="text-xs text-coral">{error}</span> : null}
    </span>
  );
}
