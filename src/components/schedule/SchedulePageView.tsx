import Link from "next/link";
import type { TeamIdentity } from "@/lib/teams/identity";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";
import { formatKickoff, hasResult, stageMeta } from "@/lib/schedule/format";
import type { BracketModel } from "@/lib/schedule/bracket";
import { scheduleStages, scheduleViewHref, stageViewHref, type ScheduleLeague, type SchedulePhase } from "@/lib/schedule/viewState";
import LeaguePageShell from "@/components/league/LeaguePageShell";
import FixtureCard from "./FixtureCard";
import LegacyScheduleHashBridge from "./LegacyScheduleHashBridge";
import PlayoffBracket from "./PlayoffBracket";
import UpNextBanner from "./UpNextBanner";
import ScheduleSeasonSelector from "./ScheduleSeasonSelector";
import { ScheduleManageButton, ScheduleFixtureEditButton } from "./ScheduleManagementControls";
import styles from "./SchedulePageView.module.css";

function statusForWeek(rows: FixtureRow[], stage: FixtureStage): string {
  const fixtures = rows.filter((row) => row.stage === stage);
  if (fixtures.length === 0) return "Unpublished";
  if (fixtures.every(hasResult)) return "Complete";
  if (fixtures.some((row) => row.score_a !== null || row.score_b !== null)) return "In progress";
  return "Scheduled";
}

function MatchList({
  rows,
  identities,
  draftedFixtureIds,
  canManage,
  showDivision,
  teamBasePath,
}: {
  rows: FixtureRow[];
  identities: Record<string, TeamIdentity>;
  draftedFixtureIds: ReadonlySet<string>;
  canManage: boolean;
  showDivision: boolean;
  teamBasePath: string | null;
}) {
  return rows.map((fixture) => (
    <div key={fixture.id} className="border-b border-border-subtle/50 last:border-b-0">
      <FixtureCard
        fixture={fixture}
        identities={identities}
        draftedFixtureIds={draftedFixtureIds}
        teamBasePath={teamBasePath}
        showDivision={showDivision}
      />
      {canManage ? (
        <div className="flex justify-end px-3 pb-2">
          <ScheduleFixtureEditButton fixtureId={fixture.id} fixtureLabel={`${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`} />
        </div>
      ) : null}
    </div>
  ));
}

