"use client";

// View state that survives the back button.
//
// A filter, a sort, a search box: set them, open a card, come back, and
// they were gone, because they lived in useState and the page remounted.
// This keeps them in the URL instead — read on mount, written with
// history.replaceState (no navigation, no re-render) as they change — so
// the shelf you left is the shelf you return to, and the link you paste is
// the view you were looking at. Defaults are left out of the URL so a
// pasted link stays clean.
//
// Several components on one page can each hold their own keys: a write
// starts from the live URL, not from this hook's state, so two instances
// never clobber each other's params.

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type StringRecord = Record<string, string>;

export function useUrlState<T extends StringRecord>(defaults: T): [T, (patch: Partial<T>) => void] {
  const params = useSearchParams();
  const defaultsRef = useRef(defaults);
  const [state, setState] = useState<T>(() => {
    const initial = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const value = params?.get(key as string);
      if (value !== null && value !== undefined) initial[key] = value as T[keyof T];
    }
    return initial;
  });

  // Mirror into the URL after every change. Reading the live URL rather than
  // building one from scratch keeps other components' params intact.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const key of Object.keys(defaultsRef.current)) {
      const value = state[key];
      if (value === defaultsRef.current[key] || value === "") url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [state]);

  const set = useCallback((patch: Partial<T>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  return [state, set];
}
