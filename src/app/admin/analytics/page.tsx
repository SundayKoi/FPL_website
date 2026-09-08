import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { clampWeeks, DEFAULT_WEEKS, fetchAnalyticsOverview } from "@/lib/analytics/queries";
import {
  cardsPerPack,
  classMix,
  dribbStatus,
  ECLIPSE_GATE,
  EXPECTED_CARDS_PER_PACK,
  parallelMix,
  pullRates,
  type RateRow,
  type RateVerdict,
} from "@/lib/analytics/overview";
import { DRIBB_COPIES } from "@/lib/cards/dribb";
import { oneIn } from "@/lib/cards/rarityGuide";

export const metadata: Metadata = {
  title: "Analytics — FPL Admin",
};

/** Read fresh every time. A dashboard somebody opens to answer "is the
 *  rate change working" must not be answering it off yesterday's cache. */
export const dynamic = "force-dynamic";

const WINDOWS = [4, 8, 12, 26, 52];

const num = (value: number) => Math.round(value).toLocaleString("en-US");
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const pct = (value: number, places = 1) => `${(value * 100).toFixed(places)}%`;

const VERDICT_STYLE: Record<RateVerdict, string> = {
  on: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  thin: "bg-transparent text-muted/70 border-white/10",
  high: "bg-gold/20 text-gold border-gold/40",
  low: "bg-coral/20 text-coral border-coral/40",
};

const VERDICT_LABEL: Record<RateVerdict, string> = {
  on: "on rate",
  thin: "thin",
  high: "running hot",
  low: "running cold",
};

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-white/[0.02] p-4">
      <span className="label-dash text-[10px]">{label}</span>
      <span className="type-display text-3xl tabular-nums">{value}</span>
      {note ? <span className="text-xs text-muted">{note}</span> : null}
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="card-brand flex flex-col gap-3 p-5">
      <h2 className="type-display text-2xl">{title}</h2>
      {blurb ? <p className="max-w-3xl text-sm text-muted">{blurb}</p> : null}
      {children}
    </section>
  );
}

