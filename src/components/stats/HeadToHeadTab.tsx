"use client";

// The head-to-head matrix, ported from the original stats site's heatmap.
//
// Every other tab answers "how well did this player play". This one answers
// "who did they play well AGAINST", which no aggregate can: two players with
// identical averages can have a lopsided record against each other, and only
// a pairwise table shows it.
//
// A full league matrix is wide, so the table scrolls inside its own
// container rather than the page — and the row headers stay pinned, because
// a matrix you cannot read the axis of is a grid of unlabelled numbers.

import { useCallback, useMemo, useState } from "react";
import { buildHeadToHead, overallRecord, recordBetween } from "@/lib/stats/headToHead";
import { fetchHeadToHeadRows } from "@/lib/stats/queries";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, LoadingCard } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

/** Win rate to cell colour. Deliberately not a smooth gradient: the eye
 *  reads five bands far faster than a continuum, and the point of the grid
 *  is to spot the lopsided pairs at a glance. */
function cellStyle(winRate: number): { background: string; color: string } {
  if (winRate >= 80) return { background: "rgb(52 211 153 / 0.85)", color: "#04140d" };
  if (winRate >= 60) return { background: "rgb(52 211 153 / 0.45)", color: "#eafff5" };
  if (winRate > 40) return { background: "rgb(167 192 216 / 0.18)", color: "#e6eef7" };
  if (winRate > 20) return { background: "rgb(248 113 113 / 0.42)", color: "#fff0f0" };
  return { background: "rgb(248 113 113 / 0.85)", color: "#1a0505" };
}

export default function HeadToHeadTab({
  season,
  phase,
  teamNames,
}: {
  season: string;
  phase: PhaseFilter;
  teamNames?: string[];
}) {
  const [team, setTeam] = useState("");
  const [player, setPlayer] = useState("");
  const [minGames, setMinGames] = useState(1);

  const loadRows = useCallback(() => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    return fetchHeadToHeadRows(seasonParam, phaseParam, teamNames);
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);

  const h2h = useMemo(() => buildHeadToHead(data ?? []), [data]);

  const teams = useMemo(
    () => [...new Set([...h2h.teamOf.values()])].sort((a, b) => a.localeCompare(b)),
    [h2h],
  );

  // Rows are the players in view; columns stay the full roster so a
  // filtered row still shows who it was measured against.
  const rows = useMemo(() => {
    if (player) return [player];
    if (team) return h2h.players.filter((name) => h2h.teamOf.get(name) === team);
    return h2h.players;
  }, [h2h, player, team]);

  const columns = useMemo(() => {
    if (!player) return rows;
    // One player's view: only the opponents they have actually faced
    // enough times, so the row is a shortlist rather than mostly blanks.
    return h2h.players.filter((name) => {
      if (name === player) return false;
      const cell = recordBetween(h2h, player, name);
      return cell !== null && cell.wins + cell.losses >= minGames;
    });
  }, [h2h, player, rows, minGames]);

  if (status === "loading") return <LoadingCard label="head-to-head" />;
  if (status === "error") return <ErrorCard noun="head-to-head" />;
  if (h2h.players.length === 0) return <EmptyCard message="No matchups recorded yet." />;

  const selectClass = "input-brand px-3 py-2 text-sm";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-steel">
          Team
          <select
            value={team}
            onChange={(event) => {
              setTeam(event.target.value);
              // A player from the old team would filter the grid to
              // nothing; clearing is less surprising than an empty table.
              setPlayer("");
            }}
            className={selectClass}
          >
            <option value="">All teams</option>
            {teams.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-steel">
          Player
          <select value={player} onChange={(event) => setPlayer(event.target.value)} className={selectClass}>
            <option value="">All players</option>
            {(team ? h2h.players.filter((name) => h2h.teamOf.get(name) === team) : h2h.players).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        {player ? (
          <label className="flex flex-col gap-1 text-xs text-steel">
            Min games
            <input
              type="number"
              min={1}
              value={minGames}
              onChange={(event) => setMinGames(Math.max(1, Number(event.target.value) || 1))}
              className={`${selectClass} w-24`}
            />
          </label>
        ) : null}

        <p className="ml-auto text-xs text-steel">
          Each cell is the <span className="text-white">row</span> player&apos;s record against the{" "}
          <span className="text-white">column</span> player.
        </p>
      </div>

      {columns.length === 0 ? (
        <EmptyCard message="No opponents met that often — lower the minimum." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left font-semibold text-steel">Player</th>
                {columns.map((name) => (
                  <th
                    key={name}
                    scope="col"
                    className="min-w-[3.5rem] max-w-[3.5rem] truncate px-1 py-2 text-center font-semibold text-steel"
                    title={name}
                  >
                    {name.slice(0, 6)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-steel">Overall</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rowName) => {
                const total = overallRecord(h2h, rowName);
                return (
                  <tr key={rowName}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[10rem] truncate bg-panel px-3 py-1.5 text-left font-semibold text-white"
                      title={rowName}
                    >
                      {rowName}
                    </th>
                    {columns.map((colName) => {
                      if (colName === rowName) {
                        return (
                          <td key={colName} className="bg-navy/60 text-center text-steel">
                            —
                          </td>
                        );
                      }
                      const cell = recordBetween(h2h, rowName, colName);
                      const played = cell ? cell.wins + cell.losses : 0;
                      if (!cell || played === 0) {
                        return (
                          <td key={colName} className="text-center text-steel/40" title="Never met">
                            ·
                          </td>
                        );
                      }
                      const rate = (cell.wins / played) * 100;
                      return (
                        <td
                          key={colName}
                          className="border border-navy px-1 py-1.5 text-center font-mono font-bold tabular-nums"
                          style={cellStyle(rate)}
                          title={`${rowName} ${cell.wins}-${cell.losses} vs ${colName}`}
                        >
                          {cell.wins}-{cell.losses}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-steel">
                      {total.wins}-{total.losses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
