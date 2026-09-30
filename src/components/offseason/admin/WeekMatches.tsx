"use client";

import { useState } from "react";
import { ROLE_LABELS_SHORT, ROLE_ORDER } from "@/lib/draft/types";
import { createMatchesAction, deleteMatchAction, setGameAction, setTeamEliminatedAction } from "@/lib/offseason/actions";
import { eliminationPairings, roundRobinPairings } from "@/lib/offseason/schedule";
import { suggestedEliminations } from "@/lib/offseason/standings";
import { STAGE_LABELS, type MatchStage, type OffseasonGame, type OffseasonMatch, type OffseasonTeam, type OffseasonWeek } from "@/lib/offseason/types";
import {
  ActionMessage,
  buttonClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  smallInputClass,
  useOffseasonAction,
  type OffseasonAdminData,
} from "./shared";

type BestOf = 1 | 3 | 5;

function BestOfSelect({ value, onChange }: { value: BestOf; onChange: (value: BestOf) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) as BestOf)} className={inputClass}>
      <option value={1}>Bo1</option>
      <option value={3}>Bo3</option>
      <option value={5}>Bo5</option>
    </select>
  );
}

function GameRow({ match, game, number, teams }: { match: OffseasonMatch; game: OffseasonGame | undefined; number: number; teams: Map<string, OffseasonTeam> }) {
  const [riotId, setRiotId] = useState(game?.riot_match_id ?? "");
  const [winner, setWinner] = useState(game?.winner_team_id ?? "");
  const { pending, message, run } = useOffseasonAction();
  const dirty = riotId.trim() !== (game?.riot_match_id ?? "") || winner !== (game?.winner_team_id ?? "");
  const status = !game?.riot_match_id
    ? null
    : game.ingest_error
      ? <span className="text-danger">Ingest failed: {game.ingest_error}</span>
      : game.ingested_at
        ? <span className="text-success">Stats in</span>
        : <span className="text-muted">Waiting for ingest</span>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="w-12 font-semibold text-muted">Game {number}</span>
      <input value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="NA1_1234567890" className={`${smallInputClass} w-40 font-mono`} />
      <select value={winner} onChange={(e) => setWinner(e.target.value)} className={smallInputClass}>
        <option value="">Winner (or from stats)</option>
        {[match.team_a_id, match.team_b_id].map((id) => (
          <option key={id} value={id}>
            {teams.get(id)?.name ?? "?"}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !dirty}
        className={buttonClass}
        onClick={() => run(() => setGameAction(match.id, number, riotId.trim(), winner || null), "Saved.")}
      >
        {riotId.trim() || winner ? "Save" : "Clear"}
      </button>
      {status}
      <ActionMessage message={message} />
    </div>
  );
}

function MatchEditor({ data, match, teams }: { data: OffseasonAdminData; match: OffseasonMatch; teams: Map<string, OffseasonTeam> }) {
  const games = data.games.filter((game) => game.match_id === match.id);
  const { pending, message, run } = useOffseasonAction();
  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle/60 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={match.winner_team_id === match.team_a_id ? "font-semibold text-success" : "text-white"}>{teams.get(match.team_a_id)?.name}</span>
        <span className="text-xs text-muted">vs</span>
        <span className={match.winner_team_id === match.team_b_id ? "font-semibold text-success" : "text-white"}>{teams.get(match.team_b_id)?.name}</span>
        <span className="text-xs uppercase tracking-wide text-muted">
          {STAGE_LABELS[match.stage]} · Bo{match.best_of}
        </span>
        <button
          type="button"
          disabled={pending}
          className={`${dangerButtonClass} ml-auto`}
          onClick={() => {
            if (window.confirm("Delete this match and its games?")) run(() => deleteMatchAction(match.id));
          }}
        >
          Delete
        </button>
      </div>
      {Array.from({ length: match.best_of }, (_, index) => {
        const game = games.find((row) => row.game_number === index + 1);
        // Keyed by the saved values so a save (or an ingest) resets the row.
        return (
          <GameRow
            key={`${index}-${game?.riot_match_id ?? ""}-${game?.winner_team_id ?? ""}`}
            match={match}
            number={index + 1}
            game={game}
            teams={teams}
          />
        );
      })}
      <ActionMessage message={message} />
    </li>
  );
}

