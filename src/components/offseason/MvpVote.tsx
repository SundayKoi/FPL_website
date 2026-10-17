"use client";

// Vote for the open week's MVP. One vote per member per week, changeable
// until voting closes; the database checks the week is open, the pick
// played that week and isn't the voter (offseason_vote_mvp).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLE_LABELS_SHORT } from "@/lib/draft/types";
import { voteMvpAction } from "@/lib/offseason/actions";
import type { MvpOpenWeek } from "@/lib/offseason/mvp";

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
        Who was the best player of week {week.weekNumber}? You can change your vote until week {week.weekNumber + 1}&apos;s games start.
        The result shows once voting closes. {week.total} {week.total === 1 ? "vote" : "votes"} so far.
      </p>
      {!signedIn ? (
        <Link href="/login?redirect=/offseason" className="btn-pill self-start text-sm">
          Sign in to vote
        </Link>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {week.teams.map((team) => (
          <div key={team.id} className="rounded-md border border-border-subtle p-3">
            <p className="mb-2 font-display text-sm font-semibold text-white">{team.name}</p>
            <ul className="flex flex-col gap-1.5">
              {team.members.map((member) => {
                const chosen = myVote === member.entrantId;
                return (
                  <li key={member.entrantId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-1.5 text-xs font-bold text-muted">{ROLE_LABELS_SHORT[member.role]}</span>
                      <span className={chosen ? "font-semibold text-gold" : "text-white"}>{member.name}</span>
                    </span>
                    {member.self ? (
                      <span className="shrink-0 text-xs text-muted">You</span>
                    ) : signedIn ? (
                      <button
                        type="button"
                        onClick={() => vote(member.entrantId)}
                        disabled={pending || chosen}
                        aria-pressed={chosen}
                        aria-label={chosen ? `Your vote: ${member.name}` : `Vote for ${member.name}`}
                        className={
                          chosen
                            ? "shrink-0 rounded-full border border-gold/60 bg-gold/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-gold"
                            : "shrink-0 rounded-full border border-border-subtle px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted hover:text-white disabled:opacity-50"
                        }
                      >
                        {chosen ? "Your vote" : voting === member.entrantId ? "Voting…" : "Vote"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
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
