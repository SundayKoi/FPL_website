import Link from "next/link";
import HomeStandings from "@/components/home/HomeStandings";
import StandingsRace from "@/components/home/StandingsRace";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import type { LeagueView } from "@/lib/league/context";
import { leaguePath } from "@/lib/league/links";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { createServerSupabase } from "@/lib/supabase/server";

const EMPTY: HomeStandingsData = { teams: [], race: [] };

/**
 * The standings, read exactly the way the home page reads them — the same
 * derivation, the same draft, the same season code — so the table here
 * and the panel there can never disagree. Fails to an empty table rather
 * than a broken page.
 */
async function loadStandings(league: LeagueView): Promise<{ data: HomeStandingsData; season: string | null }> {
  try {
    const supabase = await createServerSupabase();
    const seasons = await fetchLeagueSeasons(supabase);
    if (league === "academy") {
      const draft = await fetchAcademyDraftData(supabase);
      const teamNames = draft.teams.map((team) => team.name);
      const data = await fetchHomepageStandings(seasons.academy, teamNames, "academy_draft_id");
      return { data, season: seasons.academy };
    }
    const data = await fetchHomepageStandings();
    return { data, season: seasons.premier ?? null };
  } catch (error) {
    console.error("standings: load failed", error);
    return { data: EMPTY, season: null };
  }
}

/**
 * The standings as a page of their own. They lived only as a panel on the
 * home page, so "where do I see the table" had no answer in the menu.
 */
export default async function StandingsPageView({ league }: { league: LeagueView }) {
  const { data, season } = await loadStandings(league);
  const academy = league === "academy";

  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">
            {academy ? "FPL Academy" : "Franchise Premier League"}
            {season ? ` · ${season}` : ""}
          </span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Standings</h1>
          <hr className="accent-rule mt-5 w-48 sm:w-64" />
          <p className="mt-4 text-lg leading-8 text-muted">
            Every team&apos;s record this season, their last five results, and the race week by week.
          </p>
          <nav aria-label="Related" className="mt-4 flex flex-wrap gap-2 text-xs">
            <Link href={leaguePath("schedule", league)} className="btn-pill px-3 py-1.5">
              Schedule
            </Link>
            <Link href={leaguePath("teams", league)} className="btn-pill px-3 py-1.5">
              Teams
            </Link>
            <Link href={leaguePath("stats", league)} className="btn-pill px-3 py-1.5">
              Stats
            </Link>
          </nav>
        </header>

        {data.teams.length === 0 ? (
          <p className="card-brand mt-8 p-5 text-sm text-muted" data-testid="standings-empty">
            No results yet this season. The table fills in as games are played — the{" "}
            <Link href={leaguePath("schedule", league)} className="text-action-text underline-offset-4 hover:underline">
              schedule
            </Link>{" "}
            says when the first one is.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-2 xl:gap-8">
            <HomeStandings teams={data.teams} seasonLabel={season ?? undefined} />
            {data.race.length > 0 ? <StandingsRace race={data.race} /> : null}
          </div>
        )}
      </div>
    </main>
  );
}
