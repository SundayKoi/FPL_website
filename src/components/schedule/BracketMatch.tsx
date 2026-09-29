"use client";

import Link from "next/link";
import type { TeamIdentity } from "@/lib/teams/identity";
import { teamSlug } from "@/lib/teams/teamPage";
import type { BracketMatch as BracketMatchModel, ConfirmedBracketEdge } from "@/lib/schedule/bracket";
import { ScheduleFixtureEditButton } from "./ScheduleManagementControls";

function TeamSlot({ name, score, identity, winner }: {
  name: string;
  score: number | null;
  identity?: TeamIdentity;
  winner: boolean;
}) {
  const known = name !== "TBD";
  return (
    <div className={`flex min-w-0 items-center gap-2 px-3 py-2 ${winner ? "text-content" : known ? "text-muted" : "text-muted/70"}`}>
      {identity?.imageUrl ? (
        // Team identity URLs are stored in Supabase and vary by deployment.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.imageUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
      ) : <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded border border-border-subtle bg-canvas" />}
      <span title={known ? name : undefined} className="min-w-0 flex-1 break-words text-sm font-semibold leading-5">{name}</span>
      <span className="shrink-0 font-mono text-sm font-bold text-content">{score ?? "—"}</span>
    </div>
  );
}

export default function BracketMatchCard({
  match,
  index,
  identities,
  incomingEdge,
  sourceLabel,
  hasDraft,
  editable = false,
}: {
  match: BracketMatchModel;
  index: number;
  identities: Record<string, TeamIdentity>;
  incomingEdge?: ConfirmedBracketEdge;
  sourceLabel?: string;
  hasDraft: boolean;
  editable?: boolean;
}) {
  const isWinnerA = match.resultState === "final" && match.winner === match.teamA;
  const isWinnerB = match.resultState === "final" && match.winner === match.teamB;
  const stateLabel = match.resultState === "final"
    ? "Final"
    : match.resultState === "in-progress"
      ? "Series in progress"
      : match.resultState === "invalid"
        ? "Result needs review"
        : "Awaiting result";
  const number = match.stage === "finals" ? "Final" : `${match.stage === "quarterfinals" ? "QF" : "SF"} ${index + 1}`;

  return (
    <article
      className="bracket-match card-brand min-w-0 overflow-hidden"
      data-bracket-fixture={match.fixtureId}
      aria-label={`${number}: ${match.teamA} versus ${match.teamB}, ${stateLabel}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border-subtle/70 px-3 py-2 text-[11px] text-muted">
        <span className="font-semibold uppercase tracking-wider">{number} · Bo{match.bestOf}</span>
        <span className="text-right">{match.kickoffLabel}</span>
      </header>
      {incomingEdge && sourceLabel ? (
        <p className="border-b border-border-subtle/70 bg-raised/50 px-3 py-1.5 text-[11px] leading-4 text-muted">
          Advances from winner of {sourceLabel}
        </p>
      ) : null}
      <div className="divide-y divide-border-subtle/60">
        <TeamSlot name={match.teamA} score={match.scoreA} identity={identities[teamSlug(match.teamA)]} winner={isWinnerA} />
        <TeamSlot name={match.teamB} score={match.scoreB} identity={identities[teamSlug(match.teamB)]} winner={isWinnerB} />
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border-subtle/70 px-3 py-2 text-[11px]">
        <span className={match.resultState === "final" ? "text-success" : match.resultState === "invalid" ? "text-danger" : "text-muted"}>
          {stateLabel}
        </span>
        <div className="flex items-center gap-2">
          {hasDraft ? <Link href={`/match/${match.fixtureId}#draft`} className="font-semibold uppercase text-action-text hover:underline">Draft</Link> : null}
          {editable ? <ScheduleFixtureEditButton fixtureId={match.fixtureId} fixtureLabel={`${match.teamA} vs ${match.teamB}`} /> : null}
          <Link href={`/match/${match.fixtureId}`} className="font-semibold text-action-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
            Match
          </Link>
        </div>
      </footer>
    </article>
  );
}
