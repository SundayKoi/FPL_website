import Link from "next/link";
import { redirect } from "next/navigation";
import AdminSectionContext from "@/components/admin/AdminSectionContext";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminFixturesEditor from "@/components/schedule/AdminFixturesEditor";
import AdminSeasonSettings from "@/components/schedule/AdminSeasonSettings";
import AdminGenerateSchedule from "@/components/schedule/AdminGenerateSchedule";
import AdminGenerateGauntlet from "@/components/schedule/AdminGenerateGauntlet";
import PlayoffAdminPanel, { type PlayoffAdminPreview, type PlayoffRoundPanelData } from "@/components/schedule/PlayoffAdminPanel";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { resolveAdminLeagueSeason } from "@/lib/admin/scope";
import { createServerSupabase } from "@/lib/supabase/server";
import { scopeScheduleFixtures } from "@/lib/schedule/scope";
import { resolveScheduleViewState, scheduleStages, type ScheduleSearchParams } from "@/lib/schedule/viewState";
import type { FixtureRow } from "@/lib/schedule/types";
import { buildAdvancementPreview, type PlayoffEntrant, type PlayoffReport } from "@/lib/schedule/playoffs";
import { buildPlayoffPublishPayload, type PlayoffReportWithGames } from "@/lib/schedule/previewPayload";

