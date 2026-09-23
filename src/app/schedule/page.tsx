import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import {
  formatKickoff,
  groupByStage,
  nextUp,
  resolveSeason,
  selectDefaultOpenStages,
  seasonsOf,
  stageMeta,
} from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminFixturesEditor from "@/components/schedule/AdminFixturesEditor";
import AdminSeasonSettings from "@/components/schedule/AdminSeasonSettings";
import AdminLiveDrops from "@/components/schedule/AdminLiveDrops";
import AdminChampionsDrop from "@/components/schedule/AdminChampionsDrop";
import AdminChase from "@/components/schedule/AdminChase";
import AdminWeeklyDraw from "@/components/schedule/AdminWeeklyDraw";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardEditionWeeks, fetchCardSeason } from "@/lib/cards/queries";
import { fetchChase } from "@/lib/packs/queries";
import AdminGenerateSchedule from "@/components/schedule/AdminGenerateSchedule";
import AdminGenerateGauntlet from "@/components/schedule/AdminGenerateGauntlet";
import FixtureCard from "@/components/schedule/FixtureCard";
import CollapsibleScheduleStage from "@/components/schedule/CollapsibleScheduleStage";
import { fetchTeamIdentities } from "@/lib/teams/identity";
import UpNextBanner from "@/components/schedule/UpNextBanner";
import { fetchLeagueSeasons } from "@/lib/league/season";
import HomeStandings from "@/components/home/HomeStandings";
import { fetchHomepageStandings, type HomeStandingsData } from "@/lib/home/standings";
import PlayoffAdminPanel, { type PlayoffAdminPreview, type PlayoffRoundPanelData } from "@/components/schedule/PlayoffAdminPanel";
import { buildAdvancementPreview, type PlayoffEntrant, type PlayoffReport } from "@/lib/schedule/playoffs";
import { buildPlayoffPublishPayload, type PlayoffReportWithGames } from "@/lib/schedule/previewPayload";

