"use client";

// Roster sets on the collection page: one row per team for a chosen
// edition week, with a meter, the players still missing, and a Claim
// button on the ones that are finished.
//
// A client component because claiming is an interaction — a GET must not
// pay anybody, which is why there is a button here rather than a payout
// that happens because you loaded the page.
//
// It renders what the server computed. The button sends only the week and
// the team; which five copies get spent is decided again server-side, so a
// tampered request cannot name cards it doesn't own.

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimTeamSetAction } from "@/lib/cards/setActions";
import { TEAM_SET_BONUS, type WeekTeamSet } from "@/lib/cards/sets";

/** "Aug 24" — the week label the pack shop already uses. */
function weekLabel(week: string): string {
  const date = new Date(`${week}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function TeamSetsSection({
  season,
  week,
  weeks,
  sets,
  claimed,
  base,
}: {
  season: string;
  /** The edition week these sets are asked of. */
  week: string;
  /** Every week the collector holds copies from, newest first. */
  weeks: string[];
  sets: WeekTeamSet[];
  /** Team names in `week` this collector has already been paid for. */
  claimed: string[];
  /** "/cards" or "/academy/cards" — the week switch links stay in league. */
  base: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<ReadonlySet<string>>(new Set());

  const paidFor = new Set([...claimed, ...paid]);
  if (sets.length === 0) return null;

  function claim(teamName: string) {
    setBusy(teamName);
    setError(null);
    startTransition(async () => {
      const result = await claimTeamSetAction(season, week, teamName);
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Marked here as well as revalidated: the refresh re-reads the
      // server, but the row must not sit there offering the money again
      // while that is in flight.
      setPaid((current) => new Set([...current, teamName]));
      router.refresh();
    });
  }

  return (
    <section id="team-sets" aria-labelledby="team-sets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="team-sets-heading" className="type-display text-2xl sm:text-3xl">
          Roster sets
        </h2>
        <span className="text-xs uppercase tracking-[0.16em] text-steel">
          {sets.filter((set) => set.complete && !paidFor.has(set.teamName)).length} ready to claim
        </span>
      </div>
      <p className="max-w-2xl text-sm text-steel">
        Hold all five players a team fielded in one week and the league pays{" "}
        <span className="font-semibold text-mint">${TEAM_SET_BONUS}</span>. The five are that week&apos;s
        roster, frozen — a card from another week doesn&apos;t fill a slot, and completing a set spends
        those five copies, so the same cards can&apos;t pay twice. Foils, parallels and autographs make
        no difference: any copy of the right player counts.
      </p>

      {weeks.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-dash mr-1">Week</span>
          {weeks.map((option) => (
            <Link
              key={option}
              href={`${base}/packs?setWeek=${option}#team-sets`}
              aria-current={option === week ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                option === week
                  ? "border-coral bg-coral/15 font-semibold text-white"
                  : "border-line text-steel hover:border-coral hover:text-white"
              }`}
            >
              {weekLabel(option)}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => {
          const done = paidFor.has(set.teamName);
          const missing = set.members.filter((member) => member.copyId === null);
          return (
            <article
              key={set.teamName}
              data-testid={`set-${set.teamName}`}
              aria-label={`${set.teamName} roster set`}
              className={`card-brand flex h-full flex-col gap-3 p-5 ${
                done ? "border-mint/50" : set.complete ? "border-gold/70" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                {set.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={set.imageUrl} alt="" aria-hidden className="h-8 w-8 object-contain" />
                ) : null}
                <h3 className="type-display flex-1 text-lg">{set.teamName}</h3>
                <span className="font-mono text-sm tabular-nums text-steel">
                  {set.ownedCount}/{set.members.length}
                </span>
              </div>

              <div aria-hidden className="flex gap-1">
                {set.members.map((member) => (
                  <span
                    key={member.slug}
                    className={`h-1.5 flex-1 rounded-full ${member.copyId ? "bg-mint" : "bg-white/10"}`}
                  />
                ))}
              </div>

              {missing.length > 0 ? (
                <p className="text-xs leading-5 text-steel">
                  Still need{" "}
                  {missing.map((member, index) => (
                    <span key={member.slug}>
                      {index > 0 ? ", " : ""}
                      <Link
                        href={`/card/${member.slug}`}
                        className="text-white underline-offset-4 hover:text-coral hover:underline"
                      >
                        {member.name}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}

              {done ? (
                <p className="mt-auto text-sm font-semibold text-mint">Claimed · +${TEAM_SET_BONUS}</p>
              ) : set.complete ? (
                <button
                  type="button"
                  onClick={() => claim(set.teamName)}
                  disabled={pending}
                  aria-label={`Claim the ${set.teamName} set`}
                  className="btn-coral mt-auto px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === set.teamName ? "Claiming…" : `Claim $${TEAM_SET_BONUS}`}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {error ? (
        <p data-testid="set-claim-error" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </section>
  );
}
