import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import {
  fetchAllCardSeasons,
  fetchEditionWeekInfo,
  fetchSeasonCards,
  fetchSeasonFixtures,
} from "@/lib/cards/queries";
import {
  EXIT_LABELS,
  SENDOFF_META,
  SENDOFF_STAGES,
  SENDOFF_VAULT_DAYS,
  isPlayoffWeek,
  planSendoff,
  sendoffLedger,
  sendoffVaultClosesAt,
  sendoffWeekLabel,
  withSendoff,
  type SendoffExitStage,
  type SendoffStage,
} from "@/lib/cards/sendoff";
import { mondayOf } from "@/lib/packs/week";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "The Send-off — FPL Admin",
};

/** The round each stamp is shown on. A stage and an exit are not the same
 *  thing — the gauntlet has two rounds that both stamp GAUNTLET, and the
 *  finals produce two different stamps — so the mockups pin one round per
 *  stamp rather than letting the reader guess. */
const MOCKUP_EXIT: Record<SendoffStage, SendoffExitStage> = {
  gauntlet: "gauntlet_r2",
  quarterfinalist: "quarterfinals",
  semifinalist: "semifinals",
  finalist: "finals",
  champion: "finals",
};

/** A day, in Eastern, the way every other card date on the site reads. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/**
 * STAFF ONLY. PREVIEW ONLY. Two jobs, and neither of them writes anything:
 *
 * 1. Show the five send-off stamps on real cards, through the same
 *    PlayerCard3D the shop renders, so the stamps can be judged as objects
 *    rather than as a spec. The Champion's frame is the one thing on this
 *    page that cannot be checked any other way — five cards a season wear
 *    it and the first of them ships to a real person.
 * 2. Dry-run what Tuesday's drop would print for the current week, off the
 *    real fixtures and the real season cards, so a bracket typo or a team
 *    name that does not match `raw_stats.team_name` is caught BEFORE the
 *    edition is archived rather than after somebody's only playoff card
 *    failed to print.
 *
 * Nothing here mints, archives, prices or writes. The planner is pure
 * (src/lib/cards/sendoff.ts) and this page only reads.
 */
