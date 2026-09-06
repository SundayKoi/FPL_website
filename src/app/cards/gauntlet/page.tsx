import type { Metadata } from "next";
import Link from "next/link";
import EmptyShelf from "@/components/cards/EmptyShelf";
import GauntletClient from "@/components/gauntlet/GauntletClient";
import GauntletRules from "@/components/gauntlet/GauntletRules";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchAllCardSeasons } from "@/lib/cards/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { GAUNTLET_ENTRY_FEE } from "@/lib/gauntlet/run";
import { ascensionBadge } from "@/lib/gauntlet/ascension";
import {
  buildGauntletOptions,
  buildHeirloomOptions,
  currentWeek,
  fetchActiveGauntletRun,
  fetchAscension,
  fetchContractProgress,
  fetchGauntletBoard,
  fetchGauntletWeekStats,
  fetchLastLineup,
  type GauntletBoardRow,
} from "@/lib/gauntlet/queries";
import { PATRON_FLAMES, patronFlameOf } from "@/lib/patron/flames";

export const metadata: Metadata = {
  title: "The Gauntlet — FPL",
  description: "Draft five from your collection and climb an eight-round bracket. Lose once and the run ends.",
};

/**
 * The Gauntlet: a weekly roguelike run built from the viewer's own
 * collection. Same gate as the pack shop — betting dollars pay the entry,
 * so the wallet is the thing you need.
 */
