"use client";

import { useState } from "react";
import { ROLE_LABELS_SHORT } from "@/lib/draft/types";
import { championIconUrl } from "@/lib/match-draft/champions";
import type { InhouseChampionStat, InhousePlayerStats } from "@/lib/scouting/inhouse";
import type { ChampionPerformance, PlayerChampionStat } from "@/lib/scouting/performance";
import type { ScoutScope, ScopedScoutData } from "@/lib/scouting/types";
import styles from "./ScoutPlayerPools.module.css";

type PoolMode = "regular" | "inhouse";
type PoolLayout = "board" | "cards";

function metric(value: number | null, kind: "kda" | "damage" | "kp"): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (kind === "kda") return value.toFixed(2);
  if (kind === "damage") return String(Math.round(value));
  return `${Math.round(value)}%`;
}

function statSample(performance: ChampionPerformance): { label: string; detail: string } {
  if (performance.statGames === 0) return { label: "No stat games", detail: "No accepted game contains a valid performance metric." };
  const counts = [performance.kdaGames, performance.damageGames, performance.kpGames];
  if (counts.every((count) => count === performance.statGames)) {
    const games = performance.statGames === 1 ? "stat game" : "stat games";
    return { label: `${performance.statGames} ${games}`, detail: `${performance.statGames} accepted game${performance.statGames === 1 ? "" : "s"} supplied KDA, damage per minute, and kill participation.` };
  }
  return {
    label: "Partial stats",
    detail: `KDA: ${performance.kdaGames} game${performance.kdaGames === 1 ? "" : "s"}; DMG/min: ${performance.damageGames}; KP: ${performance.kpGames}.`,
  };
}

function ChampionPortrait({ champion }: { champion: string }) {
  const icon = championIconUrl(champion);
  if (!icon) return <span className={styles.portraitPlaceholder} aria-hidden="true">?</span>;
  // Data Dragon is a dynamic external image source; the URL helper owns the asset contract.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={icon} alt="" className={styles.portrait} loading="lazy" />;
}

function PerformanceRows({ performance }: { performance: ChampionPerformance }) {
  return <dl className={styles.stats}>
    <div className={styles.metricRow}><dt>KDA</dt><dd>{metric(performance.kda, "kda")}</dd></div>
    <div className={styles.metricRow}><dt>DMG/min</dt><dd>{metric(performance.damagePerMinute, "damage")}</dd></div>
    <div className={styles.metricRow}><dt>KP</dt><dd>{metric(performance.killParticipationPct, "kp")}</dd></div>
  </dl>;
}

function RegularChampionTile({ champion, totalPicks }: { champion: PlayerChampionStat; totalPicks: number }) {
  const sample = statSample(champion.performance);
  const share = totalPicks > 0 ? Math.min(100, (champion.count / totalPicks) * 100) : 0;
  return <div className={styles.tile} data-testid="scout-champion-tile">
    <div className={styles.tileHeader}>
      <ChampionPortrait champion={champion.champion} />
      <div className={styles.tileInfo}>
        <div className={styles.championName}>{champion.champion}</div>
        <div className={styles.count}>×{champion.count}</div>
        <div className={styles.frequency} aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
        <span className="sr-only">{champion.count} of {totalPicks} picks</span>
      </div>
    </div>
    <div className={styles.divider} />
    <PerformanceRows performance={champion.performance} />
    <div className={styles.statSample} title={sample.detail} aria-label={sample.detail}>{sample.label}</div>
  </div>;
}

function inhousePerformance(champion: InhouseChampionStat): ChampionPerformance {
  return champion.performance ?? {
    statGames: champion.games,
    kdaGames: champion.games,
    damageGames: 0,
    kpGames: 0,
    kda: champion.avg_kda,
    damagePerMinute: null,
    killParticipationPct: null,
  };
}

