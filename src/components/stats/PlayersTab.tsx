"use client";

import { useCallback, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchPlayerKeysForTeams } from "@/lib/stats/queries";
import { filterStatsRowsByPlayerKeys, playerKey } from "@/lib/stats/scope";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, FilterPill, LoadingCard, RoleChip, StatBar, roleColor } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export type SelectedPlayer = { summonerName: string; tag: string };

/**
 * Players tab: searchable player list reusing the same `stats_player_agg`
 * data LeaderboardTab fetches (name search + role filter chips only — no
 * min-games/sort/compare, those stay Leaderboard-specific). Clicking a
 * player calls `onSelectPlayer`, same callback LeaderboardTab rows use, so
 * both entry points open the identical `PlayerDetail`.
 */
export default function PlayersTab({
  season,
  phase,
  onSelectPlayer,
  initialQuery = "",
  teamNames,
}: {
  season: string;
  phase: PhaseFilter;
  onSelectPlayer: (player: SelectedPlayer) => void;
  initialQuery?: string;
  teamNames?: string[];
}) {
  const loadRows = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    const [data, keys] = await Promise.all([
      fetchPlayerAgg(seasonParam, phaseParam),
      teamNames ? fetchPlayerKeysForTeams(teamNames) : null,
    ]);
    return keys ? filterStatsRowsByPlayerKeys(data, keys) : data;
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);
  // Deep-link prefill: search on the name half only — "Name#TAG" as a
  // whole won't substring-match when the roster tag is stale.
  const [query, setQuery] = useState(initialQuery.split("#")[0] ?? "");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" — same as LeaderboardTab.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS && phase !== "All") return rows;
    const seasonLabel = season === ALL_SEASONS ? ALL_SEASONS : season;
    return mergeRows(rows, playerKey, (group) => combineSeasonRows(group, seasonLabel));
  }, [rows, season, phase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged
      .filter((r) => !roleFilter || r.role_mode === roleFilter)
      .filter((r) => !q || playerKey(r).toLowerCase().includes(q))
      .sort((a, b) => playerKey(a).toLowerCase().localeCompare(playerKey(b).toLowerCase()));
  }, [merged, roleFilter, query]);

  if (status === "loading") {
    return <LoadingCard label="players" />;
  }

  if (status === "error") {
    return <ErrorCard noun="player" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no player data for this season/phase yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-brand flex flex-col gap-3 p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players"
          placeholder="Search players…"
          className="input-brand px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-dash">Role</span>
          <FilterPill active={roleFilter === null} onClick={() => setRoleFilter(null)}>
            All
          </FilterPill>
          {ROLES.map((r) => (
            <FilterPill
              key={r}
              active={roleFilter === r}
              onClick={() => setRoleFilter((cur) => (cur === r ? null : r))}
              uppercase
            >
              {r}
            </FilterPill>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyCard title="No players found" message="No players match these filters." />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <button
              key={playerKey(row)}
              type="button"
              onClick={() => onSelectPlayer({ summonerName: row.summoner_name, tag: row.tag })}
              className="card-neon group flex flex-col gap-2 p-3 text-left transition hover:border-action-text/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white group-hover:text-action-text">
                  {row.summoner_name}
                  <span className="text-muted">#{row.tag}</span>
                </span>
                <RoleChip role={row.role_mode} />
              </div>
              <div className="flex items-center gap-2">
                <StatBar value={row.winrate_pct} max={100} color={roleColor(row.role_mode)} />
                <span className="shrink-0 font-mono text-xs text-muted">
                  {row.winrate_pct.toFixed(0)}%
                </span>
              </div>
              <span className="font-mono text-[11px] text-muted">
                {row.games}G · {row.kda.toFixed(2)} KDA
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
