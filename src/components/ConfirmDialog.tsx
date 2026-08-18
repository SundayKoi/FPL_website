"use client";
import { useEffect, type ReactNode } from "react";

/** Branded centered confirmation modal (replaces native confirm()). */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="card-brand w-full max-w-sm p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="label-dash !text-coral">{title}</h3>
        <div className="mt-3 text-white">{children}</div>
        <div className="mt-6 flex justify-center gap-3">
          <button
            className="rounded border border-line px-4 py-2 text-sm text-steel hover:bg-steel/10 hover:text-white"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            autoFocus
            className="btn-coral px-4 py-2 text-sm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
