"use client";

import { openWeekAction, publishCardSetAction, setWeekStatusAction } from "@/lib/offseason/actions";
import type { OffseasonWeek } from "@/lib/offseason/types";
import MvpNominees, { savedNominees } from "./MvpNominees";
import { ActionMessage, buttonClass, primaryButtonClass, useOffseasonAction, type OffseasonAdminData } from "./shared";
import WeekDrafts from "./WeekDrafts";
import WeekMatches from "./WeekMatches";
import WeekSetup from "./WeekSetup";
import WeekTimesEditor from "./WeekTimes";

const STEP: Record<OffseasonWeek["status"], string> = {
  setup: "Pick the elimination tier and captains, lock the tiers, then create the drafts.",
  drafting: "Run the auctions from the draft admin, then import the teams.",
  playing: "Schedule the matches, enter results, and eliminate the losing elimination teams. Completing the week publishes its card set to the packs.",
  complete: "Done. Its games still count toward everyone's ratings, and its card set is in the packs.",
};

function WeekPanel({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const { pending, message, run } = useOffseasonAction();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{STEP[week.status]}</p>
        {week.status === "playing" ? (
          <button type="button" disabled={pending} className={primaryButtonClass} onClick={() => run(() => setWeekStatusAction(week.id, "complete"), "Week complete.")}>
            Complete week
          </button>
        ) : null}
        {week.status === "complete" ? (
          <button type="button" disabled={pending} className={buttonClass} onClick={() => run(() => setWeekStatusAction(week.id, "playing"), "Week reopened.")}>
            Reopen
          </button>
        ) : null}
        {week.status === "playing" || week.status === "complete" ? (
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() => run(() => publishCardSetAction(week.event_id, week.week_number), `Week ${week.week_number} cards published to the packs.`)}
          >
            Publish cards
          </button>
        ) : null}
        <ActionMessage message={message} />
      </div>
      {week.status === "complete" ? null : <WeekTimesEditor week={week} />}
      {week.status === "setup" ? <WeekSetup data={data} week={week} /> : null}
      <WeekDrafts data={data} week={week} />
      <WeekMatches data={data} week={week} />
      {data.teams.some((team) => team.week_id === week.id) ? (
        // Keyed by the saved nominees so a save resets the picker.
        <MvpNominees key={savedNominees(data, week.id).join()} data={data} week={week} />
      ) : null}
    </div>
  );
}

export default function WeeksAdmin({ data }: { data: OffseasonAdminData }) {
  const { pending, message, run } = useOffseasonAction();
  const weeks = [...data.weeks].sort((a, b) => b.week_number - a.week_number);
  const latest = weeks[0];
  const nextNumber = (latest?.week_number ?? 0) + 1;
  const canOpen = !latest || latest.status === "complete";
  const active = data.entrants.filter((entrant) => entrant.status === "active" && entrant.assigned_role).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !canOpen || active < 10}
          className={primaryButtonClass}
          onClick={() => run(() => openWeekAction(data.event.id, nextNumber), `Week ${nextNumber} opened.`)}
        >
          Open week {nextNumber}
        </button>
        <span className="text-xs text-muted">
          {!canOpen
            ? `Complete week ${latest!.week_number} first.`
            : active < 10
              ? "Assign roles first: a week needs at least two full teams."
              : "Finals are a week too: draft the finalists' teams, then add semifinal and final matches (Bo5)."}
        </span>
        <ActionMessage message={message} />
      </div>
      {weeks.map((week, index) => (
        <details key={week.id} open={index === 0} className="rounded-md border border-border-subtle p-3">
          <summary className="cursor-pointer font-display text-lg font-semibold text-white">
            Week {week.week_number} <span className="text-xs font-normal uppercase tracking-wide text-muted">· {week.status}</span>
          </summary>
          <div className="mt-4">
            <WeekPanel data={data} week={week} />
          </div>
        </details>
      ))}
    </div>
  );
}
