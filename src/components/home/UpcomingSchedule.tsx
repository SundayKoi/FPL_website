import Link from "next/link";
import FixtureCard from "@/components/schedule/FixtureCard";
import { stageMeta } from "@/lib/schedule/format";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import type { TeamIdentity } from "@/lib/teams/identity";

export default function UpcomingSchedule({
  schedule,
  identities = {},
  basePath = "/schedule",
  teamBasePath = "/teams",
}: {
  schedule: HomepageScheduleData;
  identities?: Record<string, TeamIdentity>;
  /** Which schedule page "View full schedule" points at — Academy has its own. */
  basePath?: string;
  /** Passed through to FixtureCard; null leaves crests unlinked. */
  teamBasePath?: string | null;
}) {
  const activeStage = schedule.activeStage;
  const meta = activeStage ? stageMeta(activeStage) : null;
  const scheduleHref = activeStage
    ? `${schedule.isNewestSeason || !schedule.season ? basePath : `${basePath}?season=${encodeURIComponent(schedule.season)}`}#${activeStage}`
    : null;

  return (
    <article
      aria-label="Upcoming schedule"
      className="card-brand mt-6 overflow-hidden p-0 xl:mt-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <span className="label-dash">UPCOMING SCHEDULE</span>
          <h2 id="upcoming-schedule-title" className="type-display mt-2 text-3xl sm:text-4xl">
            {meta?.label ?? "Regular season complete"}
          </h2>
          {meta ? <p className="mt-1 text-sm text-steel">{meta.note}</p> : null}
        </div>
        {scheduleHref ? (
          <Link
            href={scheduleHref}
            className="shrink-0 font-semibold text-coral hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            View full schedule <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>

      {activeStage === null ? (
        <p className="border-t border-line/60 px-5 py-5 text-sm leading-6 text-steel sm:px-6">
          The regular season is complete. Check the full schedule for the postseason bracket.
        </p>
      ) : schedule.fixtures.length === 0 ? (
        <p className="border-t border-line/60 px-5 py-5 text-sm leading-6 text-steel sm:px-6">
          Schedule coming soon — matchups for {meta?.label} have not been announced yet.
        </p>
      ) : (
        <div className="border-t border-line/60">
          {schedule.fixtures.map((fixture) => (
            <FixtureCard key={fixture.id} fixture={fixture} identities={identities} teamBasePath={teamBasePath} />
          ))}
        </div>
      )}
    </article>
  );
}
