import type { Metadata } from "next";
import Link from "next/link";
import Leaderboards from "@/components/offseason/Leaderboards";
import { Empty, OffseasonShell, Panel, RoleTag } from "@/components/offseason/ui";
import WeekBoard, { WEEK_STATUS_LABELS } from "@/components/offseason/WeekBoard";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";
import { loadOffseasonPage } from "@/lib/offseason/page";
import { proposeElimination } from "@/lib/offseason/planning";
import { ELIMINATION_START_WEEK, STATUS_LABELS } from "@/lib/offseason/types";

export const metadata: Metadata = {
  title: "Offseason Tournament — FPL",
  description: "Weekly drafts, round robins and eliminations between seasons.",
};

export default async function OffseasonPage() {
  const { view, isStaff, ownEntry } = await loadOffseasonPage();

  if (!view) {
    return (
      <OffseasonShell title="Offseason tournament" active="overview" isStaff={isStaff}>
        <Panel title="Coming soon">
          <Empty>The offseason tournament has not been set up yet.</Empty>
          {isStaff ? (
            <Link href="/offseason/admin" className="text-sm font-semibold text-action-text underline underline-offset-4">
              Create it in the offseason admin →
            </Link>
          ) : null}
        </Panel>
      </OffseasonShell>
    );
  }

  const { event, currentWeek } = view;
  const signedUp = view.entrants.filter((entrant) => entrant.status !== "withdrawn");
  const primaryCounts = Object.fromEntries(
    ROLE_ORDER.map((role) => [role, signedUp.filter((entrant) => entrant.primary_role === role).length]),
  );
  const eliminated = view.entrants
    .filter((entrant) => entrant.status === "eliminated")
    .sort((a, b) => (a.eliminated_week ?? 0) - (b.eliminated_week ?? 0));
  const bottomPerRole = currentWeek && currentWeek.week_number + 1 >= ELIMINATION_START_WEEK ? 2 : 0;
  const atRisk = proposeElimination(view.entrants, view.ratings, bottomPerRole).ids;
  const pastWeeks = view.weeks.filter((week) => week.id !== currentWeek?.id).reverse();

  return (
    <OffseasonShell
      title={event.name}
      active="overview"
      isStaff={isStaff}
      description={
        <>
          Sign up solo, get drafted by a new captain every week, and climb the ratings. Round robins rate everyone; from week{" "}
          {ELIMINATION_START_WEEK} the lowest rated in each role play for survival, and the best finish in the Bo5 finals.
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
        <Panel title={STATUS_LABELS[event.status]} aside={`${signedUp.length} signed up`}>
          <ul className="flex flex-wrap gap-3">
            {ROLE_ORDER.map((role) => (
              <li key={role} className="flex items-center gap-2 text-sm">
                <RoleTag role={role} />
                <span className="tabular-nums text-white">{primaryCounts[role]}</span>
                <span className="sr-only">{ROLE_LABELS[role]} mains</span>
              </li>
            ))}
          </ul>
          {event.signups_open ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/offseason/signup" className="btn-pill text-sm">
                {ownEntry && ownEntry.status !== "withdrawn" ? "Edit your sign-up" : "Sign up"}
              </Link>
              {ownEntry && ownEntry.status !== "withdrawn" ? (
                <span className="text-sm text-muted">You&apos;re in as {ownEntry.display_name}.</span>
              ) : null}
            </div>
          ) : ownEntry ? (
            <p className="text-sm text-muted">
              You&apos;re signed up as{" "}
              <Link href={`/offseason/players/${ownEntry.id}`} className="text-action-text hover:underline">
                {ownEntry.display_name}
              </Link>
              .
            </p>
          ) : (
            <p className="text-sm text-muted">Sign-ups are closed.</p>
          )}
        </Panel>

        {view.champion ? (
          <Panel title="Champions">
            <p className="type-display text-2xl text-prestige">{view.champion.name}</p>
          </Panel>
        ) : (
          <Panel title="Format">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>A fresh auction draft every week</li>
              <li>Round robin, up to three games a team</li>
              <li>Overall ratings add up across every week</li>
              <li>Finals: two to four teams, best of five</li>
            </ul>
          </Panel>
        )}
      </div>

      {currentWeek ? (
        <Panel title={`Week ${currentWeek.week_number}`} aside={WEEK_STATUS_LABELS[currentWeek.status]}>
          <WeekBoard view={view} week={currentWeek} />
        </Panel>
      ) : null}

      <Panel title="Player ratings" aside="Cumulative Overall, S6 playstyle ratings">
        <Leaderboards view={view} atRisk={atRisk} />
      </Panel>

      {eliminated.length > 0 ? (
        <Panel title="Eliminated">
          <ul className="flex flex-wrap gap-2">
            {eliminated.map((entrant) => (
              <li key={entrant.id} className="rounded border border-border-subtle px-2 py-1 text-sm text-muted">
                <Link href={`/offseason/players/${entrant.id}`} className="hover:text-white">
                  {entrant.display_name}
                </Link>{" "}
                <span className="text-xs">W{entrant.eliminated_week}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {pastWeeks.length > 0 ? (
        <Panel title="Earlier weeks">
          {pastWeeks.map((week) => (
            <details key={week.id} className="rounded-md border border-border-subtle p-3">
              <summary className="cursor-pointer font-display font-semibold text-white">
                Week {week.week_number} <span className="text-xs font-normal text-muted">· {WEEK_STATUS_LABELS[week.status]}</span>
              </summary>
              <div className="mt-3">
                <WeekBoard view={view} week={week} />
              </div>
            </details>
          ))}
        </Panel>
      ) : null}
    </OffseasonShell>
  );
}
