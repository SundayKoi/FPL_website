"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true } | { ok: false; error: string } | { ok: true; id: number };
/** Runs an admin action inside the shared transition, surfacing its error or
 * refreshing the page on success — passed down so `busy` (React's isPending)
 * actually covers the network round trip, not just the local state update. */
export type Runner = (action: () => Promise<Result>, onSuccess?: () => void) => void;

/** The transition/error/refresh plumbing every betting admin panel shares:
 * `run` awaits the action, then either surfaces its error or clears it,
 * fires `onSuccess`, and router.refresh()es. */
export function useAdminRun(): { error: string | null; pending: boolean; run: Runner } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run: Runner = (action, onSuccess) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      onSuccess?.();
      router.refresh();
    });
  };

  return { error, pending, run };
}

/** The red banner every betting admin panel renders above its content. */
export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>;
}
