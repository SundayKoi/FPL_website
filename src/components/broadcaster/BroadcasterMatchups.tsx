"use client";

import { Fragment, useMemo, useState } from "react";
import ChampionDatum from "@/components/captain/scouting/ChampionDatum";
import { deriveBroadcasterMatchups, type BroadcasterMatchupPlayer } from "@/lib/broadcaster/matchups";
import { ROLE_LABELS } from "@/lib/draft/types";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";

function PlayerCard({ player }: { player: BroadcasterMatchupPlayer }) {
  return <article className="rounded border border-line/70 bg-navy/40 p-3">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="font-semibold text-white">{player.name}</h3>
      <span className="text-xs uppercase tracking-wider text-steel">{ROLE_LABELS[player.role]}</span>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {player.champions.slice(0, 5).map((champion) => <Fragment key={champion.champion}>
        <ChampionDatum champion={champion.champion} />
        <span className="self-center text-xs text-steel">×{champion.count}</span>
      </Fragment>)}
    </div>
    <p className="mt-3 text-xs text-steel">
      {player.totalPicks} picks · {player.distinctChampions} {player.distinctChampions === 1 ? "champion" : "champions"} · {player.gamesSampled} games
    </p>
    {player.inhouse ? <div className="mt-4 border-t border-line/50 pt-3">
      <p className="label-dash">{player.inhouse.games} in-house games</p>
      {player.inhouse.champions.length === 0 ? <p className="mt-2 text-sm text-steel">No in-house games found</p> : <div className="mt-2 space-y-2">
        {player.inhouse.champions.slice(0, 5).map((champion) => <div key={champion.champion} className="flex flex-wrap items-center gap-2">
          <ChampionDatum champion={champion.champion} />
          <span className="text-xs text-steel">×{champion.games} · {champion.winrate_pct.toFixed(0)}% WR · {champion.avg_kda.toFixed(2)} KDA</span>
        </div>)}
      </div>}
    </div> : null}
  </article>;
}

function TeamColumn({ teamName, roleLabel, players }: { teamName: string; roleLabel: string; players: BroadcasterMatchupPlayer[] }) {
  return <div aria-label={`${teamName} ${roleLabel} players`} className="space-y-3">
    <p className="label-dash">{teamName}</p>
    {players.length ? players.map((player) => <PlayerCard key={player.id} player={player} />) : <p className="rounded border border-dashed border-line/70 p-3 text-sm text-steel">No rostered player</p>}
  </div>;
}

export default function BroadcasterMatchups({ teamA, teamB }: { teamA: ScoutSource; teamB: ScoutSource }) {
  const [scope, setScope] = useState<ScoutScope>("season");
  const matchups = useMemo(
    () => deriveBroadcasterMatchups(teamA, teamB, scope),
    [teamA, teamB, scope],
  );
  const teamAName = teamA.teamName ?? teamA.opponentName;
  const teamBName = teamB.teamName ?? teamB.opponentName;

  return <section aria-label="Role matchup comparison" className="space-y-4">
    <header className="card-brand flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="label-dash text-gold">Broadcaster workspace</p>
        <p className="mt-1 text-sm text-steel">Role-by-role champion pools and in-house results.</p>
      </div>
      <label className="flex items-center gap-3 text-sm text-steel">Matchup history
        <select aria-label="Matchup history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className="input-brand px-3 py-2">
          <option value="season">Current season</option>
          <option value="recent">Recent 5 series</option>
          <option value="all">All history</option>
        </select>
      </label>
    </header>
    {matchups.map((matchup) => <section key={matchup.role} aria-labelledby={`matchup-${matchup.role}`} className="card-brand p-5">
      <h2 id={`matchup-${matchup.role}`} className="type-display text-2xl">{matchup.label}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TeamColumn teamName={teamAName} roleLabel={matchup.label} players={matchup.teamAPlayers} />
        <TeamColumn teamName={teamBName} roleLabel={matchup.label} players={matchup.teamBPlayers} />
      </div>
    </section>)}
  </section>;
}
