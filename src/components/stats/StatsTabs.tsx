"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchSeasons } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import ChampionsTab from "./ChampionsTab";
import LeaderboardTab from "./LeaderboardTab";
import MvpTab from "./MvpTab";
import PlayerDetail from "./PlayerDetail";
import PowerRankingsTab from "./PowerRankingsTab";
import RecordsTab from "./RecordsTab";
import SeasonSelect, { ALL_SEASONS, type PhaseFilter } from "./SeasonSelect";
import TeamsTab from "./TeamsTab";
import TimelineTab from "./TimelineTab";

const TABS = [
  "Leaderboard",
  "Teams",
  "Champions",
  "Records",
  "MVP",
  "Power Rankings",
  "Timeline",
  "Players",
] as const;

type Tab = (typeof TABS)[number];

const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

type SelectedPlayer = { summonerName: string; tag: string };

function playerKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name}#${row.tag}`;
}

/**
 * Players tab: searchable player list reusing the same `stats_player_agg`
 * data LeaderboardTab fetches (name search + role filter chips only — no
 * min-games/sort/compare, those stay Leaderboard-specific). Clicking a
 * player calls `onSelectPlayer`, same callback LeaderboardTab rows use, so
 * both entry points open the identical `PlayerDetail`.
 */
function PlayersTab({
  season,
  phase,
  onSelectPlayer,
}: {
  season: string;
  phase: PhaseFilter;
  onSelectPlayer: (player: SelectedPlayer) => void;
}) {
  const [rows, setRows] = useState<PlayerAggRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Render-phase adjust (see LeaderboardTab): flip back to "loading"
  // synchronously during render on filter change instead of via a setState
  // call in the effect body (react-hooks/set-state-in-effect forbids that).
  const filterKey = `${season}::${phase}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setStatus("loading");
  }
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasonParam = season === ALL_SEASONS ? undefined : season;
        const phaseParam = phase === "All" ? undefined : phase;
        const data = await fetchPlayerAgg(seasonParam, phaseParam);
        if (cancelled) return;
        setRows(data);
        setStatus("loaded");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [season, phase]);

  // "All seasons" merges each player's per-season rows into one combined
  // row (games-weighted), same as LeaderboardTab.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS) return rows;
    const byPlayer = new Map<string, PlayerAggRow[]>();
    for (const row of rows) {
      const key = playerKey(row);
      const list = byPlayer.get(key);
      if (list) list.push(row);
      else byPlayer.set(key, [row]);
    }
    return Array.from(byPlayer.values()).map((group) => combineSeasonRows(group));
  }, [rows, season]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged
      .filter((r) => !roleFilter || r.role_mode === roleFilter)
      .filter((r) => !q || playerKey(r).toLowerCase().includes(q))
      .sort((a, b) => playerKey(a).toLowerCase().localeCompare(playerKey(b).toLowerCase()));
  }, [merged, roleFilter, query]);

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading players…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load player data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no player data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-brand flex flex-col gap-3 p-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-dash">Role</span>
          <button
            type="button"
            aria-pressed={roleFilter === null}
            onClick={() => setRoleFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              roleFilter === null ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            All
          </button>
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={roleFilter === r}
              onClick={() => setRoleFilter((cur) => (cur === r ? null : r))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                roleFilter === r ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card-brand p-8 text-center">
          <p className="type-display text-2xl">No players found</p>
          <p className="mt-2 text-steel">No players match these filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <button
              key={playerKey(row)}
              type="button"
              onClick={() => onSelectPlayer({ summonerName: row.summoner_name, tag: row.tag })}
              className="card-brand flex flex-col gap-1 p-3 text-left hover:border-gold"
            >
              <span className="truncate text-sm font-semibold text-white">
                {row.summoner_name}
                <span className="text-steel">#{row.tag}</span>
              </span>
              <span className="text-xs text-steel">
                {row.role_mode} · {row.games}g · {row.winrate_pct.toFixed(1)}% WR
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StatsTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("Leaderboard");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState<string>(ALL_SEASONS);
  const [phase, setPhase] = useState<PhaseFilter>("All");
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  // Selection state lives here, one level above both entry points
  // (LeaderboardTab row click and the Players tab list), so either one
  // opens the identical PlayerDetail via the same `onSelectPlayer`
  // callback — simplest consistent approach per the brief, rather than
  // duplicating detail-view state inside each tab.
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchSeasons();
        if (cancelled) return;
        setSeasons(data);
        if (data.length > 0) setSeason(data[0]);
        setSeasonsLoaded(true);
      } catch {
        if (cancelled) return;
        setSeasonsLoaded(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Stats sections" className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedPlayer(null);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                activeTab === tab
                  ? "bg-gold text-navy"
                  : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <SeasonSelect
          seasons={seasons}
          season={season}
          phase={phase}
          onSeasonChange={setSeason}
          onPhaseChange={setPhase}
        />
      </div>

      {!seasonsLoaded ? (
        <div className="card-brand p-8 text-center text-steel" role="status">
          Loading…
        </div>
      ) : selectedPlayer ? (
        <PlayerDetail
          summonerName={selectedPlayer.summonerName}
          tag={selectedPlayer.tag}
          season={season}
          phase={phase}
          onBack={() => setSelectedPlayer(null)}
        />
      ) : activeTab === "Leaderboard" ? (
        <LeaderboardTab season={season} phase={phase} onSelectPlayer={setSelectedPlayer} />
      ) : activeTab === "Teams" ? (
        <TeamsTab season={season} phase={phase} />
      ) : activeTab === "Champions" ? (
        <ChampionsTab season={season} phase={phase} />
      ) : activeTab === "Records" ? (
        <RecordsTab season={season} phase={phase} />
      ) : activeTab === "MVP" ? (
        <MvpTab season={season} phase={phase} />
      ) : activeTab === "Power Rankings" ? (
        <PowerRankingsTab season={season} phase={phase} />
      ) : activeTab === "Timeline" ? (
        <TimelineTab season={season} phase={phase} />
      ) : activeTab === "Players" ? (
        <PlayersTab season={season} phase={phase} onSelectPlayer={setSelectedPlayer} />
      ) : null}
    </div>
  );
}
