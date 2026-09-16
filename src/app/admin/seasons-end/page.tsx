import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchSeasonsEnd } from "@/lib/cards/seasonsEnd/queries";
import { championSplashUrl } from "@/lib/match-draft/champions";
import styles from "./preview.module.css";

export const metadata: Metadata = { title: "Season’s End — Admin Preview", robots: {index:false,follow:false} };
export default async function SeasonsEndPage({searchParams}:{searchParams:Promise<{league?:string;season?:string}>}) {
  const supabase=await createServerSupabase();
  const {isAdmin,isOwner}=await fetchStaffTier(supabase);
  if(!isAdmin && !isOwner) redirect("/");
  const params=await searchParams;
  const league=params.league==="academy"?"academy":"premier";
  let data: Awaited<ReturnType<typeof fetchSeasonsEnd>> | undefined;
  try {data=await fetchSeasonsEnd(supabase,league,params.season);} catch { /* Fail visibly rather than render partial winners. */ }
  return <main className={`${styles.preview} mx-auto w-full max-w-7xl px-6 py-12`}>
    <header className="mb-9 flex flex-col gap-3">
      <Link href="/admin" className="label-dash">← Admin</Link>
      <p className="text-xs uppercase tracking-[.25em] text-gold">Private preview · Collection 01</p>
      <h1 className="type-display text-5xl sm:text-7xl">Season&apos;s End</h1>
      <p className="max-w-2xl text-muted">The players, partnerships and performances that defined the regular season. Twelve award families, calculated from real stats. Preview only: no cards are minted.</p>
      <form className="flex flex-wrap items-end gap-3" action="/admin/seasons-end">
        <label className="flex flex-col gap-1 text-sm">League<select aria-label="League" name="league" defaultValue={league} className={styles.select}><option value="premier">Premier</option><option value="academy">Academy</option></select></label>
        <label className="flex flex-col gap-1 text-sm">Season<select aria-label="Season" name="season" defaultValue={data?.season??""} className={styles.select}><option value="">Latest in selected league</option>{data?.options.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <button className={styles.button} type="submit">View collection</button>
      </form>
      {data?.result && <p className="text-sm text-muted">{league === "academy" ? "Academy" : "Premier"} · {data.season} · Regular season · {data.result.games} complete games · {data.result.players} players</p>}
      <p className="text-xs text-muted">Live, provisional calculations. Final awards require a complete ingest and confirmed standings. Role percentile uses the existing fantasy game score compared with all same-role games in this season.</p>
    </header>
    {!data ? <p role="alert" className="card-brand p-6">Season stats could not be loaded. Refresh to retry; no partial winners are displayed.</p> : !data.result ? <p className="card-brand p-6">No seasons with stats are available for this league.</p> : <>
      {data.result.warnings.length>0 && <aside aria-label="Data coverage" className="mb-8 rounded-xl border border-gold/40 p-4 text-sm text-gold">{data.result.warnings.map(w=><p key={w}>{w}</p>)}</aside>}
      <nav aria-label="Award families" className="mb-10 flex flex-wrap gap-2">{data.result.awards.map(a=><a className={styles.jump} key={a.id} href={`#${a.id}`}>{a.title} <span>{a.winners.length}</span></a>)}</nav>
      <div className="flex flex-col gap-14">{data.result.awards.map((award,index)=><section id={award.id} key={award.id} aria-labelledby={`${award.id}-title`}>
        <div className="mb-5 flex flex-wrap items-baseline gap-3"><span className="font-mono text-sm text-gold">{String(index+1).padStart(2,"0")}</span><h2 id={`${award.id}-title`} className="type-display text-3xl">{award.title}</h2><span className="text-sm text-muted">{award.winners.length} {award.winners.length===1?"card":"cards"}</span></div>
        <p className="mb-5 max-w-3xl text-sm text-muted">{award.rule}</p>
        {award.winners.length===0 ? <div className="card-brand p-6 text-sm text-muted">{award.unavailable??"No qualifying winner in this season. Minimum appearances and positive-stat requirements apply."}</div> : <div className={styles.grid}>{award.winners.map(winner=>{
          const art=winner.champion ? championSplashUrl(winner.champion,0):null;
          return <article key={winner.key} className={`${styles.card} ${styles[award.family]}`}>
            <div className={styles.art} style={art ? {backgroundImage:`linear-gradient(180deg, transparent 10%, #101620 100%), url("${art}")`}:undefined} />
            <div className={styles.topline}><span>{data.season} · {league}</span><span>REGULAR</span></div>
            <div className={styles.content}>
              <p className={styles.collection}>{award.family === "sovereign" ? winner.champion : award.family === "record" ? "Record breakers" : "Season’s End"}</p>
              <h3 className={styles.title}>{award.title}</h3>
              <p className={styles.name}>{winner.name}</p>
              <div className={styles.value}>{winner.display}</div>
              <p className={styles.evidence}>{winner.evidence}</p>
              {winner.roster && <details className={styles.details}><summary>Season roster · {winner.roster.length} contributors</summary><ul>{winner.roster.map(n=><li key={n}>{n}</li>)}</ul></details>}
              <div className={styles.seal}><span>SEASON ARCHIVE</span><span>ADMIN PREVIEW</span></div>
            </div>
          </article>;
        })}</div>}
      </section>)}</div>
    </>}
  </main>;
}
