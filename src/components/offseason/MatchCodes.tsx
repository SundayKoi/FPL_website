"use client";

// A player's own matches this week, with the tournament code for each game
// and the way into the match's draft room. The database shows a match's codes
// only to the players on its two teams (and staff); this lays them out with a
// copy button each.

import Link from "next/link";
import { useState } from "react";
import type { TeamMatchCodes } from "@/lib/offseason/codes";
import { draftHref, matchHref } from "@/lib/offseason/drafts";
import { SideTag } from "./ui";

function CopyCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <code className="min-w-0 break-all font-mono text-sm text-white">{code}</code>
      <button
        type="button"
        aria-label={`${copied ? "Copied" : "Copy"} code for ${label}`}
        onClick={() => {
          navigator.clipboard
            .writeText(code)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {
              // Clipboard access is optional; the code stays on screen.
            });
        }}
        className="shrink-0 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

function MatchCard({ match }: { match: TeamMatchCodes }) {
  const series = match.games.length > 1;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border-subtle bg-canvas/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="text-muted">vs</span> <span className="font-semibold text-white">{match.opponent}</span>
        </p>
        <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          <SideTag side={match.side} />
          {match.label}
        </span>
      </div>
      {match.result ? (
        <p className={match.result === "won" ? "text-sm font-semibold text-success" : "text-sm text-muted"}>
          {match.result === "won" ? "Won" : "Lost"} {match.score[0]}–{match.score[1]}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {match.games.map((game) => {
            const label = series ? `${match.opponent} game ${game.gameNumber}` : match.opponent;
            return (
              <li key={game.gameNumber} className="flex items-center gap-2">
                {series ? <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">Game {game.gameNumber}</span> : null}
                {game.played ? (
                  <span className="text-sm text-muted">Played</span>
                ) : game.code ? (
                  <CopyCode code={game.code} label={label} />
                ) : (
                  <span className="text-sm text-muted">Code not posted yet</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex gap-4 text-xs font-semibold uppercase tracking-wide">
        {match.result ? (
          <Link href={matchHref(match.matchId)} className="text-action-text hover:underline">
            Match history
          </Link>
        ) : (
          <Link href={draftHref(match.matchId)} className="text-action-text hover:underline">
            Draft room
          </Link>
        )}
      </p>
    </li>
  );
}

/** `matches` is null when the codes could not be read. */
export default function MatchCodes({ matches }: { matches: TeamMatchCodes[] | null }) {
  if (!matches) return <p className="text-sm text-danger">Your tournament codes didn&apos;t load. Refresh the page to try again.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Tournament codes for your games. Only your team and the team you play can see them. Captains pick and ban in the draft room;
        everyone else can watch there.
      </p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard key={match.matchId} match={match} />
        ))}
      </ul>
    </div>
  );
}