function WeekFixtures({
  rows,
  week,
  identities,
  draftedFixtureIds,
  canManage,
  teamBasePath,
}: {
  rows: FixtureRow[];
  week: number;
  identities: Record<string, TeamIdentity>;
  draftedFixtureIds: ReadonlySet<string>;
  canManage: boolean;
  teamBasePath: string | null;
}) {
  const stage = `week_${week}` as FixtureStage;
  const fixtures = rows.filter((row) => row.stage === stage);
  const divisions: { key: string; label: string; fixtures: FixtureRow[] }[] = [
    { key: "Solari", label: "Solari Division", fixtures: fixtures.filter((row) => row.division === "Solari") },
    { key: "Lunari", label: "Lunari Division", fixtures: fixtures.filter((row) => row.division === "Lunari") },
    { key: "unassigned", label: "Cross-division & unassigned", fixtures: fixtures.filter((row) => row.division === null) },
  ];
  return (
    <section className={styles.fixturePanel} aria-labelledby="selected-week-title">
      <header className={styles.panelHeader}>
        <div>
          <h2 id="selected-week-title" className="type-display text-2xl">Week {week}</h2>
          <p className="mt-1 text-sm text-muted">Regular season · Best of 3</p>
        </div>
        <span className={styles.panelStatus}>{statusForWeek(rows, stage)}</span>
      </header>
      {fixtures.length === 0 ? (
        <p className={styles.emptyState}>No fixtures published for this week.</p>
      ) : (
        <div className={styles.panelBody}>
          {divisions.filter((group) => group.fixtures.length > 0).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className={styles.divisionHeading}>{group.label}</h3>
              <MatchList rows={group.fixtures} identities={identities} draftedFixtureIds={draftedFixtureIds} canManage={canManage} showDivision={false} teamBasePath={teamBasePath} />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function PhaseLink({
  label,
  pathname,
  season,
  phase,
  active,
  week,
}: {
  label: string;
  pathname: string;
  season: string | null;
  phase: SchedulePhase;
  active: boolean;
  week: number;
}) {
  return (
    <Link
      href={scheduleViewHref(pathname, season, phase, phase === "regular" ? week : undefined)}
      aria-current={active ? "page" : undefined}
      className={`${styles.phaseLink} ${active ? styles.activePhase : ""}`}
    >
      {label}
    </Link>
  );
}

export default function SchedulePageView({
  league,
  pathname,
  seasons,
  season,
  phase,
  week,
  defaultStage,
  fixtures,
  bracket,
  identities,
  draftedFixtureIds,
  canManage = false,
  dataError,
}: {
  league: ScheduleLeague;
  pathname: string;
  seasons: string[];
  season: string | null;
  phase: SchedulePhase;
  week: 1 | 2 | 3 | 4 | 5;
  defaultStage: FixtureStage;
  fixtures: FixtureRow[];
  bracket: BracketModel;
  identities: Record<string, TeamIdentity>;
  draftedFixtureIds: ReadonlySet<string>;
  canManage?: boolean;
  dataError?: string | null;
}) {
  const isAcademy = league === "academy";
  const leagueLabel = isAcademy ? "Academy" : "Premier";
  const teamBasePath = isAcademy ? null : "/teams";
  const stageList = scheduleStages(phase, league);
  const upNextFixture = fixtures.filter((row) => !hasResult(row) && row.stage === defaultStage).sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))[0];
  const upNextCount = fixtures.filter((row) => !hasResult(row) && row.stage === defaultStage).length;

  return (
    <LeaguePageShell
      league={league}
      title="Schedule"
      season={season}
      activeSection="schedule"
      headerActions={
        <>
          <ScheduleSeasonSelector pathname={pathname} seasons={seasons} season={season} />
          {canManage ? <ScheduleManageButton /> : null}
        </>
      }
    >
      <LegacyScheduleHashBridge pathname={pathname} league={league} />
      <div className={styles.scheduleContent}>
        <div className={styles.navigationGroup}>
          <nav aria-label="Schedule phase" className={styles.phaseNav}>
            <PhaseLink label="Regular season" pathname={pathname} season={season} phase="regular" active={phase === "regular"} week={week} />
            {!isAcademy ? <PhaseLink label="Gauntlet" pathname={pathname} season={season} phase="gauntlet" active={phase === "gauntlet"} week={week} /> : null}
            <PhaseLink label="Playoffs" pathname={pathname} season={season} phase="playoffs" active={phase === "playoffs"} week={week} />
          </nav>

          {!dataError && phase === "regular" ? (
            <nav aria-label="Regular season weeks" className={styles.weekStrip}>
              {[1, 2, 3, 4, 5].map((value) => {
                const weekStatus = statusForWeek(fixtures, `week_${value}` as FixtureStage);
                const active = week === value;
                return (
                  <Link
                    key={value}
                    href={scheduleViewHref(pathname, season, "regular", value)}
                    aria-current={active ? "page" : undefined}
                    aria-label={`Week ${value}, ${weekStatus.toLowerCase()}`}
                    className={`${styles.weekButton} ${active ? styles.activeWeek : ""}`}
                  >
                    <span>Week {value}</span><span className={styles.weekStatus}>{weekStatus}</span>
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>

        {upNextFixture ? (
          <div className={styles.upNext}>
            <UpNextBanner
              stageId={defaultStage}
              href={stageViewHref(pathname, season, defaultStage)}
              stageLabel={stageMeta(defaultStage).label}
              kickoffText={formatKickoff(upNextFixture.scheduled_at)}
              kickoff={upNextFixture.scheduled_at}
              count={upNextCount}
              appearance="league"
            />
          </div>
        ) : null}

        {dataError ? (
          <div role="alert" className={`${styles.emptyState} ${styles.errorState}`}>
            Schedule data could not be loaded. {dataError}
          </div>
        ) : null}

        {!dataError && phase === "regular" ? (
          <div className={styles.contentGrid}>
            <WeekFixtures rows={fixtures} week={week} identities={identities} draftedFixtureIds={draftedFixtureIds} canManage={canManage} teamBasePath={teamBasePath} />
            <aside className={styles.previewPanel} aria-label="Playoff bracket preview">
              <header className={styles.panelHeader}>
                <div>
                  <p className="label-dash">Road to the final</p>
                  <h2 className="type-display mt-1 text-xl">Playoffs</h2>
                </div>
                <Link href={scheduleViewHref(pathname, season, "playoffs")} className="shrink-0 text-sm font-semibold text-action-text hover:underline">View playoffs →</Link>
              </header>
              <div className={styles.previewBody}>
                <PlayoffBracket model={bracket} identities={identities} draftedFixtureIds={draftedFixtureIds} variant="compact" />
              </div>
              <Link href={isAcademy ? `/academy/standings` : `/standings`} className={styles.standingsLink}>
                View standings
              </Link>
            </aside>
          </div>
        ) : !dataError && phase === "gauntlet" ? (
          <div className={styles.contentGrid}>
            <section className={styles.fixturePanel} aria-labelledby="gauntlet-heading">
              <header className={styles.panelHeader}>
                <div><h2 id="gauntlet-heading" className="type-display text-2xl">Gauntlet</h2><p className="mt-1 text-sm text-muted">Published Premier fixtures · progression depends on results and seeds</p></div>
              </header>
              <div className={styles.panelBody}>
                {stageList.map((stage) => {
                  const roundFixtures = fixtures.filter((row) => row.stage === stage);
                  return (
                    <section key={stage} aria-label={stageMeta(stage).label}>
                      <h3 className={styles.divisionHeading}>{stageMeta(stage).label} · Bo{stageMeta(stage).bestOf}</h3>
                      {roundFixtures.length ? <MatchList rows={roundFixtures} identities={identities} draftedFixtureIds={draftedFixtureIds} canManage={canManage} showDivision={false} teamBasePath={teamBasePath} /> : <p className="px-1 py-4 text-sm text-muted">No fixtures published for this round.</p>}
                    </section>
                  );
                })}
              </div>
            </section>
            <aside className={styles.previewPanel} aria-label="Playoff bracket preview">
              <header className={styles.panelHeader}><div><p className="label-dash">After the gauntlet</p><h2 className="type-display mt-1 text-xl">Playoffs</h2></div><Link href={scheduleViewHref(pathname, season, "playoffs")} className="text-sm font-semibold text-action-text hover:underline">View playoffs →</Link></header>
              <div className={styles.previewBody}><PlayoffBracket model={bracket} identities={identities} draftedFixtureIds={draftedFixtureIds} variant="compact" /></div>
            </aside>
          </div>
        ) : !dataError ? (
          <section className={styles.playoffSection} aria-label="Playoff bracket">
            <header className={`${styles.panelHeader} ${styles.playoffHeader}`}>
              <div><span className="label-dash">{leagueLabel} · {season ?? "Season pending"}</span><h2 className="type-display mt-1 text-3xl">Playoffs</h2></div>
              <Link href={isAcademy ? `/academy/standings` : `/standings`} className="text-sm font-semibold text-action-text hover:underline">View standings</Link>
            </header>
            <PlayoffBracket model={bracket} identities={identities} draftedFixtureIds={draftedFixtureIds} editable={canManage} />
            {bracket.rounds.some((round) => round.matches.length > 0) ? (
              <div className="sr-only">
                {bracket.rounds.map((round) => (
                  <span key={round.stage}>{round.label}: {round.matches.map((match) => `${match.teamA} versus ${match.teamB}`).join(", ")}. </span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </LeaguePageShell>
  );
}
