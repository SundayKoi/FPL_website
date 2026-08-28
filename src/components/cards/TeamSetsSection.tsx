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
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimTeamSetAction } from "@/lib/cards/setActions";
import { TEAM_SET_BONUS, type WeekTeamSet } from "@/lib/cards/sets";

/** "Aug 24" — the week label the pack shop already uses. */
function weekLabel(week: string): string {
  const date = new Date(`${week}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** One week's worth of sets, as the page computed them. */
export interface WeekSets {
  week: string;
  sets: WeekTeamSet[];
  /** Team names in `week` this collector has already been paid for. */
  claimed: string[];
}

export default function TeamSetsSection({
  season,
  initialWeek,
  weeks,
}: {
  season: string;
  /** Which week to open on — the newest held, or ?setWeek= if it names one. */
  initialWeek: string;
  /** EVERY held week, computed server-side in one read. Switching between
   *  them is local state: it used to be a link, and changing which five
   *  names a small section listed re-ran the whole collection page. */
  weeks: WeekSets[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<ReadonlySet<string>>(new Set());
  const [week, setWeek] = useState(initialWeek);

  const current = useMemo(
    () => weeks.find((entry) => entry.week === week) ?? weeks[0],
    [weeks, week],
  );
  const sets = current?.sets ?? [];
  // Keyed by week as well as team: paying for one week's Wolves must not
  // grey out another week's.
  const paidFor = new Set([
    ...(current?.claimed ?? []).map((team) => `${current?.week}|${team}`),
    ...paid,
  ]);
  if (!current || sets.length === 0) return null;

  async function claim(teamName: string) {
    setBusy(teamName);
    setError(null);
    const result = await claimTeamSetAction(season, week, teamName);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Marked here as well as revalidated: the refresh re-reads the server,
    // but the row must not sit there offering the money again while that
    // is in flight.
    setPaid((already) => new Set([...already, `${week}|${teamName}`]));
    // The refresh gets its own transition, and the claim is NOT inside it.
    // Held together, `pending` stayed true until the whole collection page
    // had re-rendered — so every button on the section sat disabled long
    // after the money had landed, which read as the claim being slow.
    startTransition(() => router.refresh());
  }

  return (
    <section id="team-sets" aria-labelledby="team-sets-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 id="team-sets-heading" className="type-display text-2xl sm:text-3xl">
          Roster sets
        </h2>
        <span className="text-xs uppercase tracking-[0.16em] text-steel">
          {sets.filter((set) => set.complete && !paidFor.has(`${week}|${set.teamName}`)).length} ready to claim
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
            <button
              key={option.week}
              type="button"
              onClick={() => setWeek(option.week)}
              aria-current={option.week === week ? "true" : undefined}
              aria-label={`Show the week of ${weekLabel(option.week)}`}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                option.week === week
                  ? "border-coral bg-coral/15 font-semibold text-white"
                  : "border-line text-steel hover:border-coral hover:text-white"
              }`}
            >
              {weekLabel(option.week)}
              {option.sets.some(
                (set) => set.complete && !option.claimed.includes(set.teamName) && !paid.has(`${option.week}|${set.teamName}`),
              ) ? (
                // A week with money sitting in it says so, or the only way
                // to find one is to click through every chip.
                <span className="ml-1 text-mint" aria-label="has a set ready to claim">
                  •
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sets.map((set) => {
          const done = paidFor.has(`${week}|${set.teamName}`);
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
                  onClick={() => void claim(set.teamName)}
                  disabled={busy !== null}
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
