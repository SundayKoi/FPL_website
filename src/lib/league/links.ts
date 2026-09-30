import type { LeagueView } from "./context";
import { pairedCardsHref } from "@/lib/cards/sections";

export type LeaguePage =
  | "home"
  | "players"
  | "stats"
  | "standings"
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
  standings: "/standings",
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

const PAIRED_PREFIXES = [
  ["/fpldle", "/academy/fpldle"],
  ["/higher-lower", "/academy/higher-lower"],
  ["/guess-the-card", "/academy/guess-the-card"],
  ["/my-team/scouting", "/academy/my-team/scouting"],
  ["/my-team", "/academy/my-team"],
  ["/players", "/academy/players"],
  ["/teams", "/academy/teams"],
  ["/schedule", "/academy/schedule"],
  ["/standings", "/academy/standings"],
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

const CARDS_BASES: Record<LeagueView, string> = { premier: "/cards", academy: "/academy/cards" };

export function pairedLeagueHref(pathname: string, target: LeagueView, search = ""): string {
  // A match belongs to exactly one league. There is no corresponding fixture
  // to carry across, so switch to the destination schedule instead of keeping
  // an unresolved fixture id or falling back to the league home page.
  if (pathname.startsWith("/match/")) return leaguePath("schedule", target);

  // The cards section keeps its own map: the same page in the other
  // league, or that league's Play tab for a page it does not have.
  const cardsFrom = hasPathPrefix(pathname, CARDS_BASES.academy)
    ? CARDS_BASES.academy
    : hasPathPrefix(pathname, CARDS_BASES.premier)
      ? CARDS_BASES.premier
      : null;
  if (cardsFrom) {
    const href = pairedCardsHref(pathname, cardsFrom, CARDS_BASES[target]);
    const params = new URLSearchParams(search.replace(/^\?/, ""));
    // Season's End release IDs are scoped to a league. The destination
    // catalog chooses its own latest published release instead of receiving
    // an ID from the other league.
    params.delete("release");
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  }

  // These public links identify one league's data (or a one-time credential)
  // and have no exact counterpart. Switch to the destination Cards directory
  // without carrying an entity ID or token across leagues.
  if (/^\/(?:binder|sign)\/[^/]+\/?$/.test(pathname)) {
    return CARDS_BASES[target];
  }
  if (/^\/card\/[^/]+\/?$/.test(pathname)) {
    return CARDS_BASES[target] + "/browse";
  }

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
