"use client";

import { useMemo, useState } from "react";
import { formatKickoff } from "@/lib/schedule/format";
import { deriveScoutData } from "@/lib/scouting/derive";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";
import ScoutPatterns from "./scouting/ScoutPatterns";
import ScoutPastDrafts from "./scouting/ScoutPastDrafts";
import ScoutPlayerPools from "./scouting/ScoutPlayerPools";

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
      {mode === "regular" ? <label className="mt-4 flex items-center gap-3 text-sm text-steel">Draft history<select aria-label="Draft history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className="input-brand px-3 py-2"><option value="season">Current season</option><option value="recent">Recent 5 series</option><option value="all">All history</option></select></label> : null}
      {mode === "regular" && hasDrafts ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div><span className="label-dash">Next fixture</span><p className="mt-1 text-sm font-semibold text-white">{formatKickoff(source.nextFixture.scheduled_at)}</p><p className="text-xs text-steel">Bo{source.nextFixture.best_of} · vs {source.opponentName}</p></div>
        <div><span className="label-dash">Drafts sampled</span><p className="type-display mt-1 text-2xl">{data.gamesSampled}</p></div>
        <div><span className="label-dash">Blue-side share</span><p className="type-display mt-1 text-2xl">{blueShare}%</p><p className="text-xs text-steel">{data.blueGames} of {data.gamesSampled} games</p></div>
        <div><span className="label-dash">Champion pool</span><p className="type-display mt-1 text-2xl">{data.distinctChampions}</p></div>
        <div><span className="label-dash">Subject</span><p className="type-display mt-1 text-2xl">{source.opponentName}</p></div>
      </div> : null}
    </header>
    {mode === "inhouse" || hasDrafts ? <><ScoutPlayerPools data={data} scope={scope} unavailable={source.roster.length === 0} mode={mode} onModeChange={() => setMode((current) => current === "regular" ? "inhouse" : "regular")} inhousePlayers={source.inhousePlayerStats ?? []} />{mode === "regular" ? <><ScoutPatterns data={data} /><ScoutPastDrafts drafts={data.pastDrafts} /></> : null}</> : <p className="card-brand p-5 text-sm text-steel">No recorded drafts for this opponent yet</p>}
  </section>;
}
