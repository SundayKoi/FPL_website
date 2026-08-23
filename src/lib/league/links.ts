import type { LeagueView } from "./context";

export type LeaguePage = "home" | "players" | "stats" | "schedule" | "teams" | "captain" | "scouting";

const PREMIER_PATHS: Record<Exclude<LeaguePage, "home">, string> = {
  players: "/players",
  stats: "/stats",
  schedule: "/schedule",
  teams: "/teams",
  captain: "/captain",
  scouting: "/captain/scouting",
};

export function leaguePath(page: LeaguePage, view: LeagueView): string {
  if (page === "home") return view === "academy" ? "/academy" : "/";
  const path = PREMIER_PATHS[page];
  return view === "academy" ? `/academy${path}` : path;
}

export function leaguePageLinks(
  page: LeaguePage,
  view: LeagueView,
  params: Record<string, string | undefined> = {},
): { premier: string; academy: string } {
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();
  const suffix = query ? `?${query}` : "";
  return {
    premier: `${leaguePath(page, "premier")}${suffix}`,
    academy: `${leaguePath(page, "academy")}${suffix}`,
  };
}
