import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import { formatKickoff, groupByStage, nextUp, resolveSeason, selectDefaultOpenStages, seasonsOf, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import FixtureCard from "@/components/schedule/FixtureCard";
import CollapsibleScheduleStage from "@/components/schedule/CollapsibleScheduleStage";
import UpNextBanner from "@/components/schedule/UpNextBanner";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import HomeStandings from "@/components/home/HomeStandings";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import { fetchLeagueSeasons } from "@/lib/league/season";

export const metadata: Metadata = {
  title: "Schedule — FPL Academy",
};

export default async function AcademySchedulePage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const supabase = await createServerSupabase();
  const [{ data }, draftData, identities, draftsResult, leagueSeasons] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    fetchAcademyDraftData(supabase),
    fetchTeamIdentities("academy_draft_id"),
    // Ids only — whether a pick/ban phase EXISTS, not what is in it.
    supabase.from("match_drafts").select("fixture_id"),
    fetchLeagueSeasons(supabase),
  ]);
  const draftedFixtureIds = new Set(
    ((draftsResult.data as { fixture_id: string }[] | null) ?? []).map((row) => row.fixture_id),
  );
  const fixtures = filterAcademyFixtures((data as FixtureRow[]) ?? [], academyTeamNames(draftData.teams));
  const requested = (await searchParams).season;
  const season = resolveSeason(fixtures, Array.isArray(requested) ? requested[0] : requested);
  const seasonFixtures = season ? fixtures.filter((fixture) => fixture.season === season) : [];
  const standingsSeason = season ?? leagueSeasons.academy;
  const standings: HomeStandingsData = await fetchHomepageStandings(
    standingsSeason,
    draftData.teams.map((team) => team.name),
    "academy_draft_id",
  ).catch(() => ({ teams: [], race: [] }));
  const grouped = groupByStage(seasonFixtures);
  const upNext = nextUp(seasonFixtures, new Date());
  const defaultOpenStages = selectDefaultOpenStages(seasonFixtures, upNext?.stage ?? null);
  return (
    <main className="page-backdrop flex-1"><div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
      <header className="border-b border-border-subtle pb-8"><span className="label-dash">ACADEMY LEAGUE CALENDAR</span><h1 className="type-display mt-3 text-5xl sm:text-6xl">Academy Schedule</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted">Academy fixtures filtered to the teams in the S1 Academy draft.</p></header>
      {upNext ? <UpNextBanner stageId={upNext.stage} stageLabel={stageMeta(upNext.stage).label} kickoffText={formatKickoff(upNext.kickoff)} kickoff={upNext.kickoff} count={upNext.count} /> : null}
      {seasonsOf(fixtures).length > 1 ? <nav aria-label="Season" className="mt-8 flex flex-wrap gap-2">{seasonsOf(fixtures).map((value) => <Link key={value} href={`/academy/schedule?season=${encodeURIComponent(value)}`} className="rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs text-muted">{value}</Link>)}</nav> : null}
      {/* No Gauntlet in Academy: the split goes straight from the regular
          season into the playoff bracket. */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] xl:gap-10">
        <div className="min-w-0 flex flex-col gap-12">
          {(["Regular Season", "Playoffs"] as const).map((group) => <section key={group}><h2 className="label-dash">{group}</h2><div className="mt-4 flex flex-col gap-4">{grouped.filter(({ meta }) => meta.group === group).map(({ meta, fixtures: stageFixtures }) => <CollapsibleScheduleStage key={meta.stage} stageId={meta.stage} label={meta.label} note={meta.note} initiallyOpen={defaultOpenStages.has(meta.stage)}>{stageFixtures.length ? stageFixtures.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} identities={identities} teamBasePath={null} draftedFixtureIds={draftedFixtureIds} />) : <p className="px-4 py-4 text-sm text-muted">Academy matchups TBD.</p>}</CollapsibleScheduleStage>)}</div></section>)}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label={`${standingsSeason} team standings`}>
          <HomeStandings teams={standings.teams} seasonLabel={standingsSeason} />
        </aside>
      </div>
    </div></main>
  );
}
