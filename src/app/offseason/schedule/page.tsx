import type { Metadata } from "next";
import { WeekSchedule } from "@/components/offseason/Schedule";
import { Empty, OffseasonShell, Panel } from "@/components/offseason/ui";
import { WEEK_STATUS_LABELS } from "@/components/offseason/WeekBoard";
import { loadOffseasonPage } from "@/lib/offseason/page";

export const metadata: Metadata = {
  title: "Offseason Schedule — FPL",
  description: "Who plays whom each week of the offseason tournament, and on which side.",
};

export default async function OffseasonSchedulePage() {
  const { view, isStaff } = await loadOffseasonPage();
  const weeks = view ? [...view.weeks].reverse() : [];

  return (
    <OffseasonShell
      eyebrow={view?.event.name ?? "FPL Offseason"}
      title="Schedule"
      active="schedule"
      isStaff={isStaff}
      description="Every week's matchups, lane by lane. Sides are drawn at random for each match."
    >
      {weeks.length === 0 ? (
        <Panel title="No matches yet">
          <Empty>The schedule appears once the first week is drafted.</Empty>
        </Panel>
      ) : (
        weeks.map((week) => (
          <Panel key={week.id} title={`Week ${week.week_number}`} aside={WEEK_STATUS_LABELS[week.status]}>
            <WeekSchedule view={view!} week={week} />
          </Panel>
        ))
      )}
    </OffseasonShell>
  );
}
