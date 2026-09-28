// Which league a visitor lands on when they open the home page.
//
// The site is two leagues on one domain, and every visit to "/" used to
// start in Premier. An Academy player had to find the league switch in the
// corner of the header, every time, before anything on the page was theirs
// — one of the ways the site felt hard to get around. Now:
//
//  1. Switching league in the header remembers the choice (a cookie). An
//     explicit choice always wins, in either direction.
//  2. With no choice on record, a signed-in player whose only team this
//     season is an Academy team lands on the Academy home.
//
// Only the bare "/" redirects. A link to any Premier page still opens that
// page; the league switch is still one click away.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueView } from "./context";

export const LEAGUE_COOKIE = "fpl_league";

/** A year: the choice should outlive a season, not a session. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseLeagueChoice(value: string | null | undefined): LeagueView | null {
  return value === "academy" || value === "premier" ? value : null;
}

/** The cookie string the league switch writes. Client-side only. */
export function leagueChoiceCookie(league: LeagueView): string {
  return `${LEAGUE_COOKIE}=${league}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * The league the signed-in player's team plays in this season: "academy"
 * only when they are on (or captain) an Academy team and not a Premier
 * one, "premier" when they are on a Premier team, null when signed out,
 * unrostered, or anything fails — null keeps the page where it is.
 */
export async function teamLeague(supabase: SupabaseClient): Promise<LeagueView | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const profileId = auth.user?.id;
    if (!profileId) return null;

    const [settingsResult, linksResult, captainsResult] = await Promise.all([
      supabase.from("league_settings").select("current_season, academy_season").eq("id", 1).maybeSingle(),
      supabase
        .from("player_identity_links")
        .select("league, season, status, league_team_id")
        .eq("profile_id", profileId)
        .eq("status", "approved"),
      supabase.from("league_team_captains").select("season").eq("profile_id", profileId),
    ]);
    if (settingsResult.error || linksResult.error || captainsResult.error) return null;

    const settings = settingsResult.data as { current_season: string | null; academy_season: string | null } | null;
    const links = (linksResult.data as { league: string; season: string; league_team_id: string | null }[] | null) ?? [];
    const captaincies = ((captainsResult.data as { season: string }[] | null) ?? []).map((row) => row.season);
    const onTeam = (league: LeagueView, season: string | null | undefined) =>
      Boolean(season) &&
      (links.some((link) => link.league === league && link.season === season && link.league_team_id) || captaincies.includes(season!));

    if (onTeam("premier", settings?.current_season)) return "premier";
    if (onTeam("academy", settings?.academy_season)) return "academy";
    return null;
  } catch {
    return null;
  }
}

/** Where "/" should send this visitor, or null to stay on the Premier home. */
export async function homeRedirect(cookieValue: string | null | undefined, supabase: SupabaseClient): Promise<string | null> {
  const choice = parseLeagueChoice(cookieValue);
  if (choice) return choice === "academy" ? "/academy" : null;
  return (await teamLeague(supabase)) === "academy" ? "/academy" : null;
}
