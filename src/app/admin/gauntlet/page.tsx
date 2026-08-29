import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { buildBalanceReport, type BalanceFlag } from "@/lib/gauntlet/balance";
import { fetchBalanceTape, windowStart } from "@/lib/gauntlet/balanceQueries";
import { currentWeek } from "@/lib/gauntlet/queries";

export const metadata: Metadata = {
  title: "Gauntlet balance — FPL Admin",
};

/** How many weeks of tape the report reads by default. Four is long
 *  enough for the sample bars to clear and short enough that a change
 *  shipped last month isn't still being averaged into this week's read. */
const WINDOW_WEEKS = 4;

const FLAG_STYLE: Record<BalanceFlag, string> = {
  trap: "bg-coral/20 text-coral border-coral/40",
  sleeper: "bg-gold/20 text-gold border-gold/40",
  dominant: "bg-white/10 text-chalk border-white/20",
  ignored: "bg-white/10 text-steel border-white/20",
  strong: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  weak: "bg-white/10 text-steel border-white/20",
  thin: "bg-transparent text-steel/60 border-white/10",
};

function Flags({ flags }: { flags: BalanceFlag[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${FLAG_STYLE[flag]}`}
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const lift = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}`;

/**
 * The Gauntlet's balance report: what players actually pick, and how it
 * actually goes. Staff-gated and read-only BY DESIGN — nothing on this
 * page changes a number. The tuning happens in a commit, by a person, who
 * then says so in the channel; an algorithm that silently nerfs whatever
 * is winning turns the mode into a treadmill nobody can read.
 */
export default async function GauntletBalancePage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const week = currentWeek();
  const since = windowStart(week, WINDOW_WEEKS);
  const tape = await fetchBalanceTape(createBettingServiceClient(), { sinceWeek: since });
  const report = buildBalanceReport(tape.rounds, tape.offers);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Gauntlet balance</h1>
        <p className="max-w-2xl text-sm text-steel">
          The last {WINDOW_WEEKS} weeks of tape, from {since}. {report.rounds.toLocaleString()} rounds across{" "}
          {report.runs.toLocaleString()} runs and {report.offers.toLocaleString()} relic offers. Nothing here tunes
          anything — it says what to go change by hand.
        </p>
        {tape.missing ? (
          <p className="text-sm text-coral">
            No tape yet. The telemetry migration (20260904000001_gauntlet_telemetry) hasn&apos;t been applied, or no
            round has resolved since it was.
          </p>
        ) : null}
        {tape.truncated ? (
          <p className="text-sm text-coral">
            Reading a slice — the tape is longer than the page ceiling, so these numbers cover the oldest rows in the
            window only. Narrow the window before acting on them.
          </p>
        ) : null}
      </header>

      <section aria-label="Findings" className="card-brand flex flex-col gap-3 p-5">
        <h2 className="type-display text-2xl">Findings</h2>
        {report.headlines.length === 0 ? (
          <p className="text-sm text-steel">
            Nothing crossed the bar. Either the mode is in a decent place or the sample is still thin — check the
            round counts below before reading that as good news.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm text-chalk">
            {report.headlines.map((line) => (
              <li key={line} className="border-l-2 border-coral/60 pl-3">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Baseline" className="card-brand flex flex-col gap-3 p-5">
        <h2 className="type-display text-2xl">Baseline by round</h2>
        <p className="text-sm text-steel">
          Every lift below is measured against this, not against a flat average — a relic taken at round six only ever
          fights the hardest rounds anyone reaches.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm tabular-nums">
            <thead className="text-left text-xs uppercase tracking-wide text-steel">
              <tr>
                <th className="py-1">Round</th>
                <th className="py-1">Fought</th>
                <th className="py-1">Win rate</th>
                <th className="py-1">Avg score</th>
              </tr>
            </thead>
            <tbody>
              {report.baseline.map((row) => (
                <tr key={row.round} className="border-t border-white/10">
                  <td className="py-1.5">{row.round}</td>
                  <td className="py-1.5">{row.rounds.toLocaleString()}</td>
                  <td className="py-1.5">{pct(row.winRate)}</td>
                  <td className="py-1.5">{Math.round(row.avgScore).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Relics" className="card-brand flex flex-col gap-3 p-5">
        <h2 className="type-display text-2xl">Relics</h2>
        <p className="text-sm text-steel">
          Take rate is against the times the relic was actually on the table. Lift is win rate minus the baseline of
          the same rounds, in points.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead className="text-left text-xs uppercase tracking-wide text-steel">
              <tr>
                <th className="py-1">Relic</th>
                <th className="py-1">Offered</th>
                <th className="py-1">Taken</th>
                <th className="py-1">Take rate</th>
                <th className="py-1">Rounds held</th>
                <th className="py-1">Win rate</th>
                <th className="py-1">Lift</th>
                <th className="py-1">Read</th>
              </tr>
            </thead>
            <tbody>
              {report.relics.map((relic) => (
                <tr key={relic.key} className="border-t border-white/10">
                  <td className="py-1.5">
                    <span className="font-semibold text-chalk">{relic.title}</span>
                    <span className="ml-2 text-xs text-steel">
                      {relic.family} · {relic.rarity}
                    </span>
                  </td>
                  <td className="py-1.5">{relic.offered}</td>
                  <td className="py-1.5">{relic.taken}</td>
                  <td className="py-1.5">{pct(relic.takeRate)}</td>
                  <td className="py-1.5">{relic.rounds}</td>
                  <td className="py-1.5">{pct(relic.winRate)}</td>
                  <td className={`py-1.5 ${relic.lift >= 0 ? "text-emerald-300" : "text-coral"}`}>
                    {lift(relic.lift)}
                  </td>
                  <td className="py-1.5">
                    <Flags flags={relic.flags} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Calls" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">The calls</h2>
        {report.situations.map((situation) => (
          <div key={situation.key} className="card-brand flex flex-col gap-2 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="type-display text-xl">{situation.title}</h3>
              <span className="text-xs uppercase tracking-wide text-steel">
                momentum {situation.band[0]}–{situation.band[1]} · seen {situation.seen.toLocaleString()}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm tabular-nums">
                <thead className="text-left text-xs uppercase tracking-wide text-steel">
                  <tr>
                    <th className="py-1">Call</th>
                    <th className="py-1">Taken</th>
                    <th className="py-1">Take rate</th>
                    <th className="py-1">Fair share</th>
                    <th className="py-1">Win rate</th>
                    <th className="py-1">Lift</th>
                    <th className="py-1">Avg daring</th>
                    <th className="py-1">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {situation.choices.map((choice) => (
                    <tr key={choice.key} className="border-t border-white/10">
                      <td className="py-1.5 text-chalk">{choice.label}</td>
                      <td className="py-1.5">{choice.taken}</td>
                      <td className="py-1.5">{pct(choice.takeRate)}</td>
                      <td className="py-1.5 text-steel">{pct(choice.fairShare)}</td>
                      <td className="py-1.5">{pct(choice.winRate)}</td>
                      <td className={`py-1.5 ${choice.lift >= 0 ? "text-emerald-300" : "text-coral"}`}>
                        {lift(choice.lift)}
                      </td>
                      <td className="py-1.5">{Math.round(choice.avgDaring)}</td>
                      <td className="py-1.5">
                        <Flags flags={choice.flags} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
