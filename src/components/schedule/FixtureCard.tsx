import { formatKickoff, hasResult, teamLabel } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

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
        <span
          className={`min-w-0 flex-1 truncate text-right font-semibold ${
            aWon ? "text-gold" : teamA === "TBD" ? "text-steel/70" : "text-white"
          }`}
        >
          {teamA}
        </span>
        {played ? (
          <span className="shrink-0 rounded border border-line bg-navy px-2 py-0.5 font-bold text-white">
            {fixture.score_a}–{fixture.score_b}
          </span>
        ) : (
          <span className="shrink-0 text-xs font-semibold uppercase text-steel">vs</span>
        )}
        <span
          className={`min-w-0 flex-1 truncate text-left font-semibold ${
            bWon ? "text-gold" : teamB === "TBD" ? "text-steel/70" : "text-white"
          }`}
        >
          {teamB}
        </span>
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
