"use client";

// One toast for the whole site.
//
// Buying a card, dusting a stack, placing a bet, answering a trade: every
// one of these used to refresh the page and say nothing. The row vanished,
// the balance moved, and the person who had just spent real dollars was
// left to work out what had happened. This is the "it worked, here is what
// you got" that those flows were missing.
//
// useToast works without a provider (it becomes a no-op), so a component
// can be rendered in a test or a storybook without wiring one up.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  tone?: ToastTone;
  /** How long it stays, ms. Errors linger a little longer. */
  duration?: number;
}

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  notify: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

const MAX_SHOWN = 3;

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-mint/60 text-white",
  error: "border-red-500/60 text-white",
  info: "border-border-strong text-white",
};

const TONE_MARK: Record<ToastTone, string> = { success: "✓", error: "!", info: "·" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const tone = options.tone ?? "success";
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }].slice(-MAX_SHOWN));
      const duration = options.duration ?? (tone === "error" ? 6000 : 4000);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
        data-testid="toasts"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`card-brand pointer-events-auto flex max-w-sm items-start gap-2 px-4 py-3 text-sm shadow-xl ${TONE_CLASS[toast.tone]}`}
          >
            <span aria-hidden="true" className="font-black">
              {TONE_MARK[toast.tone]}
            </span>
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="text-xs text-muted hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `notify("Bought Doug for $120")` — the confirmation a money action owes. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
