import type { ReactNode } from "react";
import Link from "next/link";
import type { RosterTeamView } from "@/lib/draft/types";
import { DIVISIONS, type Division } from "@/lib/schedule/types";
import TeamRosterCard from "./TeamRosterCard";

type LeagueView = "premier" | "academy";

export default function TeamsDirectory({
  draftName,
  isPreview,
  teams,
  league = "premier",
  academyAvailable = true,
  adminControls,
  rosterContent,
}: {
  draftName: string | null;
  isPreview: boolean;
  teams: RosterTeamView[];
  league?: LeagueView;
  academyAvailable?: boolean;
  adminControls?: ReactNode;
  rosterContent?: ReactNode;
}) {
  const isAcademy = league === "academy";
  const leagueLabel = isAcademy ? "Academy" : "Premier";
  const title = `${leagueLabel} Teams`;
  const toggleLinkClass = (active: boolean) =>
    `inline-flex items-center justify-center rounded px-4 py-2 text-xs uppercase tracking-[0.14em] transition ${
      active
        ? "bg-gold font-bold text-navy"
        : "text-steel/60 hover:bg-panel hover:text-steel"
    }`;
  const sections: { label: string; division: Division | null }[] = [
    { label: DIVISIONS[1], division: DIVISIONS[1] },
    { label: DIVISIONS[0], division: DIVISIONS[0] },
    { label: "Unassigned", division: null },
  ];

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">{leagueLabel.toUpperCase()} LEAGUE ROSTERS</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              {isPreview
                ? `Preview the ${leagueLabel.toLowerCase()} roster format with placeholder names and positions.`
                : `Showing the ${draftName ?? "selected"} ${leagueLabel.toLowerCase()} roster.`}
            </p>
            <span className="mt-4 inline-flex rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
              {isPreview ? "PREVIEW DATA" : draftName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <nav aria-label="Team league" className="inline-flex gap-1 rounded-md border border-line bg-navy p-1">
              <Link
                href="/teams"
                aria-current={!isAcademy ? "page" : undefined}
                className={toggleLinkClass(!isAcademy)}
              >
                Premier
              </Link>
              {academyAvailable ? (
                <Link
                  href="/teams?view=academy"
                  aria-current={isAcademy ? "page" : undefined}
                  className={toggleLinkClass(isAcademy)}
                >
                  Academy
                </Link>
              ) : null}
            </nav>
            {adminControls ? <div>{adminControls}</div> : null}
          </div>
        </header>

        <section aria-label="Team rosters" className="mt-10">
          {rosterContent ?? sections.map((section) => {
            const sectionTeams = teams.filter((team) => (team.division ?? null) === section.division);
            if (!sectionTeams.length) return null;
            return (
              <div key={section.label} className="mb-10 last:mb-0">
                <h2 className="label-dash mb-4 text-xl text-white">{section.label}</h2>
                <div className="grid gap-5 sm:grid-cols-3">
                  {sectionTeams.map((team) => (
                    <TeamRosterCard key={team.id} team={team} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
