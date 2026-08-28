import Link from "next/link";
import { formatKickoff, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";
import type { DraftGameInfo } from "@/lib/captain/queries";
import { matchDraftHref } from "@/lib/match-draft/rules";
import OpggMultiLink from "./OpggMultiLink";

/** Section 1 of the captain page: the next unplayed fixture for this team. */
export default function NextMatchCard({
  fixture,
  myTeamName,
  opponentMultiOpggUrl = null,
  draftGames = [],
}: {
  fixture: FixtureRow | null;
  myTeamName: string;
  opponentMultiOpggUrl?: string | null;
  /** The fixture's match-draft rows — shows live per-game draft status. */
  draftGames?: DraftGameInfo[];
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
        <OpggMultiLink href={opponentMultiOpggUrl} label="Opponent OP.GG Multi" className="mt-4" />
      ) : null}
      <div className="mt-4 rounded border border-line bg-navy/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-steel">Series drafter</p>
          <span className="text-[11px] uppercase tracking-wide text-gold">30s turns</span>
        </div>
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`${matchDraftHref(fixture)}?layout=board`}
              className="inline-flex rounded-full border border-coral/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
            >
              Captain&apos;s link →
            </Link>
            <Link
              href={`${matchDraftHref(fixture)}?layout=stage`}
              className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
            >
              Spectator link →
            </Link>
            {/* Untouched rows (a lone ready check) aren't worth a chip. */}
            {draftGames
              .filter((game) => game.started || game.status === "complete")
              .map((game) => (
                <span
                  key={game.gameNumber}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    game.status === "complete" ? "border-mint/50 text-mint" : "border-gold/50 text-gold"
                  }`}
                >
                  G{game.gameNumber} {game.status === "complete" ? "drafted ✓" : "drafting ●"}
                </span>
              ))}
          </div>
          <p className="mt-2 text-[11px] text-steel">Both links cover the whole series — game tabs, Bo1/Bo3/Bo5 and fearless settings live inside.</p>
        </div>
      </div>
    </section>
  );
}
