"use client";

import { useCallback, useEffect } from "react";
import { formatDuration } from "@/lib/stats/format";
import { applyForfeits } from "@/lib/stats/forfeits";
import { fetchForfeitRecords, fetchTeamAgg } from "@/lib/stats/queries";
import { mergeTeamRowsForScope, resolveTeamParam } from "@/lib/stats/teamProfile";
import { awardSuperlatives, type Superlative } from "@/lib/stats/superlatives";
import type { TeamAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import TeamDetail from "./TeamDetail";
import { EmptyCard, ErrorCard, LoadingCard, StatBar } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

export default function TeamsTab({
  season,
  phase,
  teamNames,
  selectedTeamName,
  onSelectTeam,
}: {
  season: string;
  phase: PhaseFilter;
  teamNames?: string[];
  selectedTeamName: string | null;
  onSelectTeam: (teamName: string | null) => void;
}) {
  const loadRows = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    // Forfeits ride alongside: a conceded game has no Riot match id, so
    // the view never sees it, and a 3-4 team would read 2-4 without this.
    const [agg, forfeits] = await Promise.all([
      fetchTeamAgg(seasonParam, phaseParam, teamNames),
      fetchForfeitRecords(seasonParam, phaseParam, teamNames).catch((error) => {
        console.error("stats: forfeit records unavailable; showing played games only", error);
        return [];
      }),
    ]);
    return { agg, forfeits };
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = data?.agg ?? [];
  const forfeits = data?.forfeits ?? [];

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" (the view emits one row per phase, so a single season with
  // both Regular and Playoffs games still returns 2 rows per team).
  const played = mergeTeamRowsForScope(rows, season, phase);
  // After the merge, so the per-game rates stay weighted by games played.
  const merged = applyForfeits(played, forfeits, season === ALL_SEASONS ? ALL_SEASONS : undefined);
  const sorted = [...merged].sort((a, b) => {
    if (b.winrate_pct !== a.winrate_pct) return b.winrate_pct - a.winrate_pct;
    return b.games - a.games;
  });

  useEffect(() => {
    if (!selectedTeamName) return;
    const canonical = resolveTeamParam(sorted, selectedTeamName);
    if (canonical && canonical !== selectedTeamName) onSelectTeam(canonical);
  }, [onSelectTeam, selectedTeamName, sorted]);

  if (status === "loading") {
    return <LoadingCard label="teams" />;
  }

  if (status === "error") {
    return <ErrorCard noun="team" />;
  }

  if (selectedTeamName) {
    const canonical = resolveTeamParam(sorted, selectedTeamName);
    const detailRow = canonical
      ? sorted.find((row) => row.team_name.trim() === canonical) ?? null
      : null;
    return (
      <TeamDetail
        row={detailRow}
        teamName={canonical ?? selectedTeamName.trim()}
        season={season}
        phase={phase}
        onBack={() => onSelectTeam(null)}
      />
    );
  }

  if (rows.length === 0 && forfeits.length === 0) {
    return <EmptyCard message="There's no team data for this season/phase yet." />;
  }

  /** What each team is league-best at. A grid of ten identical numbers
   *  per team makes every team look the same; one badge saying "most
   *  first bloods" is the thing someone actually repeats out loud. The
   *  strict-lead tie rule lives in `awardSuperlatives`. */
  const SUPERLATIVES: Superlative<TeamAggRow>[] = [
    { key: "dragon", label: "Dragon control", pick: (r) => r.dragon_rate },
    { key: "baron", label: "Baron control", pick: (r) => r.baron_rate },
    { key: "fb", label: "First blood", pick: (r) => r.first_blood_rate },
    { key: "ft", label: "First tower", pick: (r) => r.first_tower_rate },
    { key: "kills", label: "Most kills", pick: (r) => r.avg_team_kills },
    { key: "fast", label: "Fastest games", pick: (r) => r.avg_duration_min, lowIsBest: true },
  ];

  const badges = awardSuperlatives(sorted, (r) => r.team_name, SUPERLATIVES);

  const RATES: { label: string; pick: (r: TeamAggRow) => number; color: "cyan" | "pink" | "purple" | "gold" }[] = [
    { label: "Dragon", pick: (r) => r.dragon_rate, color: "cyan" },
    { label: "Baron", pick: (r) => r.baron_rate, color: "purple" },
    { label: "First blood", pick: (r) => r.first_blood_rate, color: "pink" },
    { label: "First tower", pick: (r) => r.first_tower_rate, color: "gold" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((row, i) => {
        const won = row.winrate_pct;
        return (
          <article
            key={row.team_name}
            aria-label={`${row.team_name} team stats`}
            className={`card-neon flex flex-col gap-3 p-4 ${i === 0 ? "row-rank-1" : ""}`}
          >
            <button
              type="button"
              aria-label={`${row.team_name} team stats`}
              onClick={() => onSelectTeam(row.team_name)}
              className="flex w-full flex-col gap-3 text-left"
            >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-display text-xl font-semibold text-white">
                  {i === 0 && <span className="mr-1.5 font-mono text-gold">#1</span>}
                  {row.team_name}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  <span className="text-mint">{row.wins}W</span>
                  {" · "}
                  <span className="text-pink">{row.losses}L</span>
                  {" · "}
                  {row.games} games
                  {(row.forfeit_wins ?? 0) + (row.forfeit_losses ?? 0) > 0 ? (
                    <span className="text-muted" title="Games decided by forfeit count in the record; the rates below are from games played.">
                      {" · "}
                      {(row.forfeit_wins ?? 0) + (row.forfeit_losses ?? 0)} by forfeit
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`font-mono text-2xl font-bold tabular-nums ${i === 0 ? "text-gold" : "text-white"}`}>
                  {won.toFixed(0)}%
                </p>
                <p className="mono-label">win rate</p>
              </div>
            </div>

            {badges.get(row.team_name)?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {badges.get(row.team_name)!.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gold"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}

            <dl className="flex flex-col gap-1.5">
              {RATES.map((rate) => (
                <div key={rate.label} className="flex items-center gap-2">
                  <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {rate.label}
                  </dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <StatBar value={rate.pick(row)} max={100} color={rate.color} className="flex-1" />
                    <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-white">
                      {rate.pick(row).toFixed(0)}%
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex justify-between border-t border-border-subtle/50 pt-2 font-mono text-xs text-muted">
              <span>
                <span className="text-white">{row.avg_team_kills.toFixed(1)}</span> kills/game
              </span>
              <span>
                <span className="text-white">{formatDuration(row.avg_duration_min)}</span> avg
              </span>
            </div>
            </button>
          </article>
        );
      })}
    </div>
  );
}
