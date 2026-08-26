"use client";

// "Hover to tilt" is a lie on a phone — there is no hover there, and the card
// is driven by the gyroscope instead. The wording has to be chosen on the
// client, because the server has no idea which kind of device is asking.
//
// `hover: none` is the honest question: not screen width, which says nothing
// about whether a pointer exists, and not a user-agent sniff.

import { useSyncExternalStore } from "react";

const QUERY = "(hover: none)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

function isTouch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

/** The server can't know the device, so it renders the pointer wording and the
 *  client corrects it on hydration. Pointer devices — most first loads — never
 *  see a change at all. */
function serverSnapshot(): boolean {
  return false;
}

export default function TiltHint() {
  const touch = useSyncExternalStore(subscribe, isTouch, serverSnapshot);

  return (
    <p className="text-xs text-steel">
      {touch ? "Tilt your phone · tap to flip" : "Hover to tilt · click to flip"}
    </p>
  );
}
