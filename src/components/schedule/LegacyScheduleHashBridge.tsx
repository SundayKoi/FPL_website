"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { legacyScheduleHashView, type ScheduleLeague } from "@/lib/schedule/viewState";

export default function LegacyScheduleHashBridge({
  pathname,
  league,
}: {
  pathname: string;
  league: ScheduleLeague;
}) {
  const router = useRouter();
  useEffect(() => {
    const resolveHash = () => {
      const view = legacyScheduleHashView(window.location.hash, league);
      if (!view) return;
      const params = new URLSearchParams(window.location.search);
      // Canonical URL state wins; the compatibility bridge only handles old
      // links that relied on an in-page stage anchor.
      if (params.has("phase") || params.has("week")) return;
      params.set("phase", view.phase);
      if (view.week !== undefined) params.set("week", String(view.week));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    resolveHash();
    window.addEventListener("hashchange", resolveHash);
    return () => window.removeEventListener("hashchange", resolveHash);
  }, [league, pathname, router]);
  return null;
}
