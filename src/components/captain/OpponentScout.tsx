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
  const data = useMemo(() => deriveScoutData(source, scope), [source, scope]);
  const poolsByScope = useMemo(() => ({ season: deriveScoutData(source, "season"), recent: deriveScoutData(source, "recent"), all: deriveScoutData(source, "all") }), [source]);
  const blueShare = data.gamesSampled ? Math.round((data.blueGames / data.gamesSampled) * 100) : 0;
  return <section aria-labelledby="draft-intel-heading" className="mt-8 space-y-4"><header className="card-brand p-5"><span className="label-dash text-gold">Premium · Opponent scouting</span><h2 id="draft-intel-heading" className="type-display mt-2 text-3xl">Draft intel</h2><p className="mt-2 max-w-2xl text-sm text-steel">A clear record of draft patterns and history. This section presents scouting context only.</p><label className="mt-4 flex items-center gap-3 text-sm text-steel">Draft history<select aria-label="Draft history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className="input-brand px-3 py-2"><option value="season">Current season</option><option value="recent">Recent drafts</option><option value="all">All drafts</option></select></label><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><span className="label-dash">Next fixture</span><p className="mt-1 text-sm font-semibold text-white">{formatKickoff(source.nextFixture.scheduled_at)}</p><p className="text-xs text-steel">Bo{source.nextFixture.best_of} · vs {source.nextFixture.team_a === source.opponentName ? source.nextFixture.team_b : source.nextFixture.team_a}</p></div><div><span className="label-dash">Sample</span><p className="type-display mt-1 text-2xl">{data.gamesSampled} drafts sampled</p></div><div><span className="label-dash">Blue-side share</span><p className="type-display mt-1 text-2xl">{blueShare}%</p><p className="text-xs text-steel">{data.blueGames} of {data.gamesSampled} games</p></div><div><span className="label-dash">Champion pool</span><p className="type-display mt-1 text-2xl">{data.distinctChampions}</p></div></div></header><ScoutPatterns data={data} /><ScoutPlayerPools data={data} poolsByScope={poolsByScope} unavailable={source.roster.length === 0} /><ScoutPastDrafts drafts={data.pastDrafts} /></section>;
}
