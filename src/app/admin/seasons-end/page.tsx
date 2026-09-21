import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SeasonEndAwardCard from "@/components/admin/SeasonEndAwardCard";
import SeasonEndLeagueSelect from "@/components/admin/SeasonEndLeagueSelect";
import SeasonEndReleasePanel from "@/components/admin/SeasonEndReleasePanel";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchSeasonCards } from "@/lib/cards/queries";
import { readViewerDiscordId } from "@/lib/cards/viewer";
import { BEST_OF_MIN_CHAMPION_GAMES, BEST_OF_EXPANSION_MIN_GAMES, BEST_OF_EXPANSION_MIN_WINS } from "@/lib/season-end/best-of";
import { AWARD_GROUPS } from "@/lib/season-end/catalog";
import type { SeasonEndResult } from "@/lib/season-end/derive";
import { loadSeasonEnd, loadSeasonEndTeamIdentities, type SeasonEndTeamIdentityMap } from "@/lib/season-end/queries";
import { fetchSeasonEndCatalog, fetchSeasonEndRelease } from "@/lib/season-end/release-queries";
import { resolveLeagueView, type LeagueView } from "@/lib/league/context";
import { fetchPatronActive } from "@/lib/patron/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import styles from "./preview.module.css";

export const metadata: Metadata = { title: "Season’s End · FPL" };

const SEASON_BY_LEAGUE = {
  premier: "S5",
  academy: "A1",
} as const satisfies Record<LeagueView, string>;

