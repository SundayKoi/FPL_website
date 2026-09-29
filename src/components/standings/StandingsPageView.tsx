import Link from "next/link";
import HomeStandings from "@/components/home/HomeStandings";
import StandingsRace from "@/components/home/StandingsRace";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchTeamIdentities, type TeamIdentity } from "@/lib/teams/identity";
import LeaguePageShell, { LeagueEmptyState } from "@/components/league/LeaguePageShell";
import { unstable_rethrow } from "next/navigation";
import styles from "./StandingsPageView.module.css";

type StandingsPageData = {
  season: string;
  standings: HomeStandingsData;
  identities: Record<string, TeamIdentity>;
};

async function loadStandings(league: LeagueView): Promise<StandingsPageData> {
  const supabase = await createServerSupabase();
  const seasons = await fetchLeagueSeasons(supabase);
  const season = league === "academy" ? seasons.academy : seasons.premier;
  if (!season) throw new Error(`${league} current season is not configured`);

  if (league === "academy") {
    const draft = await fetchAcademyDraftData(supabase);
    const teamNames = draft.teams.map((team) => team.name);
    const standings = await fetchHomepageStandings(season, teamNames, "academy_draft_id", "divisions", true);
    const identities = await fetchTeamIdentities("academy_draft_id").catch(() => ({}));
    return { season, standings, identities };
  }

  const [standings, identities] = await Promise.all([
    fetchHomepageStandings(season, undefined, "featured_draft_id", "divisions", true),
    fetchTeamIdentities().catch(() => ({})),
  ]);
  return { season, standings, identities };
}

/** Standings and the home-page table share one ranking calculation. The full
 *  page gives that table the first visual position and keeps the race chart
 *  available as supporting season history. */
export default async function StandingsPageView({ league }: { league: LeagueView }) {
  let result: StandingsPageData | null = null;
  try {
    result = await loadStandings(league);
  } catch (error) {
    unstable_rethrow(error);
    console.error("standings: load failed", error);
  }

  const season = result?.season ?? null;
  const teams = result?.standings.teams ?? [];

  return (
    <LeaguePageShell
      league={league}
      title="Standings"
      season={season}
      description="Series records, recent form and the next opponent for every team."
      activeSection="standings"
    >
      {!result ? (
        <LeagueEmptyState title="Standings are unavailable" tone="error">
          We couldn&apos;t load the current season table. Refresh the page to try again.
        </LeagueEmptyState>
      ) : teams.length === 0 ? (
        <LeagueEmptyState title={`No standings for ${result.season} yet`}>
          The table will appear when the league roster is configured. Check the schedule for upcoming matchups.
          <span className={styles.emptyLinkWrap}>
            <Link href={leaguePath("schedule", league)} className={styles.inlineLink}>Open schedule</Link>
          </span>
        </LeagueEmptyState>
      ) : (
        <>
          <p className={styles.legend}>
            W and L count series. Games shows the map record inside those series. Form is oldest to newest.
          </p>
          <HomeStandings
            teams={teams}
            seasonLabel={result.season}
            identities={result.identities}
            standingsHref={leaguePath("standings", league)}
            teamBasePath={leaguePath("teams", league)}
            appearance="workspace"
            standalone
          />
          {result.standings.race.length > 0 ? (
            <details className={styles.progression}>
              <summary>Season progression</summary>
              <div className={styles.progressionBody}>
                <StandingsRace race={result.standings.race} appearance="workspace" />
              </div>
            </details>
          ) : null}
        </>
      )}
    </LeaguePageShell>
  );
}
