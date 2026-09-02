import type { LeagueView } from "./context";
import { resolveLeagueFromPath } from "./links";

/**
 * Resolve the league whose identity should color the shared application shell.
 *
 * Most routes carry their league in the pathname. Premium HQ is intentionally
 * shared, so its `league` query parameter is the one query-string override.
 */
export function resolveThemeLeague(pathname: string, search: string): LeagueView {
  if (pathname === "/premium") {
    const params = new URLSearchParams(search.replace(/^\?/, ""));
    if (params.get("league") === "academy") return "academy";
  }

  return resolveLeagueFromPath(pathname);
}
