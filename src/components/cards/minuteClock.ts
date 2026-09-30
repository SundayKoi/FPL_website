// The wall clock to the minute, as an external store. A plain module (no
// "use client"): the hook is only ever called from client components.

import { useSyncExternalStore } from "react";

/** The clock as a store, to the minute: 0 on the server (no clock there),
 *  the wall clock once hydrated. Nothing subscribes — a bench that lifts
 *  mid-view lifts on the next render, which is fine for a chip. */
function subscribeNever(): () => void {
  return () => {};
}
let minuteCache = 0;
function readMinute(): number {
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  if (minute !== minuteCache) minuteCache = minute;
  return minuteCache;
}
function readServerMinute(): number {
  return 0;
}

/** The current minute as epoch ms — 0 during the server render and
 *  hydration, so the HTML never depends on the reader's clock. */
export function useMinute(): number {
  return useSyncExternalStore(subscribeNever, readMinute, readServerMinute);
}
