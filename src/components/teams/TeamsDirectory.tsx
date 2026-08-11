import type { ReactNode } from "react";
import type { RosterTeamView } from "@/lib/draft/types";
import TeamRosterCard from "./TeamRosterCard";

export default function TeamsDirectory({
  draftName,
  isPreview,
  teams,
  adminControls,
  rosterContent,
}: {
  draftName: string | null;
  isPreview: boolean;
  teams: RosterTeamView[];
  adminControls?: ReactNode;
  rosterContent?: ReactNode;
}) {
  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">LEAGUE ROSTERS</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Teams</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              {isPreview
                ? "Preview the twelve-team roster format with placeholder names and positions."
                : `Showing the ${draftName ?? "selected"} draft roster.`}
            </p>
            <span className="mt-4 inline-flex rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold">
              {isPreview ? "PREVIEW DATA" : draftName}
            </span>
          </div>
          {adminControls ? <div className="shrink-0">{adminControls}</div> : null}
        </header>

        <section aria-label="Team rosters" className="mt-10">
          {rosterContent ?? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {teams.map((team) => (
                <TeamRosterCard key={team.id} team={team} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
