"use client";

// Vote for the open week's MVP: staff's nominees side by side, each with
// their numbers for the week. One vote per member per week, changeable
// until voting closes; the database checks the week is open, the pick is a
// nominee and isn't the voter (offseason_vote_mvp).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLE_LABELS_SHORT } from "@/lib/draft/types";
import { voteMvpAction } from "@/lib/offseason/actions";
import type { MvpNominee, MvpOpenWeek, WeekLine } from "@/lib/offseason/mvp";

/** One column per nominee, wrapping on narrow screens. */
const COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
};

const one = (value: number) => value.toFixed(1);

function statRows(line: WeekLine): [string, string][] {
  if (line.games === 0) return [];
  return [
    ["Record", `${line.wins}–${line.losses}`],
    ["K / D / A", `${one(line.kills)} / ${one(line.deaths)} / ${one(line.assists)}`],
    ["KDA", line.kda.toFixed(2)],
    ["CS / min", line.csPerMin === null ? "—" : one(line.csPerMin)],
    ["Damage / min", line.damagePerMin === null ? "—" : Math.round(line.damagePerMin).toLocaleString("en-US")],
    ["Vision / min", line.visionPerMin === null ? "—" : line.visionPerMin.toFixed(2)],
  ];
}

function NomineeColumn({
  nominee,
  chosen,
  signedIn,
  pending,
  voting,
  onVote,
}: {
  nominee: MvpNominee;
  chosen: boolean;
  signedIn: boolean;
  pending: boolean;
  voting: boolean;
  onVote: () => void;
}) {
  const { line } = nominee;
  const rows = statRows(line);
  return (
    <article
      aria-label={nominee.name}
      className={`flex flex-col gap-3 rounded-md border p-4 ${chosen ? "border-gold/70 bg-gold/5" : "border-border-subtle bg-canvas/60"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {ROLE_LABELS_SHORT[nominee.role]} · {nominee.teamName}
          </p>
          <p className={`truncate font-display text-xl font-bold ${chosen ? "text-gold" : "text-white"}`}>{nominee.name}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl font-bold tabular-nums text-prestige">{line.overall ?? "—"}</p>
          <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted">Week OVR</p>
        </div>
      </div>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted">No games ingested yet.</p>
      )}
      {line.champions.length > 0 ? <p className="text-xs text-muted">Played {line.champions.join(", ")}</p> : null}
      <div className="mt-auto">
        {nominee.self ? (
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted">You</p>
        ) : signedIn ? (
          <button
            type="button"
            onClick={onVote}
            disabled={pending || chosen}
            aria-pressed={chosen}
            aria-label={chosen ? `Your vote: ${nominee.name}` : `Vote for ${nominee.name}`}
            className={
              chosen
                ? "w-full rounded-full border border-gold/60 bg-gold/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-gold"
                : "w-full rounded-full border border-border-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-content hover:border-action-text hover:text-white disabled:opacity-50"
            }
          >
            {chosen ? "Your vote" : voting ? "Voting…" : "Vote"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function MvpVote({ week, signedIn }: { week: MvpOpenWeek; signedIn: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [myVote, setMyVote] = useState(week.myVote);
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vote = (entrantId: string) => {
    setVoting(entrantId);
    setError(null);
    startTransition(async () => {
      const result = await voteMvpAction(week.weekId, entrantId);
      setVoting(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMyVote(entrantId);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Who was the best player of week {week.weekNumber}? You can change your vote until week {week.weekNumber + 1} is complete.
        The result shows once voting closes. {week.total} {week.total === 1 ? "vote" : "votes"} so far.
      </p>
      {!signedIn ? (
        <Link href="/login?redirect=/offseason" className="btn-pill self-start text-sm">
          Sign in to vote
        </Link>
      ) : null}
      <div className={`grid grid-cols-1 gap-3 ${COLUMNS[week.nominees.length] ?? "sm:grid-cols-3"}`}>
        {week.nominees.map((nominee) => (
          <NomineeColumn
            key={nominee.entrantId}
            nominee={nominee}
            chosen={myVote === nominee.entrantId}
            signedIn={signedIn}
            pending={pending}
            voting={voting === nominee.entrantId}
            onVote={() => vote(nominee.entrantId)}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
