import type { ReactNode } from "react";
import type { RosterTeamView } from "@/lib/draft/types";
import { DIVISIONS, type Division } from "@/lib/schedule/types";
import TeamRosterCard from "./TeamRosterCard";
import LeaguePageToggle from "@/components/LeaguePageToggle";

type LeagueView = "premier" | "academy";

export default function TeamsDirectory({
  draftName,
  isPreview,
  teams,
  league = "premier",
  adminControls,
  rosterContent,
}: {
  draftName: string | null;
  isPreview: boolean;
  teams: RosterTeamView[];
  league?: LeagueView;
  adminControls?: ReactNode;
  rosterContent?: ReactNode;
}) {
  const isAcademy = league === "academy";
  const leagueLabel = isAcademy ? "Academy" : "Premier";
  const title = `${leagueLabel} Teams`;
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
            <hr className="accent-rule mt-5 w-48 sm:w-64" />
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              {isPreview
                ? `Preview the ${leagueLabel.toLowerCase()} roster format with placeholder names and positions.`
                : `Showing the ${draftName ?? "selected"} ${leagueLabel.toLowerCase()} roster.`}
            </p>
            <span className="mt-4 inline-flex rounded-full border border-coral/50 bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-coral">
              {isPreview ? "PREVIEW DATA" : draftName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LeaguePageToggle page="teams" view={isAcademy ? "academy" : "premier"} />
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
                    <TeamRosterCard key={team.id} team={team} league={league} />
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
