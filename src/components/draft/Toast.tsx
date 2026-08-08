"use client";
import { useEffect } from "react";

const FRIENDLY: Record<string, string> = {
  BID_TOO_LOW: "Too slow — someone raised first.",
  LOT_EXPIRED: "Too late — the hammer already fell.",
  OVER_CAP: "That bid would strand a roster slot.",
  NOT_YOUR_TURN: "It's not your nomination.",
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
