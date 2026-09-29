import Link from "next/link";
import { Fragment } from "react";
import FixtureCard from "@/components/schedule/FixtureCard";
import { formatKickoff, stageMeta, teamLabel } from "@/lib/schedule/format";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import { selectFutureHomepageFixtures } from "@/lib/home/schedule";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";
import TeamLogo from "./TeamLogo";

function ScheduleTeam({
  name,
  identities,
  basePath,
}: {
  name: string;
  identities: Record<string, TeamIdentity>;
  basePath: string | null;
}) {
  const identity = identities[teamSlug(name)];
  const content = (
    <>
      <TeamLogo name={name} identity={identity} className={styles.scheduleLogo} fallbackClassName={styles.scheduleFallback} />
      <span className={styles.scheduleTeamName}>{name}</span>
    </>
  );
  return basePath && name !== "TBD" ? (
    <Link href={`${basePath}/${teamSlug(name)}`} className={styles.scheduleTeamLink} title={name}>{content}</Link>
  ) : <span className={styles.scheduleTeam}>{content}</span>;
}

function WorkspaceSchedule({
  schedule,
  identities,
  basePath,
  teamBasePath,
}: {
  schedule: HomepageScheduleData;
  identities: Record<string, TeamIdentity>;
  basePath: string;
  teamBasePath: string | null;
}) {
  const meta = schedule.activeStage ? stageMeta(schedule.activeStage) : null;
  const unplayed = selectFutureHomepageFixtures(schedule.upcoming, schedule.asOf ?? 0);
  const visible = unplayed.slice(0, 4);
  const dateLabel = (iso: string | null) => iso
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" }).format(new Date(iso))
    : "Date TBD";
  const grouped = new Map<string, typeof visible>();
  for (const fixture of visible) {
    const key = dateLabel(fixture.scheduled_at);
    grouped.set(key, [...(grouped.get(key) ?? []), fixture]);
  }
  return (
    <section className={styles.openSection} aria-labelledby="upcoming-schedule-title" data-appearance="workspace">
      <div className={styles.sectionHeading}>
        <div>
          <span className={styles.eyebrow}>UPCOMING MATCHES</span>
          <h2 id="upcoming-schedule-title" className={`${styles.title} mt-2 text-2xl sm:text-3xl`}>
            {meta?.label ?? "Season complete"}
          </h2>
        </div>
        <Link href={basePath} className={styles.link}>View full schedule <span aria-hidden>→</span></Link>
      </div>
      {!meta ? (
        <p className={`${styles.muted} py-4 text-sm leading-6`}>No active stage is listed. See the full schedule for reported results and the postseason bracket.</p>
      ) : visible.length === 0 ? (
        <p className={`${styles.muted} py-4 text-sm leading-6`}>No unplayed fixtures are listed for {meta.label}.</p>
      ) : (
        <>
          <div className={styles.scheduleTableScroll}>
            <table className={styles.scheduleTable}>
              <caption className="sr-only">Upcoming fixtures for {meta.label}, grouped by date</caption>
              <thead>
                <tr><th scope="col">Date</th><th scope="col">Match</th><th scope="col">Division</th><th scope="col">Format</th></tr>
              </thead>
              <tbody>
                {[...grouped].map(([date, fixtures]) => <Fragment key={date}>
                  <tr className={styles.scheduleDayRow}><th scope="rowgroup" colSpan={4}>{date}</th></tr>
                  {fixtures.map((fixture) => {
                  const teamA = teamLabel(fixture.team_a);
                  const teamB = teamLabel(fixture.team_b);
                  return (
                    <tr key={fixture.id}>
                      <td data-label="Date" className={styles.scheduleDate}>{formatKickoff(fixture.scheduled_at)}</td>
                      <td data-label="Match" className={styles.scheduleMatch}>
                        <ScheduleTeam name={teamA} identities={identities} basePath={teamBasePath} />
                        <span className={styles.scheduleVs} aria-hidden>vs</span>
                        <ScheduleTeam name={teamB} identities={identities} basePath={teamBasePath} />
                      </td>
                      <td data-label="Division" className={styles.scheduleDivision}>{fixture.division ?? "Cross-division"}</td>
                      <td data-label="Format" className={styles.scheduleFormat}>Best of {fixture.best_of}</td>
                    </tr>
                  );
                  })}
                </Fragment>)}
              </tbody>
            </table>
          </div>
          <p className={styles.scheduleNote}>
            Kickoff times shown in ET. {unplayed.length > visible.length ? `Showing ${visible.length} of ${unplayed.length} unplayed fixtures.` : meta.note}
          </p>
        </>
      )}
    </section>
  );
}

