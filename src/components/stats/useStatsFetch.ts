"use client";

import { useEffect, useState } from "react";

export type FetchStatus = "loading" | "loaded" | "error";

/**
 * Shared fetch scaffold for the stats tabs: owns the loading/loaded/error
 * status, the render-phase "flip back to loading" reset, and the
 * cancelled-flag effect around a queries.ts fetcher.
 *
 * `load` must be referentially stable across renders (wrap it in
 * `useCallback` keyed on the fetch inputs) — the effect refetches whenever
 * its identity changes, mirroring the dependency arrays the tabs used
 * before extraction. `resetKey` (e.g. `${season}::${phase}`) controls when
 * status flips back to "loading". `data` keeps the previous fetch's result
 * while a refetch is in flight (same as the tabs' original rows state) and
 * is null only until the first load resolves.
 */
export function useStatsFetch<T>(
  load: () => Promise<T>,
  resetKey: string,
): { data: T | null; status: FetchStatus } {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<FetchStatus>("loading");
  // Render-phase adjust (see useCountdown): when the reset key changes,
  // flip back to "loading" synchronously during render instead of via a
  // setState call in the effect body (react-hooks/set-state-in-effect
  // forbids the latter).
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setStatus("loading");
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const result = await load();
        if (cancelled) return;
        setData(result);
        setStatus("loaded");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { data, status };
}
