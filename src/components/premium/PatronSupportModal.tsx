"use client";

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from "react";
import PatronPerks from "@/components/patron/PatronPerks";
import { PATRON_PAYPAL_HREF, PATRON_VENMO_LINKS } from "@/lib/patron/links";

export default function PatronSupportModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const dialogId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        className="btn-pill inline-flex items-center gap-2 px-4 py-2 text-xs uppercase tracking-[0.14em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        Become a patron <span aria-hidden="true">↗</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={onBackdropClick}
          id={dialogId}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="card-brand my-auto w-full max-w-3xl p-5 sm:p-7">
            <header className="flex items-start justify-between gap-4 border-b border-border/70 pb-5">
              <div>
                <span className="label-dash">Keep the league burning</span>
                <h2 id={titleId} className="type-display mt-2 text-3xl sm:text-4xl">
                  Become a patron
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Support the people building FPL for $3–$5 per month. Pick whatever level feels right; every bit
                  helps cover website costs, hosting, broadcasts, and tools.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close patron details"
                className="shrink-0 rounded-full border border-border bg-canvas/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted transition hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Close ×
              </button>
            </header>

            <div className="mt-5">
              <PatronPerks variant="full" />
            </div>

            <div className="mt-5 border-t border-border/70 pt-5">
              <span className="label-dash">Choose a way to support</span>
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={PATRON_PAYPAL_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-pill inline-flex items-center gap-2 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  PayPal · Zachari <span aria-hidden="true">↗</span>
                </a>
                {PATRON_VENMO_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-canvas/60 px-4 py-2 text-sm font-semibold text-muted transition hover:border-primary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                  >
                    Venmo · {link.name} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-muted">
                After sending support, tell a dev your Discord username so they can light your patron flame.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
