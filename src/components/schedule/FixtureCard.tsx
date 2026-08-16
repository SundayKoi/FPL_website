import Link from "next/link";
import { formatKickoff, hasResult, teamLabel } from "@/lib/schedule/format";
import { teamSlug } from "@/lib/teams/teamPage";
import type { FixtureRow } from "@/lib/schedule/types";

/** Team names are free text on fixtures, so a placeholder like "TBD" has no
 *  page to link to — those render as plain text. */
function TeamName({ name, className }: { name: string; className: string }) {
  if (name === "TBD") return <span className={className}>{name}</span>;
  return (
    <Link
      href={`/teams/${teamSlug(name)}`}
      className={`${className} underline-offset-4 hover:text-gold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold`}
    >
      {name}
    </Link>
  );
}

function divisionChipClass(division: FixtureRow["division"]): string {
  switch (division) {
    case "Solari":
      return "border-gold/50 bg-gold/10 text-gold";
    case "Lunari":
      return "border-steel/50 bg-steel/10 text-steel";
    default:
      return "border-line bg-panel text-steel";
  }
}

export default function FixtureCard({ fixture }: { fixture: FixtureRow }) {
  const played = hasResult(fixture);
  const teamA = teamLabel(fixture.team_a);
  const teamB = teamLabel(fixture.team_b);
  const aWon = played && fixture.score_a! > fixture.score_b!;
  const bWon = played && fixture.score_b! > fixture.score_a!;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 px-4 py-3 first:border-t-0">
      <span
        className={`inline-flex w-16 shrink-0 justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${divisionChipClass(fixture.division)}`}
      >
        {fixture.division ?? "Cross"}
      </span>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 text-sm">
        <TeamName
          name={teamA}
          className={`min-w-0 flex-1 truncate text-right font-semibold ${
            aWon ? "text-gold" : teamA === "TBD" ? "text-steel/70" : "text-white"
          }`}
        />
        {played ? (
          <span className="shrink-0 rounded border border-line bg-navy px-2 py-0.5 font-bold text-white">
            {fixture.score_a}–{fixture.score_b}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold uppercase text-steel">vs</span>
        )}
        <TeamName
          name={teamB}
          className={`min-w-0 flex-1 truncate text-left font-semibold ${
            bWon ? "text-gold" : teamB === "TBD" ? "text-steel/70" : "text-white"
          }`}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-steel">
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-semibold uppercase">
          Bo{fixture.best_of}
        </span>
        <span className="whitespace-nowrap">{formatKickoff(fixture.scheduled_at)}</span>
      </div>
    </div>
  );
}
