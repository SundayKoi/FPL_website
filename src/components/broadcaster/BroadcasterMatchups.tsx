"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import ChampionDatum from "@/components/captain/scouting/ChampionDatum";
import { deriveBroadcasterMatchups, type BroadcasterMatchupPlayer } from "@/lib/broadcaster/matchups";
import type { BroadcasterPlayerDetails } from "@/lib/broadcaster/types";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { ROLE_LABELS } from "@/lib/draft/types";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";

function PremiumCardThumbnail({ player }: { player: BroadcasterMatchupPlayer }) {
  if (!player.card) return null;
  return <Link
    href={`/card/${player.card.slug}`}
    aria-label={`View ${player.name}'s premium card`}
    className="block shrink-0 rounded-md text-center transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
  >
    <div className="h-[9.8rem] w-[7rem] overflow-hidden rounded-md border border-line/70 bg-black/20">
      <div style={{ transform: "scale(0.35)", transformOrigin: "top left" }}>
        <PlayerCard3D card={player.card} interactive={false} />
      </div>
    </div>
    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-steel">Premium card</span>
  </Link>;
}

function AverageStats({ player }: { player: BroadcasterMatchupPlayer }) {
  if (!player.averages) return null;
  const stats = [
    { label: "KDA", value: player.averages.kda.toFixed(2) },
    { label: "DMG/min", value: Math.round(player.averages.damagePerMin).toLocaleString() },
    ...(player.role === "jungle" || player.role === "support"
      ? [{ label: "Vision/min", value: player.averages.visionPerMin.toFixed(2) }]
      : []),
    ...(player.role === "top"
      ? [{ label: "Turrets/game", value: player.averages.turretsPerGame.toFixed(2) }]
      : []),
    ...(player.role !== "support"
      ? [
          { label: "Gold/min", value: Math.round(player.averages.goldPerMin).toLocaleString() },
          { label: "Multi-kills", value: Math.round(player.averages.multiKills).toLocaleString() },
        ]
      : []),
  ];

  return <div aria-label={`${player.name} average stats`} className="min-w-[12rem] flex-1">
    <p className="label-dash">Season averages · {player.averages.games} games</p>
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
      {stats.map((stat) => <div key={stat.label}>
        <dt className="text-[10px] uppercase tracking-wider text-steel">{stat.label}</dt>
        <dd className="text-sm font-semibold text-white">{stat.value}</dd>
      </div>)}
    </dl>
  </div>;
}

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
    {player.card || player.averages ? <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-line/50 pt-4">
      <PremiumCardThumbnail player={player} />
      <AverageStats player={player} />
    </div> : null}
    {player.inhouse ? <details className="group mt-4 border-t border-line/50 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span className="label-dash">In-house stats</span>
          <span className="text-xs text-steel">{player.inhouse.games} in-house games</span>
        </span>
        <span aria-hidden className="text-base leading-none text-coral transition group-open:rotate-45">+</span>
      </summary>
      {player.inhouse.champions.length === 0 ? <p className="mt-3 text-sm text-steel">No in-house games found</p> : <div className="mt-3 space-y-2">
        {player.inhouse.champions.slice(0, 5).map((champion) => <div key={champion.champion} className="flex flex-wrap items-center gap-2">
          <ChampionDatum champion={champion.champion} />
          <span className="text-xs text-steel">×{champion.games} · {champion.winrate_pct.toFixed(0)}% WR · {champion.avg_kda.toFixed(2)} KDA</span>
        </div>)}
      </div>}
    </details> : null}
  </article>;
}

function TeamColumn({ teamName, roleLabel, players }: { teamName: string; roleLabel: string; players: BroadcasterMatchupPlayer[] }) {
  return <div aria-label={`${teamName} ${roleLabel} players`} className="space-y-3">
    <p className="label-dash">{teamName}</p>
    {players.length ? players.map((player) => <PlayerCard key={player.id} player={player} />) : <p className="rounded border border-dashed border-line/70 p-3 text-sm text-steel">No rostered player</p>}
  </div>;
}

export default function BroadcasterMatchups({
  teamA,
  teamB,
  playerDetails = [],
}: { teamA: ScoutSource; teamB: ScoutSource; playerDetails?: BroadcasterPlayerDetails[] }) {
  const [scope, setScope] = useState<ScoutScope>("season");
  const matchups = useMemo(
    () => deriveBroadcasterMatchups(teamA, teamB, scope, playerDetails),
    [teamA, teamB, scope, playerDetails],
  );
  const teamAName = teamA.teamName ?? teamA.opponentName;
  const teamBName = teamB.teamName ?? teamB.opponentName;

  return <section aria-label="Role matchup comparison" className="space-y-4">
    <header className="card-brand flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="label-dash text-gold">Broadcaster workspace</p>
        <p className="mt-1 text-sm text-steel">Premium player cards, average stats, champion pools, and in-house results.</p>
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
