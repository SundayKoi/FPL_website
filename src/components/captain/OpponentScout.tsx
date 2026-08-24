"use client";

import { useMemo, useState } from "react";
import { formatKickoff } from "@/lib/schedule/format";
import { deriveScoutData } from "@/lib/scouting/derive";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";
import ScoutPatterns from "./scouting/ScoutPatterns";
import ScoutPastDrafts from "./scouting/ScoutPastDrafts";
import ScoutPlayerPools from "./scouting/ScoutPlayerPools";
import type { InhousePlayerStats } from "@/lib/scouting/inhouse";

export default function OpponentScout({ source }: { source: ScoutSource }) {
  const [scope, setScope] = useState<ScoutScope>("season");
  const [mode, setMode] = useState<"regular" | "inhouse">("regular");
  const data = useMemo(() => deriveScoutData(source, scope), [source, scope]);
  const blueShare = data.gamesSampled ? Math.round((data.blueGames / data.gamesSampled) * 100) : 0;
  const hasDrafts = data.pastDrafts.length > 0;

  return <section aria-labelledby="scouting-heading" className="mt-8 space-y-4">
    <header className="card-brand p-5">
      <span className="label-dash text-gold">Premium · Scouting</span>
      <h2 id="scouting-heading" className="type-display mt-2 text-3xl">Scouting</h2>
      <p className="mt-2 max-w-2xl text-sm text-steel">{mode === "inhouse" ? "Champion performance from all available in-house games." : "A clear record of draft patterns and history. This section presents scouting context only."}</p>
      <p className="mt-3 text-sm text-steel"><span className="label-dash">Opponent</span> <span className="font-semibold text-white">{source.opponentName}</span></p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" role="switch" aria-checked={mode === "inhouse"} onClick={() => setMode((current) => current === "regular" ? "inhouse" : "regular")} className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-steel transition hover:border-cyan/60 hover:text-white">
          <span className={`h-2.5 w-2.5 rounded-full ${mode === "inhouse" ? "bg-cyan shadow-[0_0_8px_rgb(53_230_255/0.8)]" : "bg-steel/50"}`} />
          {mode === "inhouse" ? "In-house" : "Regular season"}
        </button>
        {mode === "regular" ? <label className="flex items-center gap-3 text-sm text-steel">Draft history<select aria-label="Draft history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className="input-brand px-3 py-2"><option value="season">Current season</option><option value="recent">Recent 5 series</option><option value="all">All history</option></select></label> : null}
      </div>
      {mode === "regular" && hasDrafts ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div><span className="label-dash">Next fixture</span><p className="mt-1 text-sm font-semibold text-white">{formatKickoff(source.nextFixture.scheduled_at)}</p><p className="text-xs text-steel">Bo{source.nextFixture.best_of} · vs {source.opponentName}</p></div>
        <div><span className="label-dash">Drafts sampled</span><p className="type-display mt-1 text-2xl">{data.gamesSampled}</p></div>
        <div><span className="label-dash">Blue-side share</span><p className="type-display mt-1 text-2xl">{blueShare}%</p><p className="text-xs text-steel">{data.blueGames} of {data.gamesSampled} games</p></div>
        <div><span className="label-dash">Champion pool</span><p className="type-display mt-1 text-2xl">{data.distinctChampions}</p></div>
        <div><span className="label-dash">Subject</span><p className="type-display mt-1 text-2xl">{source.opponentName}</p></div>
      </div> : null}
    </header>
    {mode === "inhouse" ? <InhousePlayerStatsList players={source.inhousePlayerStats ?? []} /> : hasDrafts ? <><ScoutPlayerPools data={data} scope={scope} unavailable={source.roster.length === 0} /><ScoutPatterns data={data} /><ScoutPastDrafts drafts={data.pastDrafts} /></> : <p className="card-brand p-5 text-sm text-steel">No recorded drafts for this opponent yet</p>}
  </section>;
}

function InhousePlayerStatsList({ players }: { players: InhousePlayerStats[] }) {
  if (players.length === 0) return <p className="card-brand p-5 text-sm text-steel">No current roster players are available for in-house scouting.</p>;
  return <section aria-labelledby="inhouse-player-stats-heading" className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div>
        <span className="label-dash text-cyan">In-house data</span>
        <h3 id="inhouse-player-stats-heading" className="type-display mt-1 text-2xl">Champion stats by player</h3>
      </div>
      <span className="text-xs text-steel">All available games</span>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {players.map((player) => (
        <article key={player.playerId} className="card-brand p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-white">{player.playerName}</h4>
              <p className="mt-1 text-xs uppercase tracking-wide text-steel">{player.role} · {player.games} games</p>
            </div>
          </div>
          {player.champions.length === 0 ? <p className="mt-4 text-sm text-steel">No in-house games found.</p> : <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="text-xs uppercase tracking-wide text-steel"><th className="px-2 py-1 text-left">Champion</th><th className="px-2 py-1 text-right">Games</th><th className="px-2 py-1 text-right">W-L</th><th className="px-2 py-1 text-right">Win rate</th><th className="px-2 py-1 text-right">KDA</th></tr></thead>
              <tbody>{player.champions.map((champion) => <tr key={champion.champion} className="border-t border-line/60"><td className="px-2 py-1.5 font-semibold text-white">{champion.champion}</td><td className="px-2 py-1.5 text-right font-mono text-steel">{champion.games}</td><td className="px-2 py-1.5 text-right font-mono text-steel">{champion.wins}-{champion.games - champion.wins}</td><td className="px-2 py-1.5 text-right font-mono text-cyan">{champion.winrate_pct.toFixed(1)}%</td><td className="px-2 py-1.5 text-right font-mono text-steel">{champion.avg_kda.toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>}
        </article>
      ))}
    </div>
  </section>;
}
