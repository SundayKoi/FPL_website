import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import type { FixtureRow } from "@/lib/schedule/types";
import { scopeScheduleFixtures } from "@/lib/schedule/scope";
import { resolveScheduleViewState, type ScheduleSearchParams } from "@/lib/schedule/viewState";
import { buildBracketModel } from "@/lib/schedule/bracket";
import SchedulePageView from "@/components/schedule/SchedulePageView";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import { fetchLeagueSeasons } from "@/lib/league/season";

export const metadata: Metadata = {
  title: "Schedule — FPL",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleSearchParams>;
}) {
  const supabase = await createServerSupabase();
  const [{ isAdmin }, fixturesResult, identities, leagueSeasons, draftsResult] = await Promise.all([
    fetchStaffTier(supabase),
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    fetchTeamIdentities(),
    fetchLeagueSeasons(supabase),
    supabase.from("match_drafts").select("fixture_id"),
  ]);

  const allFixtures = scopeScheduleFixtures((fixturesResult.data as FixtureRow[] | null) ?? [], "premier");
  const state = resolveScheduleViewState(allFixtures, await searchParams, "premier", new Date(), leagueSeasons.premier);
  const draftedFixtureIds = new Set(
    ((draftsResult.data as { fixture_id: string }[] | null) ?? []).map((row) => row.fixture_id),
  );
  const page = (
    <SchedulePageView
      league="premier"
      pathname="/schedule"
      seasons={state.seasons}
      season={state.season}
      phase={state.phase}
      week={state.week}
      defaultStage={state.defaultStage}
      fixtures={state.fixtures}
      bracket={buildBracketModel(state.fixtures, state.season ?? "")}
      identities={identities}
      draftedFixtureIds={draftedFixtureIds}
      canManage={false}
      dataError={fixturesResult.error ? "The schedule service is unavailable. Try again in a moment." : null}
    />
  );

  if (!isAdmin) return page;
  const context = state.season ? `?league=premier&season=${encodeURIComponent(state.season)}` : "?league=premier";
  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
        <Link href={`/admin/league/schedule${context}`} className="text-sm font-semibold text-action-text underline underline-offset-4">
          Manage fixtures and season settings in Admin →
        </Link>
      </div>
      {page}
    </>
  );
}
