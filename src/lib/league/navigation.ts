import type { LeagueView } from "./context";
import { leaguePath, type LeaguePage } from "./links";

export type LeagueNavigationLink = {
  label: string;
  href: string;
};

const NAVIGATION_PAGES = [
  ["Players", "players"],
  ["Teams", "teams"],
  ["Schedule", "schedule"],
  ["Stats", "stats"],
  ["My Team", "my-team"],
] as const satisfies readonly (readonly [string, LeaguePage])[];

export function leagueNavigationLinks(view: LeagueView): LeagueNavigationLink[] {
  return NAVIGATION_PAGES.map(([label, page]) => ({ label, href: leaguePath(page, view) }));
}
