import type { Metadata } from "next";
import { FOIL_TYPES, FOIL_TYPE_LABELS } from "@/lib/packs/config";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fmtPoints } from "@/lib/betting/format";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchEconomyStats, type EconomyStats } from "@/lib/cards/economy";
import { tierLabel } from "@/lib/cards/tier";
import { CHAMPIONS_SEASON, CHAMPIONS_SET } from "@/lib/cards/champions";
import { EXPEDITION_TIERS, type ExpeditionTierKey } from "@/lib/expeditions/config";

/** Tier order for the board readout — easiest first, same as the launch
 *  screen, so the two pages read in the same direction. */
const EXPEDITION_TIER_ORDER: ExpeditionTierKey[] = ["scout", "raid", "legend"];

export const metadata: Metadata = {
  title: "Card Ledger — FPL",
  description: "Every pack opened, dollar spent, and rare pull in the league's card economy.",
};

function Figure({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="card-brand flex flex-col gap-1 p-5">
      <span className="font-display text-4xl font-bold tabular-nums text-white sm:text-5xl">{value}</span>
      <span className="label-dash">{label}</span>
      {note ? <span className="text-xs leading-5 text-steel">{note}</span> : null}
    </div>
  );
}

/** "1 in 24" — the rate a variant actually came out at, which is the number
 *  people argue about. Guarded: no pulls means no rate, not a divide by
 *  zero rendered as Infinity. */
function rate(part: number, whole: number): string | undefined {
  return rateOf(part, whole, "cards");
}

/** The same rate, over something that isn't a card — runs, mostly. */
function rateOf(part: number, whole: number, unit: string): string | undefined {
  if (part <= 0 || whole <= 0) return undefined;
  return `1 in ${Math.round(whole / part).toLocaleString()} ${unit}`;
}

/** Public on purpose: the ledger is the league's shared scoreboard for the
 *  card economy, and gating it behind the premium role would leave the
 *  people it is about unable to see it. Only aggregates ever leave the
 *  server — no row, no wallet, no collection. */
