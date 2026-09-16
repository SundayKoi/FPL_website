"use client";

import { useSyncExternalStore } from "react";

let currentTime = 0;
let stopClock: (() => void) | undefined;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!stopClock) {
    const update = () => {
      currentTime = Date.now();
      listeners.forEach((listener) => listener());
    };
    const immediate = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    stopClock = () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      stopClock?.();
      stopClock = undefined;
      currentTime = 0;
    }
  };
}

const getSnapshot = () => currentTime;
const getServerSnapshot = () => 0;

/** A shared one-second clock; zero until the first browser tick. */
export function useSecondClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
