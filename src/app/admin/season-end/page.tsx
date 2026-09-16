import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchLeagueSeasons, seasonBelongsToLeague } from "@/lib/league/season";
import { resolveLeagueView } from "@/lib/league/context";
import { loadSeasonEnd } from "@/lib/season-end/queries";
import { AWARD_GROUPS } from "@/lib/season-end/catalog";
import type { SeasonEndResult } from "@/lib/season-end/derive";

export const metadata: Metadata = { title: "Season-end cards · FPL Admin" };
const format = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const accents = { Teamwork: "#f1cf80", "Meme inserts": "#f2a1ba", "Season stories": "#b8b0ff", "Support & survival": "#90dac5", "Record breakers": "#ff9e79" };

export default async function SeasonEndPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const client = await createServerSupabase();
  const staff = await fetchStaffTier(client);
  if (!staff.isAdmin && !staff.isOwner) redirect("/admin");
  const params = await searchParams;
  const league = resolveLeagueView(params.league);
  const seasons = await fetchLeagueSeasons(client);
  const season = (typeof params.season === "string" ? params.season : seasons[league]).trim();
  let result: SeasonEndResult | null = null;
  let error: string | null = null;
  if (!seasonBelongsToLeague(season, league)) error = "Choose a season belonging to the selected league (S for Premier, A for Academy).";
  else {
    try { result = await loadSeasonEnd(client, league, season); }
    catch { error = "Season data could not be loaded completely. Retry after checking the stats and fixture data; no winners have been declared."; }
  }
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-4">
        <Link href="/admin" className="label-dash w-fit hover:text-coral">← Admin</Link>
        <p className="text-xs uppercase tracking-[.3em] text-gold">The season, in good company</p>
        <h1 className="type-display text-4xl sm:text-6xl">Season-end cards</h1>
        <p className="max-w-3xl text-sm text-steel">Real regular-season achievements, calculated from recorded matches. Tied leaders share the card. This desk displays results; it does not mint collectible copies.</p>
        <form className="flex flex-wrap items-end gap-3" action="/admin/season-end">
          <label className="flex flex-col gap-1 text-sm">League<select name="league" defaultValue={league} className="rounded border border-line bg-panel p-2"><option value="premier">Premier</option><option value="academy">Academy</option></select></label>
          <label className="flex flex-col gap-1 text-sm">Season<input name="season" defaultValue={season} placeholder={seasons[league]} className="w-28 rounded border border-line bg-panel p-2" required maxLength={32} /></label>
          <button type="submit" className="rounded border border-gold px-4 py-2 text-sm text-gold hover:bg-gold/10">Calculate cards</button>
        </form>
      </header>
      {error && <p role="alert" className="card-brand p-5 text-coral">{error}</p>}
      {result && <>
        <section aria-label="Season coverage" className="card-brand flex flex-col gap-3 p-5">
          <p className="font-semibold">{league === "premier" ? "Premier" : "Academy"} · {season} · {result.games} games · {result.players} players</p>
          <p className="text-sm text-gold">{result.complete ? "All scheduled regular-season series are complete. Results reflect currently ingested stats." : "Provisional leaders — regular-season fixtures are unfinished or unavailable."}</p>
          <p className="text-sm text-steel">Rate and performance awards require {result.minGames} measured games (at least five and half the busiest player’s appearances). Speedrunners requires three wins. Missing required observations leave an award unavailable.</p>
          {result.warnings.map(w => <p key={w} className="text-sm text-coral">{w}</p>)}
          <details className="text-sm text-steel"><summary className="cursor-pointer text-white">Scoring & mapping notes</summary><p className="mt-3">Performance is the mean of five same-role, per-game percentile scores: KDA, champion damage/min, CS/min, vision/min and kill participation. Late Bloomer uses the final third of league games in chronological order. Metronome requires a mean of 60 and a per-game floor of 40. Chronological ties use match ID. Streaks follow each player’s appearances. Team standings use series wins, then losses; tied teams remain tied.</p><p className="mt-3">Champion classes use all tags from <a className="underline" href="https://ddragon.leagueoflegends.com/cdn/16.16.1/data/en_US/champion.json">Riot Data Dragon 16.16.1</a>. Regions use <a className="underline" href="https://universe-meeps.leagueoflegends.com/v1/en_us/champion-browse/index.json">Riot Universe’s associated factions</a>, pinned September 16, 2026; unaffiliated champions add no region. Unknown champions block the affected award.</p></details>
        </section>
        <nav aria-label="Award groups" className="flex flex-wrap gap-3 text-sm">{AWARD_GROUPS.map((group, i) => <a key={group} href={`#group-${i}`} className="rounded-full border border-line px-4 py-2 hover:border-gold">{group}</a>)}</nav>
        {AWARD_GROUPS.map((group, i) => <section id={`group-${i}`} key={group} aria-label={group} className="scroll-mt-8">
          <div className="mb-5 flex items-baseline gap-4 border-b border-line pb-3"><span className="font-mono text-sm text-steel">0{i + 1}</span><h2 className="type-display text-3xl" style={{ color: accents[group] }}>{group}</h2></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {result.awards.filter(a => a.group === group).map((award, index) => <article key={award.id} aria-labelledby={`title-${award.id}`} className="relative flex min-h-80 flex-col overflow-hidden rounded-xl border border-line bg-panel p-6 shadow-lg" style={{ borderTop: `3px solid ${accents[group]}`, backgroundImage: `radial-gradient(ellipse at top right, ${accents[group]}18, transparent 65%)` }}>
              <div className="mb-6 flex justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-steel"><span>{season} · Regular season</span><span>{String(index + 1).padStart(2, "0")} / {group === "Meme inserts" ? "INSERT" : "HONORS"}</span></div>
              <h3 id={`title-${award.id}`} className="type-display text-2xl leading-tight" style={{ color: accents[group] }}>{award.title}</h3>
              <p className="mt-3 text-xs leading-relaxed text-steel">{award.description}</p>
              {award.winners.length ? <div className="mt-6 flex flex-1 flex-col gap-5">{award.winners.map((w, wi) => <div key={`${w.name}-${wi}`}>
                {group === "Record breakers" ? <><p className="break-words font-mono text-5xl font-black tracking-tighter sm:text-6xl">{format(w.total ?? w.value)}</p><p className="mt-1 text-xs uppercase tracking-widest text-steel">Season total · {format(w.perGame ?? w.value / w.games)} per game</p>{award.mode !== "total" && <p className="mt-2 font-mono text-lg" style={{color: accents[group]}}>{format(w.value)} {award.unit} · winning rate</p>}</> : <p className="break-words font-mono text-4xl font-bold">{format(w.value)} <span className="text-sm font-normal text-steel">{award.unit || (award.id === "speedrunners" ? "minutes" : award.id === "fortress" ? "towers/game" : "")}</span></p>}
                <p className="mt-4 break-words text-lg font-semibold">{w.name}</p><p className="text-xs text-steel">{w.name !== w.team ? `${w.team} · ` : ""}{w.games} {award.id === "clean-sweep" ? "series" : "games"}</p>
                {w.detail && <p className="mt-2 text-xs leading-relaxed text-steel">{w.detail}</p>}
              </div>)}</div> : <div className="mt-6 flex-1"><p className="text-lg text-steel">{award.status === "unearned" ? "Not earned yet" : "Awaiting evidence"}</p><p className="mt-2 text-xs text-steel">{award.note}</p></div>}
              <p className="mt-6 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-widest text-steel">{award.winners.length > 1 ? `${award.winners.length} shared winners` : award.status === "ready" ? "Season leader" : "No winner declared"} · {league}</p>
            </article>)}
          </div>
        </section>)}
      </>}
    </main>
  );
}
