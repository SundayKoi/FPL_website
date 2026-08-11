"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchSeasons } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import ChampionsTab from "./ChampionsTab";
import LeaderboardTab from "./LeaderboardTab";
import PlayerDetail from "./PlayerDetail";
import PowerRankingsTab from "./PowerRankingsTab";
import RecordsTab from "./RecordsTab";
import SeasonSelect, { ALL_SEASONS, type PhaseFilter } from "./SeasonSelect";
import { RoleChip, StatBar, roleColor } from "./statsUi";
import TeamsTab from "./TeamsTab";
import TimelineTab from "./TimelineTab";

// No separate MVP tab: mvpScores and powerRanking are near-identical
// weighted percentile ladders (see formulas.ts) and produced the same names
// in a slightly different order. Power Rankings absorbed the concept — its
// #1 player carries the MVP crown in the hero card.
const TABS = [
  "Leaderboard",
  "Teams",
  "Champions",
  "Records",
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
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((row) => (
            <button
              key={playerKey(row)}
              type="button"
              onClick={() => onSelectPlayer({ summonerName: row.summoner_name, tag: row.tag })}
              className="card-neon group flex flex-col gap-2 p-3 text-left transition hover:border-cyan/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-white group-hover:text-cyan">
                  {row.summoner_name}
                  <span className="text-steel">#{row.tag}</span>
                </span>
                <RoleChip role={row.role_mode} />
              </div>
              <div className="flex items-center gap-2">
                <StatBar value={row.winrate_pct} max={100} color={roleColor(row.role_mode)} />
                <span className="shrink-0 font-mono text-xs text-steel">
                  {row.winrate_pct.toFixed(0)}%
                </span>
              </div>
              <span className="font-mono text-[11px] text-steel">
                {row.games}G · {row.kda.toFixed(2)} KDA
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
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line/70">
        <nav aria-label="Stats sections" className="flex flex-wrap gap-x-5 gap-y-1">
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedPlayer(null);
                }}
                className={`relative -mb-px border-b-2 px-1 pb-2.5 pt-1 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  active
                    ? "border-cyan text-cyan [text-shadow:0_0_10px_rgb(53_230_255/0.5)]"
                    : "border-transparent text-steel hover:text-white"
                }`}
              >
                {tab}
              </button>
            );
          })}
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
