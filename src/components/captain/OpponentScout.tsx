"use client";

import { useMemo, useState } from "react";
import { formatKickoff } from "@/lib/schedule/format";
import { deriveScoutData, scoutKey } from "@/lib/scouting/derive";
import { teamRecord } from "@/lib/teams/teamPage";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";
import ScoutPatterns from "./scouting/ScoutPatterns";
import ScoutPastDrafts from "./scouting/ScoutPastDrafts";
import ScoutPlayerPools from "./scouting/ScoutPlayerPools";

export default function OpponentScout({
  source,
  perspective = "opponent",
}: {
  source: ScoutSource;
  perspective?: "opponent" | "team";
}) {
  const [scope, setScope] = useState<ScoutScope>("season");
  const [mode, setMode] = useState<"regular" | "inhouse">("regular");
  const data = useMemo(
    () => deriveScoutData(source, scope, { playerLimit: null }),
    [source, scope],
  );
  const blueShare = data.gamesSampled ? Math.round((data.blueGames / data.gamesSampled) * 100) : 0;
  const hasDrafts = data.pastDrafts.length > 0;
  const subjectLabel = perspective === "team" ? "Team" : "Opponent";
  const emptyDraftCopy = perspective === "team"
    ? "No recorded drafts for this team yet"
    : "No recorded drafts for this opponent yet";
  const subjectName = source.teamName ?? source.opponentName;
  const currentSeasonRecord = teamRecord(
    source.fixtures.filter((fixture) => fixture.season === source.currentSeason),
    subjectName,
  );
  const fixtureOpponentName = perspective === "team"
    ? scoutKey(source.nextFixture.team_a) === scoutKey(subjectName)
      ? source.nextFixture.team_b ?? source.opponentName
      : scoutKey(source.nextFixture.team_b) === scoutKey(subjectName)
        ? source.nextFixture.team_a ?? source.opponentName
        : source.opponentName
    : source.opponentName;
  const hasPlayerPoolStats = data.playerPools.some((player) => player.gamesSampled > 0);
  const showPoolsWithoutHistory = !hasDrafts && (perspective === "team" || hasPlayerPoolStats);

  return <section aria-labelledby="scouting-heading" className="mt-8 space-y-4">
    <header className="card-brand p-5">
      <span className="label-dash text-gold">Premium · Scouting</span>
      <h2 id="scouting-heading" className="type-display mt-2 text-3xl">Scouting</h2>
      <p className="mt-2 max-w-2xl text-sm text-steel">{mode === "inhouse" ? "Champion performance from all available in-house games." : "A clear record of draft patterns and history. This section presents scouting context only."}</p>
      <p className="mt-3 text-sm text-steel"><span className="label-dash">{subjectLabel}</span> <span className="font-semibold text-white">{source.opponentName}</span></p>
      {mode === "regular" ? <label className="mt-4 flex items-center gap-3 text-sm text-steel">Draft history<select aria-label="Draft history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className="input-brand px-3 py-2"><option value="season">Current season</option><option value="recent">Recent 5 series</option><option value="all">All history</option></select></label> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div><span className="label-dash">Record</span><p className="type-display mt-1 text-2xl">{currentSeasonRecord.wins}-{currentSeasonRecord.losses}</p><p className="text-xs text-steel">{currentSeasonRecord.seriesPlayed} series · current season</p></div>
        {mode === "regular" && hasDrafts ? <>
          <div><span className="label-dash">Next fixture</span><p className="mt-1 text-sm font-semibold text-white">{formatKickoff(source.nextFixture.scheduled_at)}</p><p className="text-xs text-steel">Bo{source.nextFixture.best_of} · vs {fixtureOpponentName}</p></div>
          <div><span className="label-dash">Drafts sampled</span><p className="type-display mt-1 text-2xl">{data.gamesSampled}</p></div>
          <div><span className="label-dash">Blue-side share</span><p className="type-display mt-1 text-2xl">{blueShare}%</p><p className="text-xs text-steel">{data.blueGames} of {data.gamesSampled} games</p></div>
          <div><span className="label-dash">Champion pool</span><p className="type-display mt-1 text-2xl">{data.distinctChampions}</p></div>
          <div><span className="label-dash">Subject</span><p className="type-display mt-1 text-2xl">{source.opponentName}</p></div>
        </> : null}
      </div>
    </header>
    {showPoolsWithoutHistory ? <p className="card-brand p-5 text-sm text-steel">{emptyDraftCopy}</p> : null}
    {mode === "inhouse" || hasDrafts || showPoolsWithoutHistory ? <><ScoutPlayerPools data={data} scope={scope} unavailable={source.roster.length === 0} mode={mode} onModeChange={() => setMode((current) => current === "regular" ? "inhouse" : "regular")} inhousePlayers={source.inhousePlayerStats ?? []} />{mode === "regular" && hasDrafts ? <><ScoutPatterns data={data} /><ScoutPastDrafts drafts={data.pastDrafts} /></> : null}</> : <p className="card-brand p-5 text-sm text-steel">{emptyDraftCopy}</p>}
  </section>;
}
