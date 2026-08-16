"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows, powerRanking } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchPlayerKeysForTeams } from "@/lib/stats/queries";
import { filterStatsRowsByPlayerKeys } from "@/lib/stats/scope";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { RoleChip, StatBar, tierFor } from "./statsUi";

// Legacy `renderPower()`'s own min-games <select> defaults to 5+
// (`id="prMinG"`, `<option value="5" selected>` — see formulas.ts doc
// comment on `powerRanking`). The formula itself applies no games gate,
// so this tab reproduces the page-level filter the legacy caller used,
// with the same 1/3/5/8/10 option set as Leaderboard for consistency.
const MIN_GAMES_OPTIONS = [1, 3, 5, 8, 10] as const;

function playerKey(row: PlayerAggRow): string {
  return `${row.summoner_name}#${row.tag}`;
}

export default function PowerRankingsTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
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
  const [minGames, setMinGames] = useState(5);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasonParam = season === ALL_SEASONS ? undefined : season;
        const phaseParam = phase === "All" ? undefined : phase;
        const data = await fetchPlayerAgg(seasonParam, phaseParam);
        const keys = teamNames ? await fetchPlayerKeysForTeams(teamNames) : null;
        if (cancelled) return;
        setRows(keys ? filterStatsRowsByPlayerKeys(data, keys) : data);
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
  }, [season, phase, teamNames]);

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" — same pattern as LeaderboardTab, applied BEFORE
  // feeding the formula.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS && phase !== "All") return rows;
    const seasonLabel = season === ALL_SEASONS ? "All" : season;
    return mergeRows(rows, playerKey, (group) => combineSeasonRows(group, seasonLabel));
  }, [rows, season, phase]);

  // powerRanking applies no games gate itself — apply the page-level
  // min-games filter before ranking, matching legacy renderPower().
  const ranked = useMemo(() => {
    const gated = merged.filter((r) => r.games >= minGames);
    return powerRanking(gated);
  }, [merged, minGames]);

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading power rankings…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load power ranking data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no power ranking data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-wrap items-center gap-1.5 p-4">
        <span className="mono-label mr-1">Min games</span>
        {MIN_GAMES_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={minGames === n}
            onClick={() => setMinGames(n)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              minGames === n
                ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            {n}+
          </button>
        ))}
      </div>

      {ranked.length === 0 ? (
        <div className="card-brand p-8 text-center">
          <p className="type-display text-2xl">No qualified players</p>
          <p className="mt-2 text-steel">No players meet this games threshold for this season/phase.</p>
        </div>
      ) : (
        (() => {
          const [leader, ...rest] = ranked;
          const leaderTier = tierFor(leader.score);
          return (
            <>
              <div className="card-neon p-6 sm:p-8">
                <div className="flex items-center gap-2">
                  {/* The MVP tab was folded into this one (near-identical
                      formulas) — the #1 power-ranked player wears the crown. */}
                  <span className="float-soft text-2xl" aria-hidden="true">
                    👑
                  </span>
                  <span className="mono-label">Power Ranking #1 · MVP</span>
                  <span className={`font-display text-sm font-black ${leaderTier.className}`}>
                    {leaderTier.label}-TIER
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="type-display text-4xl sm:text-5xl">{leader.summoner_name}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-steel">
                      <RoleChip role={leader.role_mode} />
                      <span className="font-mono">
                        {leader.games} games · {leader.winrate_pct.toFixed(1)}% WR
                      </span>
                    </p>
                  </div>
                  <p className="type-display glow-pulse text-6xl text-cyan sm:text-7xl [text-shadow:0_0_24px_rgb(53_230_255/0.5)]">
                    {leader.score.toFixed(1)}
                  </p>
                </div>
                <StatBar value={leader.score} max={100} color="cyan" className="mt-4" />
              </div>

              <div className="card-neon flex flex-col gap-1 p-2">
                {rest.map((entry, i) => {
                  const tier = tierFor(entry.score);
                  return (
                    <div
                      key={playerKey(entry)}
                      className="flex flex-wrap items-center gap-3 border-t border-line/50 px-3 py-2.5 first:border-t-0 sm:flex-nowrap"
                    >
                      <span className="w-8 shrink-0 font-mono text-sm font-semibold text-steel">#{i + 2}</span>
                      <span className={`w-5 shrink-0 text-center font-display text-sm font-black ${tier.className}`}>
                        {tier.label}
                      </span>
                      <div className="min-w-[9rem] flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                          {entry.summoner_name}
                          <RoleChip role={entry.role_mode} />
                        </p>
                        <p className="truncate font-mono text-xs text-steel">
                          {entry.games}g · {entry.winrate_pct.toFixed(1)}% WR
                        </p>
                      </div>
                      <StatBar
                        value={entry.score}
                        max={100}
                        color="cyan"
                        className="w-full max-w-xs flex-1"
                      />
                      <span className="w-12 shrink-0 text-right font-mono text-base font-bold text-cyan">
                        {entry.score.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()
      )}
    </div>
  );
}
