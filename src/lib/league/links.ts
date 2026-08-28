import type { LeagueView } from "./context";

export type LeaguePage =
  | "home"
  | "players"
  | "stats"
  | "schedule"
  | "teams"
  | "captain"
  | "my-team"
  | "scouting"
  | "fpldle";

const PREMIER_PATHS: Record<Exclude<LeaguePage, "home">, string> = {
  players: "/players",
  stats: "/stats",
  schedule: "/schedule",
  teams: "/teams",
  captain: "/captain",
  "my-team": "/my-team",
  scouting: "/my-team/scouting",
  fpldle: "/fpldle",
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

const PAIRED_PREFIXES = [
  ["/fpldle", "/academy/fpldle"],
  ["/my-team/scouting", "/academy/my-team/scouting"],
  ["/my-team", "/academy/my-team"],
  ["/players", "/academy/players"],
  ["/teams", "/academy/teams"],
  ["/schedule", "/academy/schedule"],
  ["/stats", "/academy/stats"],
  ["/", "/academy"],
] as const;

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesPairedPath(pathname: string, premier: string, academy: string): boolean {
  if (premier === "/") return pathname === premier || pathname === academy;
  return hasPathPrefix(pathname, premier) || hasPathPrefix(pathname, academy);
}

export function resolveLeagueFromPath(pathname: string): LeagueView {
  return pathname === "/academy" || pathname.startsWith("/academy/") ? "academy" : "premier";
}

export function pairedLeagueHref(pathname: string, target: LeagueView, search = ""): string {
  const match = PAIRED_PREFIXES.find(([premier, academy]) =>
    matchesPairedPath(pathname, premier, academy),
  );

  if (!match) return target === "academy" ? "/academy" : "/";

  const [premier, academy] = match;
  const source = hasPathPrefix(pathname, academy) ? academy : premier;
  const destination = target === "academy" ? academy : premier;
  const suffix = pathname.slice(source.length);
  const href = `${destination}${suffix}`;
  return search ? `${href}?${search.replace(/^\?/, "")}` : href;
}
