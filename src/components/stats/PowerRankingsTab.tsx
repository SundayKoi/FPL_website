"use client";

import { useCallback, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows, powerRanking } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchPlayerKeysForTeams } from "@/lib/stats/queries";
import { filterStatsRowsByPlayerKeys, playerKey } from "@/lib/stats/scope";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, FilterPill, LoadingCard, RoleChip, StatBar, tierFor } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

// Legacy `renderPower()`'s own min-games <select> defaults to 5+
// (`id="prMinG"`, `<option value="5" selected>` — see formulas.ts doc
// comment on `powerRanking`). The formula itself applies no games gate,
// so this tab reproduces the page-level filter the legacy caller used,
// with the same 1/3/5/8/10 option set as Leaderboard for consistency.
const MIN_GAMES_OPTIONS = [1, 3, 5, 8, 10] as const;

export default function PowerRankingsTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
  const loadRows = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    const data = await fetchPlayerAgg(seasonParam, phaseParam);
    const keys = teamNames ? await fetchPlayerKeysForTeams(teamNames) : null;
    return keys ? filterStatsRowsByPlayerKeys(data, keys) : data;
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);
  const [minGames, setMinGames] = useState(5);

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
    return <LoadingCard label="power rankings" />;
  }

  if (status === "error") {
    return <ErrorCard noun="power ranking" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no power ranking data for this season/phase yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-wrap items-center gap-1.5 p-4">
        <span className="mono-label mr-1">Min games</span>
        {MIN_GAMES_OPTIONS.map((n) => (
          <FilterPill key={n} active={minGames === n} onClick={() => setMinGames(n)}>
            {n}+
          </FilterPill>
        ))}
      </div>

      {ranked.length === 0 ? (
        <EmptyCard
          title="No qualified players"
          message="No players meet this games threshold for this season/phase."
        />
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
