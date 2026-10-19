"use client";

// Every player's numbers in one sortable table, with a role filter. The rows
// arrive built (lib/offseason/stats.ts); sorting and filtering are only
// presentation.

import Link from "next/link";
import { useState } from "react";
import { ROLE_LABELS, ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import type { PlayerStats } from "@/lib/offseason/stats";
import { RoleTag, tableClass, tdClass, thClass } from "./ui";

type SortKey =
  | "overall"
  | "record"
  | "games"
  | "kills"
  | "deaths"
  | "assists"
  | "kda"
  | "killParticipation"
  | "csPerMin"
  | "damagePerMin"
  | "visionPerMin";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "games", label: "GP", title: "Games played" },
  { key: "record", label: "W–L", title: "Record" },
  { key: "overall", label: "OVR", title: "Overall" },
  { key: "kills", label: "K", title: "Kills per game" },
  { key: "deaths", label: "D", title: "Deaths per game" },
  { key: "assists", label: "A", title: "Assists per game" },
  { key: "kda", label: "KDA", title: "Kills and assists per death" },
  { key: "killParticipation", label: "KP%", title: "Kill participation" },
  { key: "csPerMin", label: "CS/m", title: "CS per minute" },
  { key: "damagePerMin", label: "DMG/m", title: "Damage to champions per minute" },
  { key: "visionPerMin", label: "VIS/m", title: "Vision score per minute" },
];

/** The value a column sorts by; null sorts last either way. */
function value(player: PlayerStats, key: SortKey): number | null {
  switch (key) {
    case "overall":
      return player.overall;
    case "record":
      // More wins first, then fewer losses: the order used everywhere else.
      return player.wins * 1000 - player.losses;
    case "games":
      return player.line.games;
    default:
      return player.line[key];
  }
}

const one = (number: number | null) => (number === null ? "—" : number.toFixed(1));

export default function StatsTable({ players, showTeam }: { players: PlayerStats[]; showTeam: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "overall", descending: true });
  const [role, setRole] = useState<LolRole | "all">("all");

  const shown = players
    .filter((player) => role === "all" || player.role === role)
    .sort((a, b) => {
      const va = value(a, sort.key);
      const vb = value(b, sort.key);
      if (va !== vb) {
        if (va === null) return 1;
        if (vb === null) return -1;
        return sort.descending ? vb - va : va - vb;
      }
      return b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name);
    });

  // Deaths read best low; everything else high.
  const pick = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: key !== "deaths" }));

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Role" className="flex flex-wrap gap-2">
        {(["all", ...ROLE_ORDER] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={role === option}
            onClick={() => setRole(option)}
            className={
              role === option
                ? "rounded-full border border-action-text bg-action-fill/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                : "rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-white"
            }
          >
            {option === "all" ? "All roles" : ROLE_LABELS[option]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className={`${tableClass} min-w-[56rem]`}>
          <thead>
            <tr>
              <th className={thClass}>#</th>
              <th className={thClass}>Player</th>
              {showTeam ? <th className={thClass}>Team</th> : null}
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={`${thClass} text-right`}
                  aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : "none"}
                >
                  <button
                    type="button"
                    title={column.title}
                    onClick={() => pick(column.key)}
                    className={`uppercase tracking-wide hover:text-white ${sort.key === column.key ? "text-white" : ""}`}
                  >
                    {column.label}
                    {sort.key === column.key ? (sort.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
              <th className={thClass}>Champions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((player, index) => (
              <tr key={player.entrantId}>
                <td className={`${tdClass} tabular-nums text-muted`}>{index + 1}</td>
                <td className={tdClass}>
                  <span className="flex items-center gap-2">
                    <RoleTag role={player.role} />
                    <Link href={`/offseason/players/${player.entrantId}`} className="truncate text-content hover:text-action-text">
                      {player.name}
                    </Link>
                  </span>
                </td>
                {showTeam ? <td className={`${tdClass} text-muted`}>{player.team ?? "—"}</td> : null}
                <td className={`${tdClass} text-right tabular-nums`}>{player.line.games}</td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {player.wins}–{player.losses}
                </td>
                <td className={`${tdClass} text-right font-display font-bold tabular-nums text-white`}>{player.overall ?? "—"}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{one(player.line.kills)}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{one(player.line.deaths)}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{one(player.line.assists)}</td>
                <td className={`${tdClass} text-right tabular-nums`}>{player.line.kda.toFixed(2)}</td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {player.line.killParticipation === null ? "—" : `${Math.round(player.line.killParticipation)}%`}
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{one(player.line.csPerMin)}</td>
                <td className={`${tdClass} text-right tabular-nums`}>
                  {player.line.damagePerMin === null ? "—" : Math.round(player.line.damagePerMin).toLocaleString("en-US")}
                </td>
                <td className={`${tdClass} text-right tabular-nums`}>{player.line.visionPerMin === null ? "—" : player.line.visionPerMin.toFixed(2)}</td>
                <td className={`${tdClass} text-muted`}>{player.line.champions.slice(0, 3).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">No {role === "all" ? "" : `${ROLE_LABELS[role as LolRole]} `}players with games yet.</p> : null}
    </div>
  );
}
