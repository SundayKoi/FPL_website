"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveThemeLeague } from "@/lib/league/theme";

export default function LeagueThemeScope({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const league = resolveThemeLeague(pathname, searchParams?.toString() ?? "");

  return (
    <div data-league={league} className="contents">
      {children}
    </div>
  );
}