export default function UpcomingSchedule({
  schedule,
  identities = {},
  basePath = "/schedule",
  teamBasePath = "/teams",
  appearance = "legacy",
}: {
  schedule: HomepageScheduleData;
  identities?: Record<string, TeamIdentity>;
  /** Which schedule page "View full schedule" points at — Academy has its own. */
  basePath?: string;
  /** Passed through to FixtureCard; null leaves crests unlinked. */
  teamBasePath?: string | null;
  appearance?: HomeAppearance;
}) {
  const workspace = appearance === "workspace";
  const resolvedBasePath = basePath ?? (teamBasePath === null ? "/academy/schedule" : "/schedule");
  if (workspace) {
    return <WorkspaceSchedule schedule={schedule} identities={identities} basePath={resolvedBasePath} teamBasePath={teamBasePath} />;
  }
  const activeStage = schedule.activeStage;
  const meta = activeStage ? stageMeta(activeStage) : null;
  const scheduleHref = activeStage
    ? `${schedule.isNewestSeason || !schedule.season ? basePath : `${basePath}?season=${encodeURIComponent(schedule.season)}`}#${activeStage}`
    : null;

  return (
    <article
      aria-label="Upcoming schedule"
      className={workspace ? `${styles.panel} overflow-hidden p-0` : "card-brand mt-6 overflow-hidden p-0 xl:mt-8"}
      data-appearance={appearance}
    >
      <div className={`${workspace ? styles.sectionHeading : "flex flex-wrap items-end justify-between gap-4"} px-5 py-4 sm:px-6`}>
        <div className="min-w-0">
          <span className={workspace ? styles.eyebrow : "label-dash"}>UPCOMING SCHEDULE</span>
          <h2 id="upcoming-schedule-title" className={workspace ? `${styles.title} mt-2 text-3xl sm:text-4xl` : "type-display mt-2 text-3xl sm:text-4xl"}>
            {meta?.label ?? "Season complete"}
          </h2>
          {meta ? <p className={`mt-1 text-sm ${workspace ? styles.muted : "text-muted"}`}>{meta.note}</p> : null}
        </div>
        {scheduleHref ? (
          <Link
            href={scheduleHref}
            className={workspace ? styles.link : "shrink-0 font-semibold text-action-text hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"}
          >
            View full schedule <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>

      {activeStage === null ? (
        <p className={`border-t border-border-subtle/60 px-5 py-5 text-sm leading-6 sm:px-6 ${workspace ? styles.muted : "text-muted"}`}>
          The regular season is complete. Check the full schedule for the postseason bracket.
        </p>
      ) : schedule.fixtures.length === 0 ? (
        <p className={`border-t border-border-subtle/60 px-5 py-5 text-sm leading-6 sm:px-6 ${workspace ? styles.muted : "text-muted"}`}>
          Schedule coming soon — matchups for {meta?.label} have not been announced yet.
        </p>
      ) : (
        <div className={workspace ? styles.rows : "border-t border-border-subtle/60"}>
          {schedule.fixtures.map((fixture) => (
            <FixtureCard key={fixture.id} fixture={fixture} identities={identities} teamBasePath={teamBasePath} appearance={appearance} />
          ))}
        </div>
      )}
    </article>
  );
}