export async function CardStatsPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const stats: EconomyStats | null = season ? await fetchEconomyStats(service, season) : null;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            {league === "academy" ? "Academy" : "Premier"} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Ledger</h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Everything the league has opened, spent and is holding this season. Card counts are what
            exists right now — dusting destroys a copy, so a card someone melted down is gone from
            these figures as well as from their collection.
            {stats && stats.excludedCount > 0 ? (
              <>
                {" "}
                Dev wallets are left out of every figure — {stats.excludedCount} account
                {stats.excludedCount === 1 ? "" : "s"} that opened packs on test money, which would
                drown the real numbers.
              </>
            ) : null}
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/stats" />
      </header>

      {!stats || stats.cardsPulled === 0 ? (
        <p className="text-sm text-steel">
          Nothing opened yet this season. The ledger fills up as packs get bought.
        </p>
      ) : (
        <>
          <section aria-label="Totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure value={stats.packsOpened.toLocaleString()} label="Packs opened" />
            <Figure value={fmtPoints(stats.spent)} label="Spent on packs" />
            <Figure
              value={stats.cardsPulled.toLocaleString()}
              label="Cards in circulation"
              note="Dusted copies leave the count"
            />
            <Figure value={stats.collectors.toLocaleString()} label="Collectors" />
          </section>

          <section aria-label="Rare cards in circulation" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure value={stats.signed.toLocaleString()} label="Signed" note={rate(stats.signed, stats.cardsPulled)} />
            <Figure value={stats.foils.toLocaleString()} label="Foils" note={rate(stats.foils, stats.cardsPulled)} />
            <Figure value={stats.altArts.toLocaleString()} label="Alternate prints" note={rate(stats.altArts, stats.cardsPulled)} />
            <Figure
              value={stats.momentsMinted.toLocaleString()}
              label="Moments minted"
              note="Minted by the league; pullable from that week's pack"
            />
          </section>

          {/* The parallels, thinnest last. A ladder is only worth having if
              the league can see how thin the top of it is — "3 Cracked Ice
              exist" is the number people repeat. */}
          <section aria-label="Foil parallels" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {FOIL_TYPES.map((type) => (
              <Figure
                key={type}
                value={(stats.foilsByType[type] ?? 0).toLocaleString()}
                label={FOIL_TYPE_LABELS[type]}
                note={rate(stats.foilsByType[type] ?? 0, stats.cardsPulled)}
              />
            ))}
          </section>

          {/* The Faceless Drop's own shelf — only once something has minted.
              Counts here are a subset of the totals above, and per-rank is
              the number collectors trade on ("only four Jokers exist"). */}
          {stats.champions.total > 0 ? (
            <section aria-label="The Faceless Drop" className="flex flex-col gap-4">
              <div>
                <span className="label-dash text-[#ff6b76]">🂡 The Faceless Drop · {CHAMPIONS_SEASON} champions</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Figure value={stats.champions.total.toLocaleString()} label="Relics in circulation" note="Dusted copies leave the count" />
                <Figure value={stats.champions.foils.toLocaleString()} label="Foiled relics" note={rate(stats.champions.foils, stats.champions.total)} />
                <Figure value={stats.champions.signed.toLocaleString()} label="Autographed relics" note="Real ink only" />
                <Figure value={stats.champions.altArts.toLocaleString()} label="Alternate prints" note={rate(stats.champions.altArts, stats.champions.total)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {CHAMPIONS_SET.map((def) => (
                  <Figure
                    key={def.rank}
                    value={(stats.champions.byRank[def.rank] ?? 0).toLocaleString()}
                    label={`${def.rank}♠ · ${def.name}`}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Roster plates. `weeks` is the figure that makes a plate a
              collectible rather than a duplicate: the same team pulled in
              four different weeks is four different rosters. */}
          {stats.teams.total > 0 ? (
            <section aria-label="Roster plates" className="flex flex-col gap-4">
              <div>
                <span className="label-dash text-mint">▚ Team cards · the roster plates</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Figure
                  value={stats.teams.total.toLocaleString()}
                  label="Plates in circulation"
                  note={rate(stats.teams.total, stats.cardsPulled)}
                />
                <Figure
                  value={stats.teams.foils.toLocaleString()}
                  label="Foiled plates"
                  note={rate(stats.teams.foils, stats.teams.total)}
                />
                <Figure
                  value={stats.teams.weeks.toLocaleString()}
                  label="Editions minted"
                  note="A team's plate is re-cut every week"
                />
                <Figure
                  value={stats.teams.byTeam.length.toLocaleString()}
                  label="Rosters pulled"
                  note={stats.teams.byTeam[0] ? `Most held: ${stats.teams.byTeam[0].teamName}` : undefined}
                />
              </div>
              <ul className="card-brand flex flex-col divide-y divide-white/5 p-0">
                {stats.teams.byTeam.map((team) => (
                  <li key={team.teamName} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className="truncate text-sm font-semibold text-white">{team.teamName}</span>
                    <span className="text-sm tabular-nums text-steel">
                      {team.copies.toLocaleString()} held
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* The expedition board. Runs are an action rather than an object,
              so nothing deletes them — these are the only true totals on the
              page, and the note says so. */}
          {stats.expeditions.runs > 0 ? (
            <section aria-label="Expeditions" className="flex flex-col gap-4">
              <div>
                <span className="label-dash text-[#f0b429]">⛰ Expeditions · squads sent out</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Figure
                  value={stats.expeditions.runs.toLocaleString()}
                  label="Runs launched"
                  note="A run is never deleted — this is the real total"
                />
                <Figure value={stats.expeditions.runners.toLocaleString()} label="People running them" />
                <Figure
                  value={stats.expeditions.inField.toLocaleString()}
                  label="Squads still out"
                  note="Launched, not yet claimed"
                />
                <Figure
                  value={fmtPoints(stats.expeditions.dollars)}
                  label="Paid out"
                  note={`${stats.expeditions.comps.toLocaleString()} free packs · ${stats.expeditions.marks.toLocaleString()} marks earned`}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {EXPEDITION_TIER_ORDER.map((key) => (
                  <Figure
                    key={key}
                    value={(stats.expeditions.byTier[key] ?? 0).toLocaleString()}
                    label={EXPEDITION_TIERS[key].label}
                    note={`${EXPEDITION_TIERS[key].durationHours}h out`}
                  />
                ))}
                <Figure
                  value={stats.expeditions.jackpots.toLocaleString()}
                  label="Jackpots"
                  note={rateOf(stats.expeditions.jackpots, stats.expeditions.runs, "runs")}
                />
              </div>
            </section>
          ) : null}

          <section aria-label="Standouts" className="grid gap-4 sm:grid-cols-2">
            {stats.bestPull ? (
              <div className="card-brand flex flex-col gap-1 p-5">
                <span className="label-dash">Best card pulled</span>
                <span className="font-display text-2xl font-bold text-white">{stats.bestPull.playerName}</span>
                <span className="text-sm text-steel">
                  {stats.bestPull.overall} OVR · {tierLabel(stats.bestPull.tier)}
                </span>
              </div>
            ) : null}
            {stats.mostPulled ? (
              <div className="card-brand flex flex-col gap-1 p-5">
                <span className="label-dash">Most pulled player</span>
                <span className="font-display text-2xl font-bold text-white">{stats.mostPulled.playerName}</span>
                <span className="text-sm text-steel">
                  {stats.mostPulled.copies.toLocaleString()} cop{stats.mostPulled.copies === 1 ? "y" : "ies"} in circulation
                </span>
              </div>
            ) : null}
          </section>

          {stats.truncated ? (
            <p className="text-xs text-steel">
              These figures are a floor — the season has more rows than this page reads in one pass.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

export default async function CardStatsPage() {
  return CardStatsPageView({ league: "premier" });
}
