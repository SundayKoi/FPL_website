import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

/** Section 1 of the captain page: the next unplayed fixture for this team. */
export default function NextMatchCard({
  fixture,
  myTeamName,
  opponentMultiOpggUrl = null,
}: {
  fixture: FixtureRow | null;
  myTeamName: string;
  opponentMultiOpggUrl?: string | null;
}) {
  if (!fixture) {
    return (
      <section className="card-brand p-5">
        <h2 className="label-dash">Next match</h2>
        <p className="mt-3 text-sm text-steel">No upcoming match scheduled.</p>
      </section>
    );
  }

  const mine = myTeamName.trim().toLowerCase();
  const isTeamA = (fixture.team_a ?? "").trim().toLowerCase() === mine;
  const opponent = (isTeamA ? fixture.team_b : fixture.team_a)?.trim() || "TBD";
  const meta = stageMeta(fixture.stage);

  return (
    <section className="card-brand p-5">
      <h2 className="label-dash">Next match</h2>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="type-display text-2xl sm:text-3xl">vs {opponent}</p>
        <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-steel">
          Bo{fixture.best_of}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-steel">
        <span>{formatKickoff(fixture.scheduled_at)}</span>
        <span aria-hidden="true">·</span>
        <span>{meta.label}</span>
        {fixture.division && (
          <>
            <span aria-hidden="true">·</span>
            <span>{fixture.division} division</span>
          </>
        )}
      </div>
      {opponentMultiOpggUrl ? (
        <a
          href={opponentMultiOpggUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-fit rounded-full border border-gold/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gold transition hover:bg-gold hover:text-navy"
        >
          Opponent OP.GG Multi
        </a>
      ) : null}
    </section>
  );
}