function Table({ head, children, min = 640 }: { head: string[]; children: React.ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums" style={{ minWidth: `${min}px` }}>
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="py-1 pr-3 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function RateLine({ row }: { row: RateRow }) {
  return (
    <tr className="border-t border-white/10">
      <td className="py-1.5 pr-3 text-chalk">{row.label}</td>
      <td className="py-1.5 pr-3 text-muted">
        {pct(row.expected, row.expected < 0.01 ? 3 : 1)}
        <span className="ml-1 text-xs text-muted/70">({oneIn(row.expected)})</span>
      </td>
      <td className="py-1.5 pr-3">{pct(row.observed, row.observed < 0.01 ? 3 : 1)}</td>
      <td className="py-1.5 pr-3 text-xs text-muted">
        {pct(row.low, 2)} – {pct(row.high, 2)}
      </td>
      <td className="py-1.5 pr-3">{num(row.hits)}</td>
      <td className="py-1.5 pr-3 text-muted">
        {num(row.sample)} {row.per === "pack" ? "packs" : "cards"}
      </td>
      <td className="py-1.5">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${VERDICT_STYLE[row.verdict]}`}>
          {VERDICT_LABEL[row.verdict]}
        </span>
      </td>
    </tr>
  );
}

/**
 * The whole league on one page, for the two people who tune it.
 *
 * Staff-gated and read-only by design, like the Gauntlet balance report
 * next door: nothing here changes a number, it says which number to go
 * change. Every rate is shown beside the constant it is supposed to be and
 * beside the band the sample actually supports, because the failure mode
 * of a dashboard like this is somebody "fixing" a gate that was only ever
 * having a quiet week.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const weeks = clampWeeks(params.weeks ?? DEFAULT_WEEKS);
  const { data, missing, error } = await fetchAnalyticsOverview(createBettingServiceClient(), weeks);

  if (missing || error || !data) {
    return (
      <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
        <Link href="/admin" className="label-dash w-fit hover:text-action-text">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl">Analytics</h1>
        <p className="max-w-2xl text-sm text-coral">
          {missing
            ? "The analytics read isn't in the database yet — migration 20261005000001 is written but hasn't been applied. Run it, then reload."
            : `The read failed: ${error}`}
        </p>
      </main>
    );
  }

  const packs = data.packs.by_week;
  const pulls = data.pulls.by_week;
  const rates = pullRates(pulls, packs);
  const classes = classMix(data.pulls.tiers);
  const parallels = parallelMix(data.pulls.parallels);
  const dribb = dribbStatus(data.pulls.chases.dribbs);
  const perPack = cardsPerPack(pulls, packs);

  const totalOpens = packs.reduce((total, week) => total + week.opens, 0);
  const totalCopies = pulls.reduce((total, week) => total + week.copies, 0);
  const totalSpend = packs.reduce((total, week) => total + week.spend, 0);
  const latest = data.people.active.at(-1);
  const paidIn = data.economy.by_week.reduce((total, week) => total + week.paid_in, 0);
  const paidOut = data.economy.by_week.reduce((total, week) => total + week.paid_out, 0);

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-action-text">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">Analytics</h1>
        <p className="max-w-3xl text-sm text-muted">
          Every mode, every week since {data.since}, counted in the database and read here. Nothing on this page
          changes anything — it says what to go change. Weeks are Eastern Mondays, the same week the rest of the site
          runs on.
        </p>
        <nav aria-label="Window" className="flex flex-wrap items-center gap-2 text-xs">
          <span className="label-dash text-[10px]">Window</span>
          {WINDOWS.map((option) => (
            <Link
              key={option}
              href={`/admin/analytics?weeks=${option}`}
              aria-current={option === weeks ? "page" : undefined}
              className={`rounded border px-2 py-1 font-semibold uppercase tracking-wide ${
                option === weeks ? "border-gold/50 bg-gold/15 text-gold" : "border-line text-muted hover:text-chalk"
              }`}
            >
              {option}w
            </Link>
          ))}
        </nav>
      </header>

      <section aria-label="At a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={num(data.people.profiles)} note={`${num(data.people.patrons)} patrons right now`} />
        <Stat
          label="Active last week"
          value={num(latest?.active ?? 0)}
          note={`${num(latest?.packs ?? 0)} ripped · ${num(latest?.gauntlet ?? 0)} ran the Gauntlet`}
        />
        <Stat label="Packs opened" value={num(totalOpens)} note={`${num(totalCopies)} cards minted · ${money(totalSpend)} spent`} />
        <Stat
          label="In circulation"
          value={money(data.economy.in_circulation)}
          note={`${money(data.economy.avg_balance)} average wallet`}
        />
      </section>

      <Section
        title="Pull rates"
        blurb={`Observed against the constants in src/lib/packs/config.ts, over ${num(totalCopies)} cards from ${num(totalOpens)} packs. The band is two standard errors on the observed rate: while the expected rate sits inside it, the sample simply cannot tell the difference yet, and the row reads THIN rather than pretending otherwise.`}
      >
        <Table head={["Gate", "Expected", "Observed", "Band", "Hits", "Sample", "Read"]} min={720}>
          {rates.map((row) => (
            <RateLine key={row.key} row={row} />
          ))}
        </Table>
        <p className="text-xs text-muted">
          The Eclipse is not in the table: its gate ({oneIn(ECLIPSE_GATE)}) is rolled per Card-of-the-Week slot, so
          neither packs nor cards is its denominator and a rate column would be a fiction.{" "}
          {num(data.pulls.chases.eclipses)} exist in all. Cards per pack is {perPack.toFixed(2)} against{" "}
          {EXPECTED_CARDS_PER_PACK} expected.
        </p>
      </Section>

      <Section
        title="Class mix"
        blurb="The one gate every pull passes through. Expected is the raw weight table; the observed share runs a little richer because of the guaranteed rare-or-better slot, which is working as intended — a gap in the other direction is the one worth chasing."
      >
        <Table head={["Class", "Copies", "Observed", "Expected (raw weights)"]} min={480}>
          {classes.map((row) => (
            <tr key={row.klass} className="border-t border-white/10">
              <td className="py-1.5 pr-3 capitalize text-chalk">{row.klass}</td>
              <td className="py-1.5 pr-3">{num(row.copies)}</td>
              <td className="py-1.5 pr-3">{pct(row.observed)}</td>
              <td className="py-1.5 text-muted">{pct(row.expected)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="The parallel ladder" blurb="Which foil printed, among the foils that printed at all.">
        <Table head={["Parallel", "Copies", "Share of foils", "Expected"]} min={480}>
          {parallels.map((row) => (
            <tr key={row.type} className="border-t border-white/10">
              <td className="py-1.5 pr-3 capitalize text-chalk">{row.type}</td>
              <td className="py-1.5 pr-3">{num(row.copies)}</td>
              <td className="py-1.5 pr-3">{pct(row.observed)}</td>
              <td className="py-1.5 text-muted">{row.expected === null ? "off the ladder" : pct(row.expected)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="The chases"
        blurb="All time, not the window: how many exist is a question about the world."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Eclipses" value={num(data.pulls.chases.eclipses)} note="one-of-ones" />
          <Stat label="Secrets" value={num(data.pulls.chases.secrets)} />
          <Stat label="Shinies" value={num(data.pulls.chases.shinies)} />
          <Stat label="StatTrak" value={num(data.pulls.chases.stattraks)} />
        </div>
        <h3 className="type-display mt-2 text-lg">
          The Dribb — {dribb.found} of {DRIBB_COPIES} found
          {dribb.complete ? ", all five out" : `, ${dribb.left} still in the packs`}
        </h3>
        {data.pulls.dribb.length === 0 ? (
          <p className="text-sm text-muted">None found yet.</p>
        ) : (
          <Table head={["Number", "Holder", "Season", "Found"]} min={420}>
            {data.pulls.dribb.map((copy) => (
              <tr key={copy.number} className="border-t border-white/10">
                <td className="py-1.5 pr-3 text-chalk">
                  {copy.number} of {DRIBB_COPIES}
                </td>
                <td className="py-1.5 pr-3 font-mono text-xs">{copy.discord_id}</td>
                <td className="py-1.5 pr-3 text-muted">{copy.season}</td>
                <td className="py-1.5 text-muted">{copy.acquired_at.slice(0, 10)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="Who is playing"
        blurb="One person counted once per week per mode they touched. Somebody who only played a daily game is as active as somebody who only ripped."
      >
        <Table head={["Week", "Active", "New", "Packs", "Expeditions", "Gauntlet", "Betting", "Daily games", "Market"]} min={800}>
          {data.people.active.map((week, index) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3 font-semibold">{num(week.active)}</td>
              <td className="py-1.5 pr-3 text-muted">{num(data.people.joined[index]?.joined ?? 0)}</td>
              <td className="py-1.5 pr-3">{num(week.packs)}</td>
              <td className="py-1.5 pr-3">{num(week.expeditions)}</td>
              <td className="py-1.5 pr-3">{num(week.gauntlet)}</td>
              <td className="py-1.5 pr-3">{num(week.betting)}</td>
              <td className="py-1.5 pr-3">{num(week.daily_games)}</td>
              <td className="py-1.5">{num(week.market)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="Packs"
        blurb="Every pack, from both records that hold them: the money row that reaches back to the league's first rip, and the newer opening identity that knows the variant and is the only trace of a comped pack. Counted once each. A refunded open is not an open."
      >
        <Table head={["Week", "Opens", "Paid", "Daily rip", "Comped", "God Packs", "Rippers", "Spent"]} min={720}>
          {packs.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3 font-semibold">{num(week.opens)}</td>
              <td className="py-1.5 pr-3">{num(week.paid)}</td>
              <td className="py-1.5 pr-3">{num(week.daily)}</td>
              <td className="py-1.5 pr-3">{num(week.comp)}</td>
              <td className="py-1.5 pr-3 text-gold">{num(week.god_packs)}</td>
              <td className="py-1.5 pr-3 text-muted">{num(week.rippers)}</td>
              <td className="py-1.5">{money(week.spend)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Expeditions">
        <Table head={["Week", "Launched", "Resolved", "Lost", "Players"]} min={520}>
          {data.modes.expeditions.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3">{num(week.launched)}</td>
              <td className="py-1.5 pr-3">{num(week.resolved)}</td>
              <td className="py-1.5 pr-3 text-coral">{num(week.lost)}</td>
              <td className="py-1.5 text-muted">{num(week.players)}</td>
            </tr>
          ))}
        </Table>
        {data.modes.expedition_tiers.length > 0 ? (
          <p className="text-xs text-muted">
            By road:{" "}
            {data.modes.expedition_tiers.map((tier) => `${tier.tier} ${num(tier.runs)}`).join(" · ")}
          </p>
        ) : null}
      </Section>

      <Section title="Gauntlet">
        <Table head={["Week", "Runs", "Players", "Cleared", "Fallen", "Banked", "Avg round reached"]} min={640}>
          {data.modes.gauntlet.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3">{num(week.runs)}</td>
              <td className="py-1.5 pr-3 text-muted">{num(week.players)}</td>
              <td className="py-1.5 pr-3 text-emerald-300">{num(week.cleared)}</td>
              <td className="py-1.5 pr-3 text-coral">{num(week.fallen)}</td>
              <td className="py-1.5 pr-3">{num(week.banked)}</td>
              <td className="py-1.5 text-muted">{week.avg_round}</td>
            </tr>
          ))}
        </Table>
        <p className="text-xs text-muted">
          Picks and win rates live next door on the{" "}
          <Link href="/admin/gauntlet" className="underline hover:text-action-text">
            balance report
          </Link>
          .
        </p>
      </Section>

      <Section title="Daily games, Showdown, betting and the market">
        <h3 className="label-dash text-[10px]">Daily games</h3>
        {data.modes.daily_games.length === 0 ? (
          <p className="text-sm text-muted">Nobody played a daily game in this window.</p>
        ) : (
          <Table head={["Week", "Game", "Plays", "Players", "Paid out"]} min={520}>
            {data.modes.daily_games.map((row) => (
              <tr key={`${row.week}-${row.game}`} className="border-t border-white/10">
                <td className="py-1.5 pr-3 text-chalk">{row.week}</td>
                <td className="py-1.5 pr-3 capitalize">{row.game.replace(/_/g, " ")}</td>
                <td className="py-1.5 pr-3">{num(row.plays)}</td>
                <td className="py-1.5 pr-3 text-muted">{num(row.players)}</td>
                <td className="py-1.5">{money(row.paid_out)}</td>
              </tr>
            ))}
          </Table>
        )}

        <h3 className="label-dash mt-4 text-[10px]">Showdown</h3>
        <Table head={["Week", "Hands", "Tables", "Pot", "Rake burned"]} min={520}>
          {data.modes.showdown.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3">{num(week.hands)}</td>
              <td className="py-1.5 pr-3 text-muted">{num(week.tables)}</td>
              <td className="py-1.5 pr-3">{money(week.pot)}</td>
              <td className="py-1.5">{money(week.rake)}</td>
            </tr>
          ))}
        </Table>

        <h3 className="label-dash mt-4 text-[10px]">Betting</h3>
        <Table head={["Week", "Bets", "Players", "Staked", "Paid out"]} min={520}>
          {data.modes.betting.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3">{num(week.bets)}</td>
              <td className="py-1.5 pr-3 text-muted">{num(week.players)}</td>
              <td className="py-1.5 pr-3">{money(week.staked)}</td>
              <td className="py-1.5">{money(week.paid)}</td>
            </tr>
          ))}
        </Table>

        <h3 className="label-dash mt-4 text-[10px]">The listing board</h3>
        <Table head={["Week", "Listed", "Sold", "Volume"]} min={420}>
          {data.modes.market.map((week) => (
            <tr key={week.week} className="border-t border-white/10">
              <td className="py-1.5 pr-3 text-chalk">{week.week}</td>
              <td className="py-1.5 pr-3">{num(week.listed)}</td>
              <td className="py-1.5 pr-3">{num(week.sold)}</td>
              <td className="py-1.5">{money(week.volume)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        title="The economy"
        blurb={`${money(paidIn)} paid in and ${money(Math.abs(paidOut))} taken back out over the window. Every reason the ledger actually holds, so a new one shipped next month shows up here on its own.`}
      >
        <Table head={["Reason", "Entries", "Paid in", "Paid out", "Net"]} min={560}>
          {data.economy.by_reason.map((row) => (
            <tr key={row.reason} className="border-t border-white/10">
              <td className="py-1.5 pr-3 capitalize text-chalk">{row.reason.replace(/_/g, " ")}</td>
              <td className="py-1.5 pr-3 text-muted">{num(row.entries)}</td>
              <td className="py-1.5 pr-3 text-emerald-300">{money(row.paid_in)}</td>
              <td className="py-1.5 pr-3 text-coral">{money(Math.abs(row.paid_out))}</td>
              <td className={`py-1.5 ${row.net >= 0 ? "text-emerald-300" : "text-coral"}`}>
                {row.net >= 0 ? "+" : "−"}
                {money(Math.abs(row.net))}
              </td>
            </tr>
          ))}
        </Table>
      </Section>

      <p className="text-xs text-muted">Read at {new Date(data.generated_at).toISOString().replace("T", " ").slice(0, 19)} UTC.</p>
    </main>
  );
}
