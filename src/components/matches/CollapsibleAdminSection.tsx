"use client";

import { useState, type ReactNode } from "react";

/** Input style shared by the admin panels' form fields. */
export const adminInputClass =
  "input-brand px-2 py-1.5 text-sm";

/**
 * Shell for the collapsible admin panels (fixtures, rosters, league teams):
 * a card with a full-width toggle header revealing the panel body below a
 * divider. Owns the open/closed state; starts closed.
 */
export default function CollapsibleAdminSection({
  title,
  contentGapClass = "gap-4",
  children,
}: {
  title: string;
  contentGapClass?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-brand overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="label-dash">{title}</span>
        <span aria-hidden="true" className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className={`flex flex-col ${contentGapClass} border-t border-border px-4 py-4`}>
          {children}
        </div>
      )}
    </div>
  );
}
