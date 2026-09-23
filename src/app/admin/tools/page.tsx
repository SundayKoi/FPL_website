import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminConsole from "@/components/admin/AdminConsole";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchLeagueSeasons, seasonBelongsToLeague } from "@/lib/league/season";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "All tools — FPL Admin",
};

export default async function AdminToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const requestedLeague = Array.isArray(params.league) ? params.league[0] : params.league;
  const league = requestedLeague === "academy" ? "academy" : "premier";
  const requestedSeason = Array.isArray(params.season) ? params.season[0] : params.season;
  const [seasonsResult, leagueSeasons] = await Promise.all([
    supabase.from("fixtures").select("season"),
    fetchLeagueSeasons(supabase),
  ]);

  const defaultSeason = leagueSeasons[league] || (league === "academy" ? "A1" : "S5");
  const seasonOptions = [...new Set([
    defaultSeason,
    ...(((seasonsResult.data as { season: string }[] | null) ?? [])
      .map((row) => row.season)
      .filter((season) => seasonBelongsToLeague(season, league))),
  ])].sort((a, b) => {
    if (a === defaultSeason) return -1;
    if (b === defaultSeason) return 1;
    return Number.parseInt(b.slice(1), 10) - Number.parseInt(a.slice(1), 10);
  });
  const season = requestedSeason && seasonOptions.includes(requestedSeason) ? requestedSeason : defaultSeason;
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Chicago",
  }).format(new Date()).toUpperCase();
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  return (
    <AdminConsole
      view="tools"
      isOwner={isOwner}
      isFullAdmin
      league={league}
      season={season}
      defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }}
      seasonOptions={seasonOptions}
      phase="Tool directory"
      upcomingCount={0}
      signupsOpen={false}
      homepageMode="auto"
      featuredMatch={null}
      upcoming={[]}
      today={today}
      initialQuery={query ?? ""}
    />
  );
}
