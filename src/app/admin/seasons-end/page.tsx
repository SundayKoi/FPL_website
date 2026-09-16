import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import SeasonEndAwardCard from "@/components/admin/SeasonEndAwardCard";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchSeasonCards } from "@/lib/cards/queries";
import { AWARD_GROUPS } from "@/lib/season-end/catalog";
import type { SeasonEndResult } from "@/lib/season-end/derive";
import { loadSeasonEnd } from "@/lib/season-end/queries";
import { resolveLeagueView } from "@/lib/league/context";
import { fetchLeagueSeasons, seasonBelongsToLeague } from "@/lib/league/season";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Season’s End · FPL Admin" };

/** The single, admin-only Season's End collection. */
export default async function SeasonsEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = await createServerSupabase();
  const staff = await fetchStaffTier(client);
  if (!staff.isAdmin && !staff.isOwner) redirect("/admin");

  const params = await searchParams;
  const league = resolveLeagueView(params.league);
  const seasons = await fetchLeagueSeasons(client);
  const season = (typeof params.season === "string" ? params.season : seasons[league]).trim();
  let result: SeasonEndResult | null = null;
  let allSeasonCards: Awaited<ReturnType<typeof fetchSeasonCards>> = [];
  let seasonCards: Awaited<ReturnType<typeof fetchSeasonCards>> = [];
  let error: string | null = null;
  let seasonCardsError = false;

  if (!seasonBelongsToLeague(season, league)) {
    error = "Choose a season belonging to the selected league (S for Premier, A for Academy).";
  } else {
    try {
      result = await loadSeasonEnd(client, league, season);
    } catch {
      error = "Season data could not be loaded completely. Retry after checking the stats and fixture data; no winners have been declared.";
    }
    // The honors desk is still useful when the richer normal-card rendering
    // cannot be assembled. Do not turn a garnish query into a page failure.
    if (result) {
      try {
        allSeasonCards = await fetchSeasonCards(client, season);
        seasonCards = allSeasonCards.filter((card) => card.level > 5);
      } catch {
        seasonCardsError = true;
      }
    }
  }

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-4">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">← Admin</Link>
        <p className="text-xs uppercase tracking-[.3em] text-gold">The season, in good company</p>
        <h1 className="type-display text-4xl sm:text-6xl">Season&apos;s End</h1>
        <p className="max-w-3xl text-sm text-steel">
          Regular-season honors, calculated from recorded matches. Each accolade uses the original champion-art archive card treatment; cumulative Season Cards retain their normal card treatment.
        </p>
        <form className="flex flex-wrap items-end gap-3" action="/admin/seasons-end">
          <label className="flex flex-col gap-1 text-sm">League<select name="league" defaultValue={league} className="rounded border border-line bg-panel p-2"><option value="premier">Premier</option><option value="academy">Academy</option></select></label>
          <label className="flex flex-col gap-1 text-sm">Season<input name="season" defaultValue={season} placeholder={seasons[league]} className="w-28 rounded border border-line bg-panel p-2" required maxLength={32} /></label>
          <button type="submit" className="rounded border border-gold px-4 py-2 text-sm text-gold hover:bg-gold/10">Calculate cards</button>
        </form>
      </header>

      {error ? <p role="alert" className="card-brand p-5 text-coral">{error}</p> : null}
      {result ? <>
        <section aria-label="Season coverage" className="card-brand flex flex-col gap-3 p-5">
          <p className="font-semibold">{league === "premier" ? "Premier" : "Academy"} · {season} · {result.games} games · {result.players} players</p>
          <p className="text-sm text-gold">{result.complete ? "All scheduled regular-season series are complete. Results reflect currently ingested stats." : "Provisional leaders — regular-season fixtures are unfinished or unavailable."}</p>
          <p className="text-sm text-steel">Rate and performance awards require {result.minGames} measured games (at least five and half the busiest player’s appearances). Speedrunners requires three wins. Missing required observations leave an award unavailable.</p>
          {result.warnings.map((warning) => <p key={warning} className="text-sm text-coral">{warning}</p>)}
          <details className="text-sm text-steel"><summary className="cursor-pointer text-white">Scoring & mapping notes</summary><p className="mt-3">Performance is the mean of five same-role, per-game percentile scores: KDA, champion damage/min, CS/min, vision/min and kill participation. Late Bloomer uses the final third of league games in chronological order. Metronome requires a mean of 60 and a per-game floor of 40. Chronological ties use match ID. Streaks follow each player’s appearances. Team standings use series wins, then losses; tied teams remain tied.</p></details>
        </section>

        <nav aria-label="Award groups" className="flex flex-wrap gap-3 text-sm">
          {AWARD_GROUPS.map((group, index) => <a key={group} href={`#group-${index}`} className="rounded-full border border-line px-4 py-2 hover:border-gold">{group}</a>)}
          <a href="#season-cards" className="rounded-full border border-line px-4 py-2 hover:border-gold">Season Cards</a>
        </nav>

        {AWARD_GROUPS.map((group, groupIndex) => {
          const awards = result.awards.filter((award) => award.group === group);
          return (
            <section id={`group-${groupIndex}`} key={group} aria-label={group} className="scroll-mt-8">
              <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-3"><span className="font-mono text-sm text-steel">0{groupIndex + 1}</span><h2 className="type-display text-3xl text-gold">{group}</h2></div>
              <div className="flex flex-col gap-8">
                {awards.map((award, index) => <SeasonEndAwardCard key={award.id} award={award} season={season} league={league} index={index} cards={allSeasonCards} />)}
              </div>
            </section>
          );
        })}

        <section id="season-cards" aria-label="Season Cards" className="scroll-mt-8">
          <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-3"><span className="font-mono text-sm text-steel">06</span><h2 className="type-display text-3xl text-gold">Season Cards</h2></div>
          <p className="mb-5 max-w-3xl text-sm text-steel">Cumulative player cards for regular contributors (more than five games). Unlike accolade cards, these retain their standard season OVR, tier, and stat lines.</p>
          {seasonCardsError ? <p className="card-brand p-5 text-steel">Cumulative Season Cards could not be assembled, but the accolade results above are still available.</p> : seasonCards.length ? <div className="flex flex-wrap gap-5">{seasonCards.map((card) => <PlayerCard3D key={card.slug} card={card} />)}</div> : <p className="card-brand p-5 text-steel">No players have more than five recorded games for this season yet.</p>}
        </section>
      </> : null}
    </main>
  );
}