function ScheduleTools({ week, mainTeams, eliminationTeams, matches }: { week: OffseasonWeek; mainTeams: OffseasonTeam[]; eliminationTeams: OffseasonTeam[]; matches: OffseasonMatch[] }) {
  const [roundRobinBestOf, setRoundRobinBestOf] = useState<BestOf>(1);
  const [eliminationBestOf, setEliminationBestOf] = useState<BestOf>(1);
  const allTeams = [...mainTeams, ...eliminationTeams];
  const [custom, setCustom] = useState<{ a: string; b: string; stage: MatchStage; bestOf: BestOf }>({ a: "", b: "", stage: "final", bestOf: 5 });
  const { pending, message, run } = useOffseasonAction();
  const has = (stage: MatchStage) => matches.some((match) => match.stage === stage);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Round robin
          <BestOfSelect value={roundRobinBestOf} onChange={setRoundRobinBestOf} />
        </label>
        <button
          type="button"
          disabled={pending || mainTeams.length < 2 || has("round_robin")}
          className={buttonClass}
          onClick={() =>
            run(
              () => createMatchesAction(week.id, "round_robin", roundRobinBestOf, roundRobinPairings(mainTeams.map((team) => team.id))),
              "Round robin scheduled.",
            )
          }
        >
          Generate (max 3 per team)
        </button>
        {eliminationTeams.length >= 2 ? (
          <>
            <label className={`${labelClass} ml-4`}>
              Elimination
              <BestOfSelect value={eliminationBestOf} onChange={setEliminationBestOf} />
            </label>
            <button
              type="button"
              disabled={pending || has("elimination")}
              className={buttonClass}
              onClick={() =>
                run(
                  () => createMatchesAction(week.id, "elimination", eliminationBestOf, eliminationPairings(eliminationTeams.map((team) => team.id))),
                  "Elimination matches scheduled.",
                )
              }
            >
              Generate pairings
            </button>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>
          Team A
          <select value={custom.a} onChange={(e) => setCustom({ ...custom, a: e.target.value })} className={inputClass}>
            <option value="">—</option>
            {allTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Team B
          <select value={custom.b} onChange={(e) => setCustom({ ...custom, b: e.target.value })} className={inputClass}>
            <option value="">—</option>
            {allTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Stage
          <select value={custom.stage} onChange={(e) => setCustom({ ...custom, stage: e.target.value as MatchStage })} className={inputClass}>
            {(Object.keys(STAGE_LABELS) as MatchStage[]).map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Length
          <BestOfSelect value={custom.bestOf} onChange={(bestOf) => setCustom({ ...custom, bestOf })} />
        </label>
        <button
          type="button"
          disabled={pending || !custom.a || !custom.b || custom.a === custom.b}
          className={buttonClass}
          onClick={() => run(() => createMatchesAction(week.id, custom.stage, custom.bestOf, [{ teamA: custom.a, teamB: custom.b }]), "Match added.")}
        >
          Add match
        </button>
      </div>
      <ActionMessage message={message} />
    </div>
  );
}

function TeamList({ data, teams }: { data: OffseasonAdminData; teams: OffseasonTeam[] }) {
  const { pending, message, run } = useOffseasonAction();
  const names = new Map(data.entrants.map((entrant) => [entrant.id, entrant.display_name]));
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => {
          const members = data.members
            .filter((member) => member.team_id === team.id)
            .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
          return (
            <div key={team.id} className="rounded border border-border-subtle p-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-white">
                  {team.name}
                  {team.tier === "elimination" ? <span className="ml-1 text-prestige">· elim</span> : null}
                  {team.eliminated ? <span className="ml-1 text-danger">· out</span> : null}
                </span>
                {team.tier === "elimination" ? (
                  <button
                    type="button"
                    disabled={pending}
                    className={team.eliminated ? buttonClass : dangerButtonClass}
                    onClick={() => run(() => setTeamEliminatedAction(team.id, !team.eliminated), team.eliminated ? "Restored." : `${team.name} eliminated.`)}
                  >
                    {team.eliminated ? "Restore" : "Eliminate"}
                  </button>
                ) : null}
              </div>
              <ul>
                {members.map((member) => (
                  <li key={member.entrant_id} className="text-muted">
                    {ROLE_LABELS_SHORT[member.role]} · <span className="text-content">{names.get(member.entrant_id)}</span>
                    {team.captain_entrant_id === member.entrant_id ? " (C)" : member.price != null ? ` · ${member.price}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <ActionMessage message={message} />
    </div>
  );
}

/** A drafted week: teams, schedule, results and eliminations. */
export default function WeekMatches({ data, week }: { data: OffseasonAdminData; week: OffseasonWeek }) {
  const weekTeams = data.teams.filter((team) => team.week_id === week.id);
  const { pending, message, run } = useOffseasonAction();
  if (weekTeams.length === 0) return null;
  const teamsById = new Map(weekTeams.map((team) => [team.id, team]));
  const mainTeams = weekTeams.filter((team) => team.tier === "main");
  const eliminationTeams = weekTeams.filter((team) => team.tier === "elimination");
  const matches = data.matches.filter((match) => match.week_id === week.id);
  const toEliminate = suggestedEliminations(weekTeams, matches, data.games).filter((team) => !team.eliminated);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Teams</p>
        <TeamList data={data} teams={weekTeams} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Schedule</p>
        <ScheduleTools week={week} mainTeams={mainTeams} eliminationTeams={eliminationTeams} matches={matches} />
      </div>

      {matches.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Results</p>
          <p className="text-xs text-muted">
            Enter each game&apos;s Riot match id (and the winner if you know it), then run the &ldquo;Ingest offseason games&rdquo; workflow in
            GitHub Actions to pull the stats. A match is decided once one team wins a majority.
          </p>
          <ul>
            {matches.map((match) => (
              <MatchEditor key={match.id} data={data} match={match} teams={teamsById} />
            ))}
          </ul>
        </div>
      ) : null}

      {toEliminate.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded border border-danger/50 p-3 text-sm">
          <span>Lost in the elimination tier: {toEliminate.map((team) => team.name).join(", ")}.</span>
          <button
            type="button"
            disabled={pending}
            className={dangerButtonClass}
            onClick={() =>
              run(async () => {
                for (const team of toEliminate) {
                  const result = await setTeamEliminatedAction(team.id, true);
                  if (!result.ok) return result;
                }
                return { ok: true } as const;
              }, "Eliminated.")
            }
          >
            Eliminate {toEliminate.length === 1 ? "them" : "all"}
          </button>
          <ActionMessage message={message} />
        </div>
      ) : null}

      {mainTeams.length > 0 && matches.length === 0 ? (
        <p className="text-xs text-muted">Generate the round robin once the teams are in.</p>
      ) : null}
      {matches.length > 0 && matches.every((match) => match.winner_team_id) && week.status !== "complete" ? (
        <p className="text-xs text-success">Every match is decided. Complete the week when eliminations are done.</p>
      ) : null}
    </div>
  );
}