export default async function SendoffPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string | string[] }>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");

  const params = await searchParams;
  const requested = Array.isArray(params.league) ? params.league[0] : params.league;
  const wantAcademy = requested === "academy";

  const service = createBettingServiceClient();
  const seasons = await fetchAllCardSeasons(service);
  const chosen =
    (wantAcademy ? seasons.find((entry) => entry.league === "academy") : seasons.find((entry) => entry.league === "premier"))
    ?? seasons[0]
    ?? null;
  const season = chosen?.season ?? null;

  // The season-to-date build is the send-off's rating basis, so the dry run
  // reads exactly what the drop would hand the planner.
  const cards = season ? await fetchSeasonCards(service, season) : [];
  const fixtures = season ? await fetchSeasonFixtures(service, season) : [];
  const weekInfo = season ? await fetchEditionWeekInfo(service, season) : [];

  const week = mondayOf(new Date());
  const playoffWeek = isPlayoffWeek(fixtures, week);
  const plan = planSendoff(cards, fixtures, week);
  const ledger = sendoffLedger(cards, fixtures, week);
  const closesAt = sendoffVaultClosesAt(fixtures);

  // Five real cards for the five stamps, best first. Fewer than five cards
  // in the season is a fresh split, not an error — the wall wraps around
  // rather than dropping stamps nobody could then judge.
  const best = [...cards].sort((a, b) => b.overall - a.overall).slice(0, SENDOFF_STAGES.length);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">
          ← Admin
        </Link>
        <h1 className="type-display text-4xl sm:text-5xl">The Send-off</h1>
        <p className="max-w-3xl text-sm text-steel">
          Playoff cards print by elimination: a player&apos;s playoff card prints once, in the week their team&apos;s
          split ended, rated on the whole split rather than on the handful of people still in the bracket, and stamped
          with how far they got. This page shows the five stamps on real cards and dry-runs what Tuesday&apos;s drop
          would print for {week}.
        </p>
        <p className="max-w-3xl text-sm text-gold">
          Preview only. Nothing on this page mints, archives, prices or writes anything — it reads the season&apos;s
          cards and fixtures and runs the same pure planner the drop runs.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {seasons.length === 0 ? null : (
            seasons.map((entry) => (
              <Link
                key={entry.league}
                href={entry.league === "academy" ? "/admin/sendoff?league=academy" : "/admin/sendoff"}
                data-testid={`league-${entry.league}`}
                aria-current={entry.league === chosen?.league ? "page" : undefined}
                className={`rounded-full border px-3 py-1 font-bold uppercase tracking-[0.18em] ${
                  entry.league === chosen?.league ? "border-gold text-gold" : "border-line text-steel hover:text-white"
                }`}
              >
                {entry.league === "academy" ? "Academy" : "Premier"} · {entry.season}
              </Link>
            ))
          )}
        </div>
      </header>

      {season === null ? (
        <p className="text-sm text-coral">No card season is configured, so there is nothing to plan against.</p>
      ) : null}

      <section aria-label="The five exits" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="type-display border-b border-line pb-2 text-2xl">
            The five exits <span className="text-sm text-gold">· Mockups</span>
          </h2>
          <p className="max-w-3xl text-sm text-steel">
            Each stamp on a real card from {season ?? "this season"}, with a made-up series so the ribbon reads the way
            it will in the shop. Four of the five get a ribbon and a coin and nothing else; the Champion gets a frame
            no other card in the league can wear. Click a card to see the coin spelled out on its back.
          </p>
        </div>
        {best.length === 0 ? (
          <p className="text-sm text-steel">No season cards yet — nothing to draw the stamps on.</p>
        ) : (
          <div className="flex flex-wrap gap-8">
            {SENDOFF_STAGES.map((stage, index) => {
              const meta = SENDOFF_META[stage];
              const base = best[index % best.length];
              const exit = MOCKUP_EXIT[stage];
              return (
                <figure key={stage} data-testid={`stamp-${stage}`} className="flex w-[20rem] flex-col items-center gap-3">
                  <PlayerCard3D
                    card={withSendoff(base, {
                      stage,
                      exit,
                      team: base.teamName ?? "—",
                      // The Champion is the one team that did not fall, so
                      // its line reads from the winning side.
                      series: stage === "champion" ? "3–1" : "1–3",
                      week,
                    })}
                    interactive
                  />
                  <figcaption className="flex flex-col items-center gap-1 text-center">
                    <span className="text-sm font-black uppercase tracking-[0.18em]" style={{ color: meta.accent }}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-steel">{meta.line}</span>
                    <span className="text-[11px] text-muted">
                      Printed the week the {EXIT_LABELS[exit]} ended · {base.name}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="This week's send-off" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="type-display border-b border-line pb-2 text-2xl">This week&apos;s send-off · dry run</h2>
          <p className="max-w-3xl text-sm text-steel">
            Week of {week}
            {plan.exits.length > 0 ? ` · ${sendoffWeekLabel(plan.exits)}` : ""}. This is exactly what
            <code className="px-1 text-white">buildEditionForWeek</code> would hand the archiver on Tuesday.
          </p>
        </div>

        {!playoffWeek ? (
          <p data-testid="not-playoff" className="text-sm text-steel">
            Not a playoff week — Tuesday prints a weekly edition.
          </p>
        ) : plan.eliminations.length === 0 ? (
          <p data-testid="undecided" className="text-sm text-gold">
            A playoff week with no decided fixture: nothing prints until the scores land. Enter them and re-run the
            archiver for this week — a weekly edition is NOT printed in the meantime, because it would rate the ten
            people still in the bracket against each other.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm tabular-nums">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-1">Team</th>
                    <th className="py-1">Stamp</th>
                    <th className="py-1">Series</th>
                    <th className="py-1">Against</th>
                    <th className="py-1">Round</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.eliminations.map((elimination) => (
                    <tr key={elimination.team} data-testid={`elimination-${elimination.team}`} className="border-t border-white/10">
                      <td className="py-1.5 text-chalk">{elimination.team}</td>
                      <td className="py-1.5" style={{ color: SENDOFF_META[elimination.stage].accent }}>
                        {SENDOFF_META[elimination.stage].label}
                      </td>
                      <td className="py-1.5">{elimination.series ?? "—"}</td>
                      <td className="py-1.5">{elimination.opponent ?? "—"}</td>
                      <td className="py-1.5">{EXIT_LABELS[elimination.exit]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {plan.unmatched.length > 0 ? (
              <p data-testid="unmatched" className="text-sm text-coral">
                No season card matched {plan.unmatched.join(", ")} — the fixture spells the team differently from
                <code className="px-1">raw_stats.team_name</code>, and those players would print nothing. Fix the name
                before Tuesday.
              </p>
            ) : null}

            <p className="text-sm text-steel">
              {plan.cards.length} card{plan.cards.length === 1 ? "" : "s"} would print, one per player, rated on the
              whole split. Five of them are crowned Card of the Week among this edition&apos;s own roster.
            </p>

            <div className="flex flex-wrap gap-6">
              {plan.cards.map((card) => (
                <div key={card.slug} data-testid={`printed-${card.slug}`} className="flex flex-col items-center gap-2">
                  <PlayerCard3D card={card} interactive={false} />
                  <span className="text-xs text-steel">
                    {card.name} · {card.overall} {card.tier.label}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p data-testid="vault-line" className="text-sm text-muted">
          {closesAt
            ? `Send-off editions vault ${day(closesAt)} — ${SENDOFF_VAULT_DAYS} days after the finals. After that, what was pulled is all there will ever be.`
            : "Vault date unknown until the finals are scheduled — the shop keeps selling until a dated finals fixture exists."}
        </p>
      </section>

      <section aria-label="Bracket ledger" className="flex flex-col gap-4">
        <h2 className="type-display border-b border-line pb-2 text-2xl">Bracket ledger</h2>
        <p className="max-w-3xl text-sm text-steel">
          Every team the season&apos;s cards or playoff fixtures name, and whether its split has printed. Printed first,
          in the order they fell. &ldquo;Alive&rdquo; is still in the bracket; &ldquo;unscheduled&rdquo; is in no playoff
          fixture at all.
        </p>
        {ledger.length === 0 ? (
          <p className="text-sm text-steel">No teams to report.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm tabular-nums">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1">Team</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Stamp</th>
                  <th className="py-1">Printed</th>
                  <th className="py-1">Cards</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.team} data-testid={`ledger-${row.team}`} className="border-t border-white/10">
                    <td className="py-1.5 text-chalk">{row.team}</td>
                    <td
                      className={`py-1.5 ${
                        row.status === "printed" ? "text-emerald-300" : row.status === "alive" ? "text-gold" : "text-muted"
                      }`}
                    >
                      {row.status}
                    </td>
                    <td className="py-1.5">{row.stage ? SENDOFF_META[row.stage].label : "—"}</td>
                    <td className="py-1.5">{row.week ?? "—"}</td>
                    <td className="py-1.5">{row.cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Shop preview" className="flex flex-col gap-4">
        <h2 className="type-display border-b border-line pb-2 text-2xl">How the shop&apos;s picker will read</h2>
        <p className="max-w-3xl text-sm text-steel">
          The archived weeks on sale, newest first, exactly as the pack shop labels them. A vaulted send-off week is
          not listed here because it is no longer on sale.
        </p>
        {weekInfo.length === 0 ? (
          <p className="text-sm text-steel">No archived editions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {weekInfo.map((info) => (
              <li key={info.week} data-testid={`shop-${info.week}`} className="text-chalk">
                {info.label}
                {info.sendoff
                  ? info.sendoff.closesAt
                    ? ` — vault shuts ${day(info.sendoff.closesAt)}`
                    : " — vault date unknown until the finals are scheduled"
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