/** The Season's End collection, with controls and diagnostics reserved for staff. */
export default async function SeasonsEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = await createServerSupabase();
  const tier = await fetchStaffTier(client);
  const staff = tier.isAdmin || tier.isOwner;
  if (!staff) {
    const discordId = await readViewerDiscordId(client);
    const patron = discordId
      ? await fetchPatronActive(createBettingServiceClient(), discordId)
      : false;
    if (!patron) redirect("/admin");
  }

  const params = await searchParams;
  const league = resolveLeagueView(params.league);
  const season = SEASON_BY_LEAGUE[league];
  let result: SeasonEndResult | null = null;
  let allSeasonCards: Awaited<ReturnType<typeof fetchSeasonCards>> = [];
  let seasonCards: Awaited<ReturnType<typeof fetchSeasonCards>> = [];
  let teamIdentities: SeasonEndTeamIdentityMap = {};
  let error: string | null = null;
  let seasonCardsError = false;

  try {
    result = await loadSeasonEnd(client, league, season);
  } catch {
    error = "Season data could not be loaded completely. Retry after checking the stats and fixture data; no winners have been declared.";
  }
  // The honors desk is still useful when the richer normal-card rendering
  // cannot be assembled. Do not turn a garnish query into a page failure.
  if (result) {
    const [identityResult, cardsResult] = await Promise.all([
      loadSeasonEndTeamIdentities(client, league, season).catch(() => ({})),
      fetchSeasonCards(client, season).catch(() => null),
    ]);
    teamIdentities = identityResult;
    if (cardsResult) {
      allSeasonCards = cardsResult;
      seasonCards = allSeasonCards.filter((card) => card.level > 5);
    } else {
      seasonCardsError = true;
    }
  }
  const bestOfDiagnostics = result?.awards.find((award) => award.id === "best-of-champion")?.bestOfDiagnostics;
  const release = await fetchSeasonEndRelease(createBettingServiceClient(), league, season);
  const releaseCatalog = release ? await fetchSeasonEndCatalog(createBettingServiceClient(), release) : null;

  return (
    <main className={`${styles.preview} page-backdrop flex w-full flex-1 flex-col gap-10 px-3 py-8 sm:px-5 lg:px-7 2xl:px-10`}>
      <header className="flex flex-col gap-4">
        <Link href={staff ? "/admin" : "/cards"} className="label-dash w-fit hover:text-coral">{staff ? "← Admin" : "← Cards"}</Link>
        <p className="text-xs uppercase tracking-[.3em] text-gold">The season, in good company</p>
        <h1 className="type-display text-4xl sm:text-6xl">Season&apos;s End</h1>
        <p className="max-w-3xl text-sm text-steel">
          Regular-season honors, calculated from recorded matches. Ordinary player, pair, and Teamwork honors are awarded separately to Solari and Lunari; the sun and moon marks identify each division. Best of Champions ranks results once across the selected league, while cumulative Season Cards retain their existing treatment.
        </p>
        <SeasonEndLeagueSelect league={league} />
        {staff ? <>
          <p className="w-fit border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-[.18em] text-gold">Admin preview · read-only</p>
          <Link href="/admin/seasons-end/crop-audit" className="w-fit rounded border border-line px-3 py-2 text-xs uppercase tracking-[.16em] text-gold hover:border-gold">Developer crop audit</Link>
        </> : null}
      </header>

      {staff ? <SeasonEndReleasePanel league={league} season={season} release={release} catalog={releaseCatalog} /> : null}

      {error ? <p role="alert" className="card-brand p-5 text-coral">{error}</p> : null}
      {staff && result ? <section aria-label="Season coverage" className="card-brand flex flex-col gap-3 p-5">
        <p className="font-semibold">{league === "premier" ? "Premier" : "Academy"} · {season} · {result.games} games · {result.players} players</p>
        <p className="text-sm text-gold">{result.complete ? "All scheduled regular-season series are complete. Results reflect currently ingested stats." : "Provisional leaders — regular-season fixtures are unfinished or unavailable."}</p>
        <p className="text-sm text-steel">Rate and performance awards require {result.minGames} measured games. Speedrunners requires three wins. Best of Champion requires at least {result.minGames} regular-season games overall. Selection first preserves winners with at least {BEST_OF_MIN_CHAMPION_GAMES} champion games, then adds unclaimed champions with at least {BEST_OF_EXPANSION_MIN_GAMES} games and {BEST_OF_EXPANSION_MIN_WINS} win. Remaining players can receive their best unclaimed champion from any recorded appearance, including winless records. Each pass ranks champion wins, win rate, and mean role-relative performance; earlier picks stay fixed. A player and a champion can receive at most one card. Missing required observations leave an award unavailable.</p>
        {bestOfDiagnostics ? (
          <details className="text-sm text-steel">
            <summary className="cursor-pointer text-white">Best of eligibility &amp; selection</summary>
            <p className="mt-3">{bestOfDiagnostics.awardedPlayers} of {bestOfDiagnostics.eligiblePlayers} eligible players received a card from {bestOfDiagnostics.qualifyingCandidates} qualifying player/champion records. Champions with no qualifying record remain unawarded; the one-card cap can also leave a qualifying champion or player without a card.</p>
            {bestOfDiagnostics.playersWithoutCard.length ? <p className="mt-2">Players without a Best of card ({bestOfDiagnostics.playersWithoutCard.length}): {bestOfDiagnostics.playersWithoutCard.map((player) => player.playerName).join(", ")}.</p> : null}
            {bestOfDiagnostics.passCounts ? <p className="mt-2">Selection passes: {bestOfDiagnostics.passCounts.original} original, {bestOfDiagnostics.passCounts.expansion} two-game additions, {bestOfDiagnostics.passCounts.remaining} remaining-player additions.</p> : null}
            {bestOfDiagnostics.capPromotions.length ? <p className="mt-2">Cap-related promotions: {bestOfDiagnostics.capPromotions.map((promotion) => `${promotion.recipientName} received Best of ${promotion.champion} after ${promotion.unrestrictedLeaderName} was blocked by the player cap`).join("; ")}.</p> : null}
          </details>
        ) : null}
        {result.warnings.map((warning) => <p key={warning} className="text-sm text-coral">{warning}</p>)}
        <details className="text-sm text-steel"><summary className="cursor-pointer text-white">Scoring &amp; mapping notes</summary><p className="mt-3">Performance is the mean of five same-role, per-game percentile scores: KDA, champion damage/min, CS/min, vision/min and kill participation. Best of Champion sorts qualifying champion records by wins, then unrounded win rate, then unrounded mean role-relative performance, with canonical champion ID and normalized player key resolving exact ties. The allocation walks that strongest-result-first order once and skips an already-awarded player or champion; it does not reroute a winner to improve coverage. Late Bloomer uses the final third of league games in chronological order. Metronome requires a mean of 60 and a per-game floor of 40. Chronological ties use match ID. Bloodline follows each player’s appearances. Team standings use series wins, then losses; tied teams remain tied.</p></details>
      </section> : null}
      {result ? <>
        <nav aria-label="Award groups" className="flex flex-wrap gap-3 text-sm">
          {AWARD_GROUPS.map((group, index) => <a key={group} href={`#group-${index}`} className="rounded-full border border-line px-4 py-2 hover:border-gold">{group}</a>)}
          <a href="#season-cards" className="rounded-full border border-line px-4 py-2 hover:border-gold">Cards of the Season</a>
        </nav>

        {AWARD_GROUPS.map((group, groupIndex) => {
          const awards = result.awards.filter((award) => award.group === group);
          return (
            <section id={`group-${groupIndex}`} key={group} aria-label={group} className="scroll-mt-8">
              <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-3"><span className="font-mono text-sm text-steel">{String(groupIndex + 1).padStart(2, "0")}</span><h2 className="type-display text-3xl text-gold">{group}</h2></div>
              <div className={`${styles.cardRow} ${group === "Best of Champions" ? styles.bestOfCardRow : styles.ordinaryCardRow}`}>
                {awards.map((award, index) => <SeasonEndAwardCard key={award.id} award={award} season={season} league={league} index={index} cards={allSeasonCards} teamIdentities={teamIdentities} showAdminDetails={staff} showBestOfDetails={false} showBestOfVariants={false} />)}
              </div>
            </section>
          );
        })}

        <section id="season-cards" aria-label="Cards of the Season" className="scroll-mt-8">
          <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-3"><span className="font-mono text-sm text-steel">{String(AWARD_GROUPS.length + 1).padStart(2, "0")}</span><h2 className="type-display text-3xl text-gold">Cards of the Season</h2></div>
          <p className="mb-5 max-w-3xl text-sm text-steel">Cumulative player cards for regular contributors (more than five games). Unlike accolade cards, these retain their standard season OVR, tier, and stat lines.</p>
          {seasonCardsError ? <p className="card-brand p-5 text-steel">Cumulative Season Cards could not be assembled, but the accolade results above are still available.</p> : seasonCards.length ? <div className="card-shelf flex flex-wrap justify-center gap-x-0 gap-y-4">{seasonCards.map((card) => <div key={card.slug} className="card-cell flex flex-col items-center gap-2"><PlayerCard3D card={card} edition="season" /><Link href={`/card/${card.slug}?customize=1&edition=season`} className="text-xs font-semibold uppercase tracking-wide text-action-text hover:text-coral">Customize Season Card →</Link></div>)}</div> : <p className="card-brand p-5 text-steel">No players have more than five recorded games for this season yet.</p>}
        </section>
      </> : null}
    </main>
  );
}
