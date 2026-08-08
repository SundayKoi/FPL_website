"use client";
import { useEffect } from "react";

const FRIENDLY: Record<string, string> = {
  BID_TOO_LOW: "Too slow — someone raised first.",
  LOT_EXPIRED: "Too late — the hammer already fell.",
  OVER_CAP: "That bid would strand a roster slot.",
  NOT_YOUR_TURN: "It's not your nomination.",
  NOT_LIVE: "The draft isn't live right now.",
  NOT_CAPTAIN: "You're not a captain in this draft.",
  PLAYER_TAKEN: "That player is already taken.",
  ROLE_FILLED: "You already have that role filled.",
  LOT_CLOSED: "That auction is already over.",
  ALREADY_LEADING: "You already hold the high bid.",
  LOT_OPEN_EXISTS: "An auction is already running.",
  NOT_ADMIN: "Admin access required.",
};

/** Map a raw RPC error (via errCode) to a friendly message. */
export function friendly(code: string): string {
  return FRIENDLY[code] ?? code;
}

export default function Toast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg border border-red-800 bg-red-950/95 px-4 py-3 text-sm text-red-100 shadow-lg">
      {message}
    </div>
  );
}
