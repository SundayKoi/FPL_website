import { Fragment } from "react";
import { ROLE_LABELS_SHORT } from "@/lib/draft/types";
import type { ScoutScope, ScopedScoutData } from "@/lib/scouting/types";
import ChampionDatum from "./ChampionDatum";

export default function ScoutPlayerPools({ data, scope, unavailable = false }: { data: ScopedScoutData; scope: ScoutScope; unavailable?: boolean }) {
  const scopeLabel = scope === "season" ? "Current season" : scope === "recent" ? "Recent series" : "All series";
  return <section aria-labelledby="player-pools-heading" className="card-brand p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="player-pools-heading" className="type-display text-2xl">Player pools</h2><span className="label-dash">{scopeLabel}</span></div>{unavailable ? <p className="mt-4 text-sm text-steel">Current roster unavailable</p> : <ul className="mt-4 grid gap-3 md:grid-cols-2">{data.playerPools.map((row) => <li key={row.playerName} className="rounded border border-line/70 bg-navy/40 p-3"><div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-white">{row.playerName}</span><span className="text-xs uppercase tracking-wider text-steel">{ROLE_LABELS_SHORT[row.role]}</span></div>{row.totalPicks === 0 ? <p className="mt-3 text-sm text-steel">No attributed picks yet</p> : <div className="mt-3 flex flex-wrap gap-2">{row.champions.slice(0, 5).map((champion) => <Fragment key={champion.champion}><ChampionDatum champion={champion.champion} /><span className="self-center text-xs text-steel">×{champion.count}</span></Fragment>)}</div>}<p className="mt-3 text-xs text-steel">{row.totalPicks} picks · {row.distinctChampions} champions · {row.gamesSampled} series</p></li>)}</ul>}</section>;
}