function InhouseChampionTile({ champion, totalGames }: { champion: InhouseChampionStat; totalGames: number }) {
  const performance = inhousePerformance(champion);
  const sample = statSample(performance);
  const share = totalGames > 0 ? Math.min(100, (champion.games / totalGames) * 100) : 0;
  return <div className={styles.tile} data-testid="scout-champion-tile">
    <div className={styles.tileHeader}>
      <ChampionPortrait champion={champion.champion} />
      <div className={styles.tileInfo}>
        <div className={styles.championName}>{champion.champion}</div>
        <div className={styles.modeDetail}>{champion.games} games · {champion.winrate_pct.toFixed(0)}% WR</div>
        <div className={styles.frequency} aria-hidden="true"><span style={{ width: `${share}%` }} /></div>
        <span className="sr-only">{champion.games} of {totalGames} in-house games</span>
      </div>
    </div>
    <div className={styles.divider} />
    <PerformanceRows performance={performance} />
    <div className={styles.statSample} title={sample.detail} aria-label={sample.detail}>{sample.label}</div>
  </div>;
}

function poolId(playerId: string, mode: PoolMode): string {
  return `scout-pool-${mode}-${playerId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function ScoutPlayerPools({
  data,
  scope,
  unavailable = false,
  mode = "regular",
  onModeChange,
  inhousePlayers = [],
  inhouseStatus = "available",
  resetKey = "",
}: {
  data: ScopedScoutData;
  scope: ScoutScope;
  unavailable?: boolean;
  mode?: PoolMode;
  onModeChange?: () => void;
  inhousePlayers?: InhousePlayerStats[];
  inhouseStatus?: "available" | "unavailable";
  resetKey?: string;
}) {
  const [layout, setLayout] = useState<PoolLayout>("board");
  const [expandedState, setExpandedState] = useState<{ context: string; players: Record<string, boolean> }>({ context: "", players: {} });
  const scopeLabel = scope === "season" ? "Current season" : scope === "recent" ? "Recent 5 series" : "All history";
  const expansionContext = resetKey + ":" + scope + ":" + mode;
  const expandedPlayers = expandedState.context === expansionContext ? expandedState.players : {};
  const hasRiotPicks = data.playerPools.some((player) => player.riotConfirmedPicks > 0);
  const evidenceNote = mode === "regular" && !unavailable
    ? !data.ingestionAvailable
      ? "Riot game data is unavailable; only explicit draft-player evidence is shown."
      : data.unresolvedIngestedGames > 0
        ? `${data.unresolvedIngestedGames} game${data.unresolvedIngestedGames === 1 ? " has" : "s have"} Riot coverage with an unresolved participant; it is left unattributed.`
        : !hasRiotPicks
          ? "No Riot-confirmed picks matched this roster; draft-only evidence is shown."
          : null
    : null;

  const toggleExpanded = (playerId: string) => {
    setExpandedState((current) => ({
      context: expansionContext,
      players: {
        ...(current.context === expansionContext ? current.players : {}),
        [playerId]: !(current.context === expansionContext && current.players[playerId]),
      },
    }));
  };

  const rows = mode === "regular"
    ? data.playerPools.map((player) => ({
        id: player.playerId,
        name: player.playerName,
        role: player.role,
        total: player.totalPicks,
        distinct: player.distinctChampions,
        champions: player.champions,
        riot: player.riotConfirmedPicks,
        draft: player.draftOnlyPicks,
        games: player.gamesSampled,
      }))
    : inhousePlayers.map((player) => ({
        id: player.playerId,
        name: player.playerName,
        role: player.role,
        total: player.games,
        distinct: player.champions.length,
        champions: player.champions,
        riot: 0,
        draft: 0,
        games: player.games,
      }));

  return <section aria-labelledby="player-pools-heading" className={styles.section}>
    <div className={styles.header}>
      <h2 id="player-pools-heading" className="type-display text-2xl">{mode === "inhouse" ? "In-house champion stats" : "Player pools"}</h2>
      <div className={styles.controls}>
        <span className="label-dash">{mode === "inhouse" ? "All available games" : scopeLabel}</span>
        <div className={styles.modeControls} aria-label="Game source">
          <button type="button" role="switch" aria-checked={mode === "inhouse"} aria-label={mode === "inhouse" ? "Switch to regular season" : "Switch to in-house"} onClick={onModeChange} className={styles.controlButton}>
            {mode === "inhouse" ? "In-house" : "Regular season"}
          </button>
        </div>
        <div className={styles.layoutControls} aria-label="Roster layout">
          <button type="button" aria-pressed={layout === "board"} onClick={() => setLayout("board")} className={styles.controlButton}>Roster board</button>
          <button type="button" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")} className={styles.controlButton}>Cards</button>
        </div>
      </div>
    </div>
    {evidenceNote ? <p className="mt-4 text-sm text-muted">{evidenceNote}</p> : null}
    {mode === "inhouse" && inhouseStatus === "unavailable" ? <p role="status" className={`${styles.empty} mt-4`}>In-house stats are unavailable right now. Regular-season scouting remains available.</p> : null}
    {mode === "regular" && unavailable ? <p className={`${styles.empty} mt-4`}>Current roster unavailable</p> : null}
    {mode === "inhouse" && inhouseStatus === "available" && rows.length === 0 ? <p className={`${styles.empty} mt-4`}>No in-house roster data found</p> : null}
    {!(mode === "inhouse" && inhouseStatus === "unavailable") && !(mode === "regular" && unavailable) && rows.length > 0 ? <div className={styles.boardViewport}>
      <div data-testid="scout-player-pool-board" className={`${styles.board} ${layout === "cards" ? styles.boardCards : ""}`}>
        <div className={styles.columnHead}><span>Player / Role</span><span>{mode === "regular" ? "Most played champions · performance" : "Champion · games / win rate / performance"}</span><span>Sample</span></div>
        {rows.map((row) => {
          const expanded = Boolean(expandedPlayers[row.id]);
          const visibleChampions = expanded ? row.champions : row.champions.slice(0, 5);
          const extra = Math.max(0, row.champions.length - 5);
          const targetId = poolId(row.id, mode);
          return <article className={styles.playerRow} key={row.id}>
            <div className={styles.playerIdentity}>
              <div className={styles.roleBadge}>{ROLE_LABELS_SHORT[row.role]}</div>
              <div>
                <div className={styles.playerName}>{row.name}</div>
                <div className={styles.playerRole}>{ROLE_LABELS_SHORT[row.role]}</div>
              </div>
            </div>
            <div id={targetId} className={styles.champions}>
              {visibleChampions.length === 0 ? <p className={styles.empty}>No in-house games found</p> : visibleChampions.map((champion) => mode === "regular"
                ? <RegularChampionTile key={champion.champion} champion={champion as PlayerChampionStat} totalPicks={row.total} />
                : <InhouseChampionTile key={champion.champion} champion={champion as InhouseChampionStat} totalGames={row.total} />)}
              {extra > 0 ? <button type="button" className={styles.disclosure} aria-expanded={expanded} aria-controls={targetId} onClick={() => toggleExpanded(row.id)}>{expanded ? "Show fewer" : `+${extra} more`}</button> : null}
            </div>
            <div>
              {mode === "regular" ? <span className="sr-only">{row.total} picks · {row.distinct} champions · {row.games} games</span> : null}
              <div className={styles.playerTotals}>
                <div className={styles.total}><strong>{row.total}</strong><span>{mode === "regular" ? "picks" : "games"}</span></div>
                <div className={styles.total}><strong>{row.distinct}</strong><span>champions</span></div>
                <div className={styles.total}><strong>{row.games}</strong><span>{mode === "regular" ? "games" : "available"}</span></div>
              </div>
              {mode === "regular" ? <div className={styles.evidence}><strong>{row.riot} Riot-confirmed · {row.draft} draft-only</strong></div> : null}
            </div>
          </article>;
        })}
        <div className={styles.boardNote}>{mode === "regular" ? "Top five champions per player · All picks included in sample totals" : "All available in-house games · KDA uses the known per-game K/D/A fields; DMG/min and KP are unavailable until their source contract is verified."}</div>
      </div>
    </div> : null}
  </section>;
}
