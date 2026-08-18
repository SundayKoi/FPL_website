"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/betting", label: "Markets" },
  { href: "/admin/betting/props", label: "Props" },
  { href: "/admin/betting/pickems", label: "Pick'em" },
  { href: "/admin/betting/catalog", label: "Catalog" },
  { href: "/admin/betting/users", label: "Users" },
  { href: "/admin/betting/seasons", label: "Seasons" },
] as const;

function isActive(pathname: string | null, href: string) {
  if (href === "/admin/betting") return pathname === "/admin/betting";
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export default function AdminBettingTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Betting admin" className="border-b border-line bg-panel/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-1 px-4 py-2 sm:px-6">
        <span className="label-dash mr-3">Betting admin</span>
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-coral/10 font-semibold text-coral"
                  : "text-steel hover:bg-line/40 hover:text-white"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