export const metadata = { title: "Schedule administration — FPL Admin" };

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleSearchParams>;
}) {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!tier.isAdmin && !tier.isOwner) redirect("/admin");

  const params = await searchParams;
  const context = await resolveAdminLeagueSeason(supabase, params);
  const [fixturesResult, settingsResult] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    tier.isOwner
      ? supabase.from("league_settings").select("current_season, current_phase, academy_season").eq("id", 1).single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const allFixtures = scopeScheduleFixtures((fixturesResult.data as FixtureRow[] | null) ?? [], context.league);
  const settings = settingsResult.data as { current_season?: string | null; current_phase?: string | null; academy_season?: string | null } | null;
  const state = resolveScheduleViewState(
    allFixtures,
    { ...params, season: context.season },
    context.league,
    new Date(),
    context.defaultSeasons[context.league],
  );
  const season = state.season ?? context.season;
  const seasonFixtures = allFixtures.filter((fixture) => fixture.season === season);

  let playoffAdmin: {
    configVersion: number;
    pairing22: "solari_high_vs_lunari_low" | "solari_high_vs_lunari_high" | null;
    pairing40: "outer_seeds" | "adjacent_seeds" | null;
    semifinals: PlayoffRoundPanelData;
    finals: PlayoffRoundPanelData;
  } | null = null;
  let playoffAdminError: string | null = null;
  if ((tier.isAdmin || tier.isOwner) && context.league === "premier" && season === "S5") {
    try {
      const [configResult, entrantsResult] = await Promise.all([
        supabase.from("premier_playoff_config").select("*").eq("season", season).maybeSingle(),
        supabase.from("premier_playoff_entrants").select("*").eq("season", season).order("division").order("seed"),
      ]);
      if (configResult.error) throw configResult.error;
      if (entrantsResult.error) throw entrantsResult.error;
      const config = configResult.data as {
        pairing_22: "solari_high_vs_lunari_low" | "solari_high_vs_lunari_high" | null;
        pairing_40: "outer_seeds" | "adjacent_seeds" | null;
        config_version: number;
      } | null;
      if (config) {
        const entrants = ((entrantsResult.data ?? []) as {
          team_id: string;
          canonical_name: string;
          division: "Solari" | "Lunari";
          seed: number;
        }[]).map((row): PlayoffEntrant => ({
          teamId: row.team_id,
          name: row.canonical_name,
          division: row.division,
          seed: row.seed,
        }));
        const sourceIds = seasonFixtures
          .filter((row) => row.stage === "quarterfinals" || row.stage === "semifinals")
          .map((row) => row.id);
        const reportsResult = sourceIds.length
          ? await supabase.from("match_reports").select("*").in("fixture_id", sourceIds).order("id")
          : { data: [], error: null };
        if (reportsResult.error) throw reportsResult.error;
        const reports = (reportsResult.data ?? []) as PlayoffReport[];
        const reportIds = reports.map((row) => row.id);
        const gamesResult = reportIds.length
          ? await supabase.from("match_report_games").select("id, report_id, game_number, status").in("report_id", reportIds).order("game_number")
          : { data: [], error: null };
        if (gamesResult.error) throw gamesResult.error;
        const gameRows = (gamesResult.data ?? []) as { id: string; report_id: string; game_number: number; status: string }[];
        const reportsWithGames: PlayoffReportWithGames[] = reports.map((report) => ({
          ...report,
          games: gameRows.filter((game) => game.report_id === report.id)
            .map(({ id, game_number, status }) => ({ id, game_number, status })),
        }));
        const makeRound = (stage: "semifinals" | "finals") => {
          const sourceStage = stage === "semifinals" ? "quarterfinals" : "semifinals";
          const sourceFixtures = seasonFixtures.filter((row) => row.stage === sourceStage);
          const targetFixtures = seasonFixtures.filter((row) => row.stage === stage);
          const fullPreview = buildAdvancementPreview(
            stage,
            sourceFixtures,
            targetFixtures,
            entrants,
            reportsWithGames,
            { policy22: config!.pairing_22, policy40: config!.pairing_40 },
          );
          const preview: PlayoffAdminPreview = {
            stage: fullPreview.stage,
            status: fullPreview.status,
            blockingReason: fullPreview.blockingReason,
            matches: fullPreview.matches.map(({ sortOrder, teamA, teamB }) => ({
              sortOrder,
              teamA: { name: teamA.name },
              teamB: { name: teamB.name },
            })),
            results: fullPreview.results.map((result) => ({
              fixtureId: result.fixtureId,
              status: result.status,
              winnerName: result.winnerName,
              scoreA: result.scoreA,
              scoreB: result.scoreB,
              provisional: result.provisional,
              blockingReason: result.blockingReason,
              warnings: result.warnings,
            })),
          };
          return {
            preview,
            payload: buildPlayoffPublishPayload(fullPreview, config!.config_version, sourceFixtures, targetFixtures, reportsWithGames),
          } satisfies PlayoffRoundPanelData;
        };
        playoffAdmin = {
          configVersion: config.config_version,
          pairing22: config.pairing_22,
          pairing40: config.pairing_40,
          semifinals: makeRound("semifinals"),
          finals: makeRound("finals"),
        };
      }
    } catch (error) {
      console.error("Unable to load Premier playoff administration", error);
      playoffAdminError = "Playoff previews are temporarily unavailable.";
    }
  }

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader
        title="Schedule & season"
        description="Edit fixtures in the selected league season. Owner-only settings below apply across both leagues."
      >
        <AdminSectionContext
          league={context.league}
          season={season}
          seasonOptions={state.seasons.length ? state.seasons : context.seasonOptions}
          defaultSeasons={context.defaultSeasons}
        />
      </AdminSectionHeader>

      {fixturesResult.error ? (
        <section className="card-brand p-4" role="alert">
          <h2 className="font-semibold">Schedule unavailable</h2>
          <p className="mt-1 text-sm text-muted">Fixture data could not be loaded. Try again after the schedule service recovers.</p>
        </section>
      ) : (
        <section className="card-brand flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="fixtures-heading">
          <div>
            <h2 id="fixtures-heading" className="type-display text-2xl">{context.league === "academy" ? "Academy" : "Premier"} · {season}</h2>
            <p className="mt-1 text-sm text-muted">Browse and update fixtures for this season. Adding and deleting fixtures remains owner-only.</p>
          </div>
          <AdminFixturesEditor
            fixtures={state.fixtures}
            season={state.season}
            isOwner={tier.isOwner}
            defaultStages={scheduleStages(state.phase, context.league)}
          />
        </section>
      )}

      {tier.isOwner && context.league === "premier" ? (
        <section className="card-brand flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="schedule-generation-heading">
          <div>
            <p className="label-dash">Owner tools</p>
            <h2 id="schedule-generation-heading" className="type-display mt-1 text-2xl">Generate the Premier schedule</h2>
            <p className="mt-1 text-sm text-muted">These controls replace matchups in the selected season. Academy schedules are edited in the fixture editor above.</p>
          </div>
          <AdminGenerateSchedule season={season || settings?.current_season || context.defaultSeasons.premier} />
          <AdminGenerateGauntlet season={season || settings?.current_season || context.defaultSeasons.premier} />
        </section>
      ) : null}

      {tier.isOwner ? (
        <section className="card-brand flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="season-settings-heading">
          <div>
            <p className="label-dash">Site-wide settings</p>
            <h2 id="season-settings-heading" className="type-display mt-1 text-2xl">League season configuration</h2>
            <p className="mt-1 text-sm text-muted">These values drive league-wide ingestion and include both season codes and the active phase.</p>
          </div>
          <AdminSeasonSettings
            currentSeason={settings?.current_season ?? context.defaultSeasons.premier}
            currentPhase={settings?.current_phase ?? "Regular"}
            academySeason={settings?.academy_season ?? context.defaultSeasons.academy}
          />
          {settingsResult.error ? <p className="text-sm text-red-300" role="status">Current settings are unavailable; shown values are defaults.</p> : null}
        </section>
      ) : null}

      {context.league === "premier" && season === "S5" ? (
        <section className="card-brand flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="playoff-advancement-heading">
          <div>
            <p className="label-dash">Staff controls</p>
            <h2 id="playoff-advancement-heading" className="type-display mt-1 text-2xl">Playoff advancement</h2>
            <p className="mt-1 text-sm text-muted">Review each round before publishing it to the schedule.</p>
          </div>
          {playoffAdmin ? <PlayoffAdminPanel season="S5" {...playoffAdmin} />
            : playoffAdminError ? <p role="alert" className="text-sm text-red-300">{playoffAdminError}</p>
              : <p className="text-sm text-muted">Premier S5 playoff bracket has not been initialized yet.</p>}
        </section>
      ) : null}

      <Link href={context.league === "academy" ? "/academy/schedule" : "/schedule"} className="w-fit text-sm text-action-text underline underline-offset-4">
        View public schedule →
      </Link>
    </main>
  );
}
