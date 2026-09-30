// Shared pieces of the offseason pages. The whole folder is temporary:
// docs/offseason.md has the removal checklist.

import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_LABELS_SHORT, type LolRole } from "@/lib/draft/types";

type NavKey = "overview" | "signup" | "admin";

export function OffseasonShell({
  eyebrow = "FPL Offseason",
  title,
  description,
  active,
  isStaff = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  active?: NavKey;
  isStaff?: boolean;
  children: ReactNode;
}) {
  const links: { key: NavKey; href: string; label: string }[] = [
    { key: "overview", href: "/offseason", label: "Overview" },
    { key: "signup", href: "/offseason/signup", label: "Sign up" },
    // Presentation only: /offseason/admin checks staff itself, and every
    // write it makes is checked again by the database.
    ...(isStaff ? [{ key: "admin" as const, href: "/offseason/admin", label: "Admin" }] : []),
  ];
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{eyebrow}</p>
          <h1 className="type-display mt-2 text-3xl sm:text-4xl">{title}</h1>
          {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</div> : null}
        </div>
        <nav aria-label="Offseason" className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              aria-current={active === link.key ? "page" : undefined}
              className={
                active === link.key
                  ? "rounded-full border border-action-text bg-action-fill/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                  : "rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-white"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </main>
  );
}

export function Panel({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="card-brand flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="type-display text-xl">
          {title}
        </h2>
        {aside ? <div className="text-xs text-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function RoleTag({ role }: { role: LolRole | null }) {
  return (
    <span className="inline-flex min-w-10 justify-center rounded border border-border-subtle bg-canvas px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-muted">
      {role ? ROLE_LABELS_SHORT[role] : "—"}
    </span>
  );
}

export function Overall({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted">—</span>;
  return <span className="font-display font-bold tabular-nums text-white">{value}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export const tableClass = "w-full min-w-[32rem] border-collapse text-left text-sm";
export const thClass = "border-b border-border-subtle px-2 py-2 text-[0.7rem] font-bold uppercase tracking-wide text-muted";
export const tdClass = "border-b border-border-subtle/60 px-2 py-2 align-middle";

/** An http(s) link a player typed, or null — never a javascript: URL. */
export function safeLink(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
