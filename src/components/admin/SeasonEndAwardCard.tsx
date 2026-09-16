import type { SeasonAward } from "@/lib/season-end/derive";

const format = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function unitFor(award: SeasonAward): string {
  if (award.unit === "gold") return "$";
  if (award.unit) return award.unit;
  if (award.id === "speedrunners") return "minutes";
  if (award.id === "fortress") return "towers/game";
  return "";
}

/** Season-end honors show the stat that won, never a derived player rating. */
export default function SeasonEndAwardCard({ award, season, league, index }: { award: SeasonAward; season: string; league: "premier" | "academy"; index: number }) {
  const unit = unitFor(award);
  return <article aria-labelledby={`title-${award.id}`} className="relative flex min-h-80 flex-col overflow-hidden rounded-xl border border-gold/50 bg-panel p-6 shadow-lg" style={{ backgroundImage: "radial-gradient(ellipse at top right, rgb(241 207 128 / .14), transparent 65%)" }}>
    <div className="mb-6 flex justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-steel"><span>{season} · Regular season</span><span>{String(index + 1).padStart(2, "0")} / HONORS</span></div>
    <h3 id={`title-${award.id}`} className="type-display text-2xl leading-tight text-gold">{award.title}</h3>
    <p className="mt-3 text-xs leading-relaxed text-steel">{award.description}</p>
    {award.winners.length ? <div className="mt-6 flex flex-1 flex-col gap-5">{award.winners.map((winner, winnerIndex) => <div key={`${winner.name}-${winnerIndex}`}>
      <p className="break-words font-mono text-4xl font-black tracking-tighter sm:text-5xl">{unit === "$" ? "$" : ""}{format(winner.value)}{unit && unit !== "$" ? <span className="ml-2 text-sm font-normal text-steel">{unit}</span> : null}</p>
      <p className="mt-4 break-words text-lg font-semibold">{winner.name}</p>
      <p className="text-xs text-steel">{winner.name !== winner.team ? `${winner.team} · ` : ""}{winner.games} {award.id === "clean-sweep" ? "series" : "games"}</p>
      {winner.detail ? <p className="mt-2 text-xs leading-relaxed text-steel">{winner.detail}</p> : null}
    </div>)}</div> : <div className="mt-6 flex-1"><p className="text-lg text-steel">{award.status === "unearned" ? "Not earned yet" : "Awaiting evidence"}</p>{award.note ? <p className="mt-2 text-xs text-steel">{award.note}</p> : null}</div>}
    <p className="mt-6 border-t border-line pt-3 font-mono text-[10px] uppercase tracking-widest text-steel">{award.winners.length > 1 ? `${award.winners.length} shared winners` : award.status === "ready" ? "Season leader" : "No winner declared"} · {league}</p>
  </article>;
}
