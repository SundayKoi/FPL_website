"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DESTINATIONS: Record<string, string> = {
  "#drafts": "/admin/league/drafts",
  "#homepage-controls": "/admin/content#homepage-controls",
  "#daily-stu-controls": "/admin/content#daily-stu-controls",
  "#staff-controls": "/admin/access#staff-controls",
  "#god-pack-preview": "/admin/design#god-pack-preview",
  "#match-reports": "/admin/reviews",
};

export default function AdminLegacyHashBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/admin") return;
    const destination = DESTINATIONS[window.location.hash];
    if (!destination) return;
    const [path, fragment] = destination.split("#");
    const query = new URLSearchParams();
    if (path === "/admin/reviews") {
      const league = searchParams?.get("league");
      const season = searchParams?.get("season");
      if (league === "premier" || league === "academy") query.set("league", league);
      if (season && /^[SA]\d{1,3}$/i.test(season)) query.set("season", season);
    }
    const serialized = query.toString();
    router.replace(`${path}${serialized ? `?${serialized}` : ""}${fragment ? `#${fragment}` : ""}`);
  }, [pathname, router, searchParams]);

  return null;
}
