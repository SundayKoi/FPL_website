import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { academyTeamNames } from "@/lib/league/context";
import { formatKickoff, groupByStage, nextUp, resolveSeason, seasonsOf, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import FixtureCard from "@/components/schedule/FixtureCard";
import UpNextBanner from "@/components/schedule/UpNextBanner";
import LeaguePageToggle from "@/components/LeaguePageToggle";

export default async function AcademySchedulePage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const supabase = await createServerSupabase();
  const [{ data }, draftData] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    fetchAcademyDraftData(supabase),
  ]);
  const fixtures = filterAcademyFixtures((data as FixtureRow[]) ?? [], academyTeamNames(draftData.teams));
  const requested = (await searchParams).season;
  const season = resolveSeason(fixtures, Array.isArray(requested) ? requested[0] : requested);
  const seasonFixtures = season ? fixtures.filter((fixture) => fixture.season === season) : [];
  const grouped = groupByStage(seasonFixtures);
  const upNext = nextUp(seasonFixtures, new Date());
  return (
    <main className="bg-hash flex-1"><div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between"><div><span className="label-dash">ACADEMY LEAGUE CALENDAR</span><h1 className="type-display mt-3 text-5xl sm:text-6xl">Academy Schedule</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-steel">Academy fixtures filtered to the teams in the S1 Academy draft.</p></div><LeaguePageToggle page="schedule" view="academy" params={{ season: Array.isArray(requested) ? requested[0] : requested }} /></header>
      {upNext ? <UpNextBanner stageId={upNext.stage} stageLabel={stageMeta(upNext.stage).label} kickoffText={formatKickoff(upNext.kickoff)} kickoff={upNext.kickoff} count={upNext.count} /> : null}
      {seasonsOf(fixtures).length > 1 ? <nav aria-label="Season" className="mt-8 flex flex-wrap gap-2">{seasonsOf(fixtures).map((value) => <Link key={value} href={`/academy/schedule?season=${encodeURIComponent(value)}`} className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-steel">{value}</Link>)}</nav> : null}
      <div className="mt-10 flex flex-col gap-12">{(["Regular Season", "Gauntlet", "Playoffs"] as const).map((group) => <section key={group}><h2 className="label-dash">{group}</h2><div className="mt-4 flex flex-col gap-4">{grouped.filter(({ meta }) => meta.group === group).map(({ meta, fixtures: stageFixtures }) => <div id={meta.stage} key={meta.stage} className="card-brand overflow-hidden"><div className="border-b border-line px-4 py-3"><h3 className="type-display text-xl">{meta.label}</h3></div>{stageFixtures.length ? stageFixtures.map((fixture) => <FixtureCard key={fixture.id} fixture={fixture} identities={{}} />) : <p className="px-4 py-4 text-sm text-steel">Academy matchups TBD.</p>}</div>)}</div></section>)}</div>
    </div></main>
  );
}
