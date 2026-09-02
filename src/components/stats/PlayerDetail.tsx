"use client";

import { useCallback, useMemo } from "react";
import { combineSeasonRows, mergeRows, scoutingProfile } from "@/lib/stats/formulas";
import { formatDate, formatValue } from "@/lib/stats/format";
import { fetchPlayerAgg, fetchRecords } from "@/lib/stats/queries";
import { playerKey } from "@/lib/stats/scope";
import { createClient } from "@/lib/supabase/client";
import type { PlayerAggRow, RecordRow, ScoutingStatLine } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { RoleChip } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

/** One row of a player's last 10 games, read directly from `raw_stats` (public-read). */
interface RecentGame {
  game_date: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

/** A laning-block stat: this player's value vs the same-role cohort average, plus the delta. */
interface LaningStat {
  label: string;
  mine: number;
  cohort: number;
  delta: number;
  fmt: "int" | "dec1";
}

function formatStat(value: number, fmt: ScoutingStatLine["fmt"]): string {
  switch (fmt) {
    case "pct":
      return `${value.toFixed(1)}%`;
    case "dec1":
      return value.toFixed(1);
    case "dec2":
      return value.toFixed(2);
    case "int":
      return Math.round(value).toLocaleString();
  }
}

function laningDeltaClass(delta: number): string {
  if (delta > 0) return "text-mint";
  if (delta < 0) return "text-red-400";
  return "text-muted";
}

const CARD_TITLES: Record<"core" | "damage" | "economy" | "vision", string> = {
  core: "Core Performance",
  damage: "Damage Profile",
  economy: "Economy",
  vision: "Vision & Map Control",
};

export default function PlayerDetail({
  summonerName,
  tag,
  season,
  phase,
  onBack,
}: {
  summonerName: string;
  tag: string;
  season: string;
  phase: PhaseFilter;
  onBack: () => void;
}) {
  const loadDetail = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    const supabase = createClient();

    const [agg, recordRows, teamRows, gameRows] = await Promise.all([
      // Cohort math (laning deltas) needs every player's rows for this
      // season/phase scope, not just this player's — fetch unfiltered
      // by player and derive both "my row(s)" and "the cohort" from it.
      fetchPlayerAgg(seasonParam, phaseParam),
      fetchRecords(seasonParam, phaseParam),
      supabase
        .from("raw_stats")
        .select("team_name")
        .eq("summoner_name", summonerName)
        .eq("tag", tag),
      supabase
        .from("raw_stats")
        .select("game_date, champion, kills, deaths, assists, win")
        .eq("summoner_name", summonerName)
        .eq("tag", tag)
        .order("game_date", { ascending: false })
        .limit(10),
    ]);

    if (teamRows.error) throw teamRows.error;
    if (gameRows.error) throw gameRows.error;

    return {
      aggRows: agg,
      records: recordRows,
      teams: Array.from(new Set((teamRows.data ?? []).map((r) => r.team_name as string))).sort(),
      recentGames: (gameRows.data ?? []) as RecentGame[],
    };
  }, [summonerName, tag, season, phase]);
  const { data, status } = useStatsFetch(loadDetail, `${summonerName}#${tag}::${season}::${phase}`);
  const aggRows = useMemo(() => data?.aggRows ?? [], [data]);
  const records = useMemo(() => data?.records ?? [], [data]);
  const teams = data?.teams ?? [];
  const recentGames = data?.recentGames ?? [];

  // This player's row(s) in the current season/phase scope. With "All
  // seasons" selected, fetchPlayerAgg returns one row per season for this
  // player — games-weighted-combine them the same way LeaderboardTab does,
  // so the identity header/averages/laning block show one merged row.
  const myRow = useMemo(() => {
    const mine = aggRows.filter((r) => playerKey(r) === playerKey({ summoner_name: summonerName, tag }));
    if (mine.length === 0) return null;
    return combineSeasonRows(mine);
  }, [aggRows, summonerName, tag]);

  // Same-role cohort average for the laning block: every OTHER player
  // sharing this player's role_mode, in scope for the current season/phase
  // filter, excluding this player's own row(s) so the comparison is "me vs
  // everyone else at my role," not "me vs a cohort that includes me."
  //
  // Fix round: under "All seasons," `aggRows` holds one raw row PER SEASON
  // per player (not yet combined) — averaging over those raw rows directly
  // would let a player with more seasons of history contribute more rows
  // (more weight) to the cohort mean than a player with fewer seasons,
  // while `myRow` above is a single games-weighted `combineSeasonRows`
  // result. Group by player first and combine each player's rows the same
  // way, so the cohort is "one games-weighted row per player" — consistent
  // with how myRow itself is computed — before averaging across players.
  const cohort = useMemo(() => {
    if (!myRow) return null;
    const myKey = playerKey({ summoner_name: summonerName, tag });
    const rows = mergeRows(
      aggRows.filter((r) => playerKey(r) !== myKey),
      playerKey,
      (group) => combineSeasonRows(group),
    ).filter((r) => r.role_mode === myRow.role_mode);
    if (rows.length === 0) return null;
    const mean = (pick: (r: PlayerAggRow) => number) => rows.reduce((s, r) => s + pick(r), 0) / rows.length;
    return {
      avg_cs_at_10: mean((r) => r.avg_cs_at_10),
      avg_gold_at_10: mean((r) => r.avg_gold_at_10),
      avg_xp_at_10: mean((r) => r.avg_xp_at_10),
      size: rows.length,
    };
  }, [aggRows, myRow, summonerName, tag]);

  const laning: LaningStat[] | null = useMemo(() => {
    if (!myRow || !cohort) return null;
    // delta is kept unrounded here and rounded exactly once at render time
    // (per `fmt`) — rounding it here too (e.g. to 1 decimal) and then
    // rounding again for an "int" display double-rounds and can shift the
    // displayed value by 1 at a .5 boundary (e.g. 198.4966... -> 198.5 ->
    // 199, when a single round gives the correct 198).
    const stat = (label: string, mine: number, cohortVal: number, fmt: LaningStat["fmt"]): LaningStat => ({
      label,
      mine,
      cohort: cohortVal,
      delta: mine - cohortVal,
      fmt,
    });
    return [
      stat("CS @ 10", myRow.avg_cs_at_10, cohort.avg_cs_at_10, "dec1"),
      stat("Gold @ 10", myRow.avg_gold_at_10, cohort.avg_gold_at_10, "int"),
      stat("XP @ 10", myRow.avg_xp_at_10, cohort.avg_xp_at_10, "int"),
    ];
  }, [myRow, cohort]);

  const profile = useMemo(() => (myRow ? scoutingProfile(myRow) : null), [myRow]);

  // Fix round: stats_records now carries `tag` (migration
  // 20260810100003_records_tag.sql) — filtering by summoner_name alone
  // collided for the 6 shared-name/different-tag pairs in raw_stats (e.g.
  // Aura#5950 vs Aura#RGB0 are different people; Aura#RGB0's detail page
  // was showing Aura#5950's records). Match both fields.
  const myRecords = useMemo(
    () => records.filter((r) => r.summoner_name === summonerName && r.tag === tag),
    [records, summonerName, tag],
  );

  // Rank each of this player's record entries within the FULL category
  // (every player's rows for that category, not just this player's), so
  // "#1" only shows when they actually top the leaderboard — ranking
  // against just their own entries would always read "#1".
  const recordsByCategory = useMemo(() => {
    const groups = new Map<string, { entry: RecordRow; rank: number }[]>();
    for (const row of myRecords) {
      const categoryRows = records.filter((r) => r.category === row.category);
      const rank = categoryRows.filter((r) => r.value > row.value).length + 1;
      const list = groups.get(row.category);
      if (list) list.push({ entry: row, rank });
      else groups.set(row.category, [{ entry: row, rank }]);
    }
    return groups;
  }, [myRecords, records]);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text/60 hover:text-action-text"
      >
        <span aria-hidden="true">←</span> Back
      </button>

      {status === "loading" ? (
        <div className="card-neon p-8 text-center text-muted" role="status">
          Loading player…
        </div>
      ) : status === "error" ? (
        <div className="card-neon p-8 text-center text-muted">
          Couldn&apos;t load this player&apos;s data. Try again shortly.
        </div>
      ) : !myRow || !profile ? (
        <div className="card-neon p-8 text-center">
          <p className="type-display text-2xl">No stats yet</p>
          <p className="mt-2 text-muted">
            {summonerName}#{tag} has no data for this season/phase.
          </p>
        </div>
      ) : (
        <>
          {/* Identity header */}
          <div className="card-neon flex flex-col gap-3 p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="type-display text-4xl sm:text-5xl">
                  {myRow.summoner_name}
                  <span className="text-muted">#{myRow.tag}</span>
                </p>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <RoleChip role={myRow.role_mode} />
                  <span className="font-mono">
                    {teams.length > 0 ? teams.join(", ") : "Unknown team"}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="type-display text-3xl text-cyan sm:text-4xl [text-shadow:0_0_18px_rgb(53_230_255/0.4)]">
                  {myRow.winrate_pct.toFixed(1)}%
                </p>
                <p className="font-mono text-xs text-muted">
                  {myRow.games} games · {myRow.wins}W {myRow.games - myRow.wins}L
                </p>
              </div>
            </div>
          </div>

          {/* Core averages grid */}
          <div className="card-neon p-4 sm:p-6">
            <span className="mono-label">Core Averages</span>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "KDA", value: myRow.kda.toFixed(2) },
                { label: "K/D/A", value: `${myRow.avg_kills.toFixed(1)}/${myRow.avg_deaths.toFixed(1)}/${myRow.avg_assists.toFixed(1)}` },
                { label: "KP%", value: `${myRow.avg_kp_pct.toFixed(1)}%` },
                { label: "CS/Min", value: myRow.avg_cs_per_min.toFixed(2) },
                { label: "Gold/Min", value: myRow.avg_gold_per_min.toFixed(0) },
                { label: "DMG/Min", value: myRow.avg_dmg_per_min.toFixed(0) },
                { label: "DMG Share", value: `${myRow.avg_dmg_share_pct.toFixed(1)}%` },
                { label: "Vision/Min", value: myRow.avg_vision_per_min.toFixed(2) },
                { label: "Solo Kills/g", value: myRow.avg_solo_kills.toFixed(1) },
                { label: "DMG Taken/Min", value: myRow.avg_dmg_taken_per_min.toFixed(0) },
                { label: "First Bloods", value: String(myRow.first_blood_involvements) },
                { label: "Avg Duration", value: `${myRow.avg_game_duration.toFixed(1)}m` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded border border-border-strong/60 bg-canvas/70 p-3 transition hover:border-action-text/50"
                >
                  <p className="font-mono text-lg font-bold text-cyan">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-muted">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Laning block */}
          {laning && (
            <div className="card-neon p-4 sm:p-6">
              <span className="mono-label">
                Laning Phase vs {myRow.role_mode} Average ({cohort!.size} players)
              </span>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {laning.map((stat) => (
                  <div key={stat.label} className="rounded border border-border-subtle/60 bg-canvas p-3 text-center">
                    <p className="text-xs text-muted">{stat.label}</p>
                    <p className="mt-1 text-xl font-bold text-white">
                      {stat.fmt === "int" ? Math.round(stat.mine).toLocaleString() : stat.mine.toFixed(1)}
                    </p>
                    <p className={`mt-0.5 text-sm font-semibold ${laningDeltaClass(stat.delta)}`}>
                      {stat.delta > 0 ? "+" : ""}
                      {stat.fmt === "int" ? Math.round(stat.delta).toLocaleString() : stat.delta.toFixed(1)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      vs {stat.fmt === "int" ? Math.round(stat.cohort).toLocaleString() : stat.cohort.toFixed(1)} avg
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scouting cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["core", "damage", "economy", "vision"] as const).map((key) => (
              <div key={key} className="card-neon flex flex-col gap-2 p-4">
                <p className="type-display text-lg">
                  <span className="text-cyan">{"//"}</span> {CARD_TITLES[key]}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {profile[key].map((line) => (
                    <li
                      key={line.label}
                      className="flex items-center justify-between gap-3 border-t border-border-subtle/60 pt-1.5 first:border-t-0 first:pt-0"
                    >
                      <span className="text-sm text-muted">{line.label}</span>
                      <span className="text-sm font-semibold text-white">{formatStat(line.value, line.fmt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Records held */}
          <div className="card-neon p-4 sm:p-6">
            <span className="mono-label">
              Records Held — {summonerName}
              {/* Fix round: name+tag disambiguation, same reasoning as
                  RecordsTab — cheap for viewers to confirm which of a
                  shared-name pair (e.g. Aura#5950 vs Aura#RGB0) this
                  section belongs to, even though myRecords is already
                  filtered by name AND tag. */}
              <span className="text-muted">#{tag}</span>
            </span>
            {recordsByCategory.size === 0 ? (
              <p className="mt-3 text-sm text-muted">No records held for this season/phase.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(recordsByCategory.entries()).map(([category, entries]) => (
                  <div key={category} className="rounded border border-border-subtle/60 bg-canvas p-3">
                    <p className="text-sm font-semibold text-white">{category}</p>
                    {entries
                      .sort((a, b) => a.rank - b.rank)
                      .map(({ entry, rank }) => (
                        <p key={`${entry.match_id}-${entry.category}`} className="mt-1 text-xs text-muted">
                          <span className="text-gold">#{rank}</span> ·{" "}
                          {formatValue(entry.value)} ·{" "}
                          {formatDate(entry.game_date)}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent games */}
          <div className="card-neon overflow-x-auto p-2">
            <span className="mono-label block px-2 pt-2">Recent Games</span>
            {recentGames.length === 0 ? (
              <p className="p-4 text-sm text-muted">No recent games found.</p>
            ) : (
              <table className="mt-2 w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">Result</th>
                    <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">Champion</th>
                    <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">K/D/A</th>
                    <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGames.map((game, i) => (
                    <tr key={`${game.game_date}-${i}`} className="border-t border-border-subtle/60">
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            game.win ? "bg-mint/15 text-mint" : "bg-red-500/15 text-red-400"
                          }`}
                        >
                          {game.win ? "W" : "L"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-white">{game.champion}</td>
                      <td className="px-2 py-1.5 text-muted">
                        {game.kills}/{game.deaths}/{game.assists}
                      </td>
                      <td className="px-2 py-1.5 text-muted">{formatDate(game.game_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
