"use client";

// Pieces every offseason admin panel shares. The panels are presentation:
// each button calls a server action, and the database decides whether the
// caller is staff and whether the change is allowed.

import { useState, useTransition } from "react";
import type { DraftStatus } from "@/lib/draft/types";
import type { OffseasonActionResult } from "@/lib/offseason/actions";
import type { RatingSummary } from "@/lib/offseason/order";
import type { OffseasonEventData } from "@/lib/offseason/types";

/** The event as the admin console receives it: plain data, ratings summarised. */
export interface OffseasonAdminData extends OffseasonEventData {
  ratings: Record<string, RatingSummary>;
  drafts: Record<string, { name: string; status: DraftStatus }>;
}

export type ActionMessageState = { kind: "error" | "done"; text: string } | null;

export function useOffseasonAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionMessageState>(null);
  const run = (action: () => Promise<OffseasonActionResult>, done?: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage(done ? { kind: "done", text: done } : null);
        after?.();
      } else {
        setMessage({ kind: "error", text: result.error });
      }
    });
  return { pending, message, setMessage, run };
}

export function ActionMessage({ message }: { message: ActionMessageState }) {
  if (!message) return null;
  return (
    <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}>
      {message.text}
    </p>
  );
}

export const inputClass = "input-brand px-2 py-1.5 text-sm";
export const smallInputClass = "input-brand px-2 py-1 text-xs";
export const buttonClass =
  "rounded border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-content hover:border-action-text hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
export const primaryButtonClass = "btn-primary px-4 py-2 text-xs uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40";
export const dangerButtonClass =
  "rounded border border-danger/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";
export const labelClass = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted";
