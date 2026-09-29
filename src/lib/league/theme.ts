import type { LeagueView } from "./context";
import { resolveLeagueFromPath } from "./links";

/**
 * Resolve the league whose identity should color the shared application shell.
 *
 * Most routes carry their league in the pathname. Shared Premium and match
 * detail routes use `league` to keep their header context aligned with the
 * server-resolved page.
 */
export function resolveThemeLeague(pathname: string, search: string): LeagueView {
  if (pathname === "/premium" || pathname.startsWith("/match/")) {
    const params = new URLSearchParams(search.replace(/^\?/, ""));
    if (params.get("league") === "academy") return "academy";
  }

  return resolveLeagueFromPath(pathname);
}