export const metadata: Metadata = {
  title: "Schedule — FPL",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);

  const canAdminister = isAdmin || isOwner;
  const [fixturesResult, settingsResult, identities, leagueSeasons, draftsResult] = await Promise.all([
    supabase.from("fixtures").select("*").order("stage").order("sort_order"),
    canAdminister
      ? supabase
          .from("league_settings")
          // select(*) rather than naming columns: the live_* pair arrives in a
          // later migration, and naming absent columns errors the whole read —
          // which would blank season settings on a deploy that beat its
          // migration. Star tolerates both worlds.
          .select("*")
          .eq("id", 1)
          .single()
      : Promise.resolve({ data: null }),
    fetchTeamIdentities(),
    fetchLeagueSeasons(supabase),
    // Which fixtures the site drafter actually recorded. Ids only — the
    // schedule needs to know whether a draft EXISTS, not what is in it.
    supabase.from("match_drafts").select("fixture_id"),
  ]);
  // Academy fixtures live in the same table under their own season code —
  // this is the Premier calendar, so they are not listed here.
  const allFixtures = ((fixturesResult.data as FixtureRow[]) ?? []).filter(
    (fixture) => fixture.season !== leagueSeasons.academy,
  );
  const liveDropsActive = await isLiveDropsActive(settingsResult.data as { live_until?: string | null } | null);
  // The standing chase for the newest edition, for the admin strip. Admin
  // eyes only, so skipped entirely for everyone else.
  const currentChase = isAdmin ? await fetchCurrentChase() : null;
  const settings = settingsResult.data as {
    current_season: string;
    current_phase: string;
    academy_season: string;
    live_until: string | null;
    live_label: string | null;
    champions_until?: string | null;
  } | null;
  // Same off-the-render-path now-check the live window uses.
  const championsActive = await isChampionsActive(settings);

  const requestedRaw = (await searchParams).season;
  const requested = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  const seasons = seasonsOf(allFixtures);
  const season = resolveSeason(allFixtures, requested);
  // Ids only: the schedule needs to know whether a draft EXISTS, not what
  // is in it. A game drafted in the client, or played before this drafter
  // existed, has no row here and gets no link.
  const draftedFixtureIds = new Set(
    ((draftsResult.data as { fixture_id: string }[] | null) ?? []).map((row) => row.fixture_id),
  );
  const fixtures = season ? allFixtures.filter((f) => f.season === season) : [];
  const standingsSeason = season ?? leagueSeasons.premier;
  const standings: HomeStandingsData = await fetchHomepageStandings(standingsSeason).catch(() => ({
    teams: [],
    race: [],
  }));

  const grouped = groupByStage(fixtures);
  const upNext = nextUp(fixtures, new Date());
  const defaultOpenStages = selectDefaultOpenStages(fixtures, upNext?.stage ?? null);
  const groups = ["Regular Season", "Gauntlet", "Playoffs"] as const;

  let playoffAdmin: {
    configVersion: number;
    pairing22: "solari_high_vs_lunari_low" | "solari_high_vs_lunari_high" | null;
    pairing40: "outer_seeds" | "adjacent_seeds" | null;
    semifinals: PlayoffRoundPanelData;
    finals: PlayoffRoundPanelData;
  } | null = null;
  let playoffAdminError: string | null = null;
  if (canAdminister && season === "S5") {
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
        const sourceIds = fixtures
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
          const sourceFixtures = fixtures.filter((row) => row.stage === sourceStage);
          const targetFixtures = fixtures.filter((row) => row.stage === stage);
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
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="border-b border-border-subtle pb-8">
          <div>
            <span className="label-dash">LEAGUE CALENDAR</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Schedule</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
              Bo3 fearless, Mondays at 8:00pm ET — regular season, gauntlet, then playoffs.
            </p>
          </div>
        </header>

        {upNext && (
          <UpNextBanner
            stageId={upNext.stage}
            stageLabel={stageMeta(upNext.stage).label}
            kickoffText={formatKickoff(upNext.kickoff)}
            kickoff={upNext.kickoff}
            count={upNext.count}
          />
        )}

        {seasons.length > 1 && (
          <nav aria-label="Season" className="mt-8 flex flex-wrap items-center gap-1.5">
            <span className="label-dash mr-1.5">Season</span>
            {seasons.map((s) => (
              <Link
                key={s}
                href={s === seasons[0] ? "/schedule" : `/schedule?season=${encodeURIComponent(s)}`}
                aria-current={s === season ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  s === season
                    ? "bg-action-fill text-white"
                    : "border border-border-subtle bg-surface text-muted hover:text-white"
                }`}
              >
                {s}
              </Link>
            ))}
          </nav>
        )}

        {isAdmin && (
          <div className="mt-8 flex flex-col gap-4">
            {isOwner ? (
              <>
                <AdminSeasonSettings
                  currentSeason={settings?.current_season ?? ""}
                  currentPhase={settings?.current_phase ?? "Regular"}
                  academySeason={settings?.academy_season ?? leagueSeasons.academy}
                />
                <AdminLiveDrops liveUntil={settings?.live_until ?? null} liveLabel={settings?.live_label ?? null} active={liveDropsActive} />
                <AdminChampionsDrop until={settings?.champions_until ?? null} active={championsActive} />
                <AdminChase current={currentChase} />
                <AdminWeeklyDraw />
                {/* season is null until fixtures exist, which is exactly when the
                    draw is needed — fall back to the league's current season. */}
                {(season ?? settings?.current_season) && (
                  <>
                    <AdminGenerateSchedule season={(season ?? settings?.current_season) as string} />
                    {/* Premier only — the Academy has no gauntlet. */}
                    <AdminGenerateGauntlet season={(season ?? settings?.current_season) as string} />
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Some league configuration is owner-only.</p>
            )}
            <AdminFixturesEditor fixtures={fixtures} season={season} isOwner={isOwner} />
          </div>
        )}

        {canAdminister && season === "S5" ? (
          <div className="mt-8">
            {playoffAdmin ? (
              <PlayoffAdminPanel season="S5" {...playoffAdmin} />
            ) : playoffAdminError ? (
              <p role="alert" className="rounded border border-red-400/40 bg-red-950/20 p-4 text-sm text-red-300">{playoffAdminError}</p>
            ) : (
              <p className="rounded border border-border-subtle bg-surface p-4 text-sm text-muted">Premier S5 playoff bracket has not been initialized yet.</p>
            )}
          </div>
        ) : null}

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] xl:gap-10">
          <div className="min-w-0 flex flex-col gap-12">
            {groups.map((group) => (
              <section key={group}>
                <h2 className="label-dash">{group}</h2>
                <div className="mt-4 flex flex-col gap-4">
                  {grouped
                    .filter(({ meta }) => meta.group === group)
                    .map(({ meta, fixtures: stageFixtures }) => (
                      <CollapsibleScheduleStage
                        key={meta.stage}
                        stageId={meta.stage}
                        label={meta.label}
                        note={meta.note}
                        initiallyOpen={defaultOpenStages.has(meta.stage)}
                      >
                        {stageFixtures.length === 0 ? (
                          <p className="px-4 py-4 text-sm text-muted">
                            Matchups TBD — check back once they&apos;re announced.
                          </p>
                        ) : (
                          stageFixtures.map((fixture) => (
                            <FixtureCard key={fixture.id} fixture={fixture} identities={identities} draftedFixtureIds={draftedFixtureIds} />
                          ))
                        )}
                      </CollapsibleScheduleStage>
                    ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label={`${standingsSeason} team standings`}>
            <HomeStandings teams={standings.teams} seasonLabel={standingsSeason} />
          </aside>
        </div>
      </div>
    </main>
  );
}

/** Off the render path — the purity rule bites bare Date.now() in bodies. */
async function isLiveDropsActive(row: { live_until?: string | null } | null): Promise<boolean> {
  return Boolean(row?.live_until && new Date(row.live_until).getTime() > Date.now());
}

/** Same contract for the Faceless Drop window. */
async function isChampionsActive(row: { champions_until?: string | null } | null): Promise<boolean> {
  return Boolean(row?.champions_until && new Date(row.champions_until).getTime() > Date.now());
}

/** The chase armed for the newest premier edition, or null. The chase is
 *  league-wide, but the admin strip anchors on premier's newest week — the
 *  same derivation armChaseAction uses. */
async function fetchCurrentChase(): Promise<{ title: string; claimedBy: string | null } | null> {
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, "premier");
  if (!season) return null;
  const [week] = await fetchCardEditionWeeks(service, season);
  if (!week) return null;
  const chase = await fetchChase(service, week);
  return chase ? { title: chase.title, claimedBy: chase.claimedBy } : null;
}
