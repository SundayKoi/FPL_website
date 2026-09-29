import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { scopeScheduleFixtures } from "@/lib/schedule/scope";
import { resolveScheduleViewState, type ScheduleSearchParams } from "@/lib/schedule/viewState";
import type { FixtureRow } from "@/lib/schedule/types";
import { buildBracketModel } from "@/lib/schedule/bracket";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchLeagueSeasons } from "@/lib/league/season";
import SchedulePageView from "@/components/schedule/SchedulePageView";

export const metadata: Metadata = {
  title: "Schedule — FPL Academy",
};

export default async function AcademySchedulePage({ searchParams }: { searchParams: Promise<ScheduleSearchParams> }) {
  const supabase = await createServerSupabase();
  const [fixturesResult, identities, draftsResult, leagueSeasons] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    fetchTeamIdentities("academy_draft_id"),
    supabase.from("match_drafts").select("fixture_id"),
    fetchLeagueSeasons(supabase),
  ]);
  const allFixtures = scopeScheduleFixtures((fixturesResult.data as FixtureRow[] | null) ?? [], "academy");
  const state = resolveScheduleViewState(allFixtures, await searchParams, "academy", new Date(), leagueSeasons.academy);
  const draftedFixtureIds = new Set(
    ((draftsResult.data as { fixture_id: string }[] | null) ?? []).map((row) => row.fixture_id),
  );

  return (
    <SchedulePageView
      league="academy"
      pathname="/academy/schedule"
      seasons={state.seasons}
      season={state.season}
      phase={state.phase}
      week={state.week}
      defaultStage={state.defaultStage}
      fixtures={state.fixtures}
      bracket={buildBracketModel(state.fixtures, state.season ?? "")}
      identities={identities}
      draftedFixtureIds={draftedFixtureIds}
      dataError={fixturesResult.error ? "The schedule service is unavailable. Try again in a moment." : null}
    />
  );
}