export default async function GauntletPage() {
  const user = await getBettingUser();

  if (!user || !user.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">The Gauntlet</span>
        <h1 className="type-display text-3xl sm:text-4xl">
          {user ? "Premium members only" : "Sign in to run the Gauntlet"}
        </h1>
        <p className="max-w-md text-sm text-steel">
          A run costs betting dollars and fields cards from your collection — you need the wallet and the
          shelf both.
        </p>
        {!user ? (
          <Link href="/login?redirect=/cards/gauntlet" className="btn-pill mt-2">
            Sign in with Discord
          </Link>
        ) : null}
      </main>
    );
  }

  const service = createBettingServiceClient();
  // Both shelves field. The run is scored on the premier board — that is
  // where the pot and the ranking live — but which cards you may bring is
  // a question about your collection, not about where the run is filed.
  // The bracket scales to your lineup average, so a squad of academy cards
  // faces a bracket built from those numbers; nothing is unbalanced by
  // letting the pool be bigger, and a collector with both is no longer
  // told half of what they own is ineligible.
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season ?? null;
  const leagueOf = new Map(seasons.map((entry) => [entry.season, entry.league]));
  const week = currentWeek();
  const [inventory, activeRun, weekStats, board, lastLineup, ascensionUnlocked, contracts]: [
    Awaited<ReturnType<typeof fetchInventory>>,
    Awaited<ReturnType<typeof fetchActiveGauntletRun>>,
    Awaited<ReturnType<typeof fetchGauntletWeekStats>>,
    GauntletBoardRow[],
    number[],
    number,
    Awaited<ReturnType<typeof fetchContractProgress>>,
  ] = season
    ? await Promise.all([
        // Every shelf, flattened — buildGauntletOptions tags each copy with
        // the league it came off so the draft screen can say so.
        Promise.all(seasons.map((entry) => fetchInventory(service, user.discordId, entry.season))).then((shelves) =>
          shelves.flat(),
        ),
        fetchActiveGauntletRun(service, user.discordId),
        fetchGauntletWeekStats(service, user.discordId, week),
        fetchGauntletBoard(service, season, week),
        fetchLastLineup(service, user.discordId),
        fetchAscension(service, user.discordId, season),
        fetchContractProgress(service, user.discordId, season, week),
      ])
    : [[], null, { bestScore: 0, attempts: 0, lastFinished: null }, [], [], 0, { thisWeek: [], seasonTotal: 0 }];
  const options = buildGauntletOptions(inventory, week, leagueOf);
  // The same inventory read, picked over a second time: buildGauntletOptions
  // skips moments and plates (a relic has no role), and this collects them.
  const heirlooms = buildHeirloomOptions(inventory);

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">Premium · Premier · The Gauntlet</span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">The Gauntlet</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Draft five from your shelf — one per role, premier or academy — and climb an eight-round bracket scaled to your
            lineup. Every game pauses at 20:00 for your call — the stats and stakes printed on each choice.
            Win, add to the purse, pick a relic, go again — or bank the purse and stop; lose once and the run
            and the purse are gone. Entry is {GAUNTLET_ENTRY_FEE} betting dollars; the money out is the purse you
            bank and Monday&apos;s pot to the top of the board. Every roll is in the rulebook below.
          </p>
        </div>
        <div className="text-right text-sm">
          <span className="label-dash">This week</span>
          <p className="mt-1 font-mono text-2xl font-bold">{weekStats.bestScore.toLocaleString()}</p>
          <p className="text-xs text-steel">
            best score · {weekStats.attempts} run{weekStats.attempts === 1 ? "" : "s"}
            {ascensionUnlocked > 0 ? ` · ascension ${ascensionUnlocked} unlocked` : ""}
          </p>
        </div>
      </header>

      {inventory.length === 0 ? <EmptyShelf base="/cards" goal="draft a run" /> : null}
      <GauntletClient
        initialRun={activeRun}
        options={options}
        balance={user.balance}
        weekBest={weekStats.bestScore}
        lastLineup={lastLineup}
        heirlooms={heirlooms}
        ascensionUnlocked={ascensionUnlocked}
        week={week}
        contractsDone={contracts.thisWeek}
        contractsSeason={contracts.seasonTotal}
      />

      <GauntletRules />

      <section aria-label="This week's board" className="card-brand flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="label-dash">This week&apos;s board</span>
          <span className="text-xs text-steel">
            Best run per player, weighed by ascension (+10% a level) and drafted mode (×1.15) · the pot (every entry
            fee paid, less the purses banked) settles Monday — 40/25/15% to the top three, scraps for everyone who
            cleared round 4.
          </span>
        </div>
        {board.length === 0 ? (
          <p className="text-sm text-steel">Nobody has run yet this week. The board is yours to open.</p>
        ) : (
          <ol className="flex flex-col">
            {board.map((row, index) => {
              const flameStyle = row.flame ? PATRON_FLAMES[patronFlameOf(row.flame)] : null;
              return (
                <li
                  key={row.discordId}
                  className={`flex items-baseline gap-3 border-b border-line/50 py-2 last:border-0 ${row.discordId === user.discordId ? "bg-coral/5" : ""}`}
                >
                  <span className={`w-8 font-mono text-sm font-bold ${index === 0 ? "text-gold" : "text-steel"}`}>
                    #{index + 1}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-white">
                    {row.username}
                    {flameStyle ? (
                      <span
                        aria-label="League Patron"
                        title={`League Patron — ${flameStyle.label} flame`}
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          background: `radial-gradient(circle, ${flameStyle.hot} 0 35%, ${flameStyle.core} 75%)`,
                          boxShadow: `0 0 6px ${flameStyle.core}`,
                        }}
                      />
                    ) : null}
                    {row.cleared ? <span title="Full clear">🏆</span> : null}
                    {row.drafted ? (
                      <span title="Drafted from a dealt hand" className="rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-steel">
                        D
                      </span>
                    ) : null}
                    {row.ascension > 0 ? (
                      <span
                        title={`Ascension ${row.ascension}`}
                        className="rounded-full border border-coral/60 bg-coral/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-coral"
                      >
                        {ascensionBadge(row.ascension)}
                      </span>
                    ) : null}
                  </span>
                  <span className="ml-auto font-mono text-sm font-semibold" title={row.ascension > 0 ? `${row.score.toLocaleString()} raw` : undefined}>
                    {row.weighted.toLocaleString()}
                  </span>
                  <span className="w-24 text-right text-xs text-steel">
                    {row.cleared ? "cleared" : `round ${row.round}`}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
