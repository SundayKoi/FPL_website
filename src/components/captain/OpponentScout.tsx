"use client";

import { useMemo, useState } from "react";
import { formatKickoff } from "@/lib/schedule/format";
import { deriveScoutData, scoutKey } from "@/lib/scouting/derive";
import { teamGameRecord, teamRecord } from "@/lib/teams/teamPage";
import type { ScoutScope, ScoutSource } from "@/lib/scouting/types";
import ScoutPatterns from "./scouting/ScoutPatterns";
import ScoutPastDrafts from "./scouting/ScoutPastDrafts";
import ScoutPlayerPools from "./scouting/ScoutPlayerPools";
import styles from "./scouting/ScoutPlayerPools.module.css";

function percentage(part: number, total: number): string {
  if (total <= 0) return "0";
  const value = (part / total) * 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function RecordBar({ wins, losses, label }: { wins: number; losses: number; label: string }) {
  const total = wins + losses;
  const winPct = total > 0 ? (wins / total) * 100 : 0;
  const lossPct = total > 0 ? (losses / total) * 100 : 0;
  const ariaLabel = total > 0
    ? label + ": " + wins + " wins, " + losses + " losses; " + percentage(wins, total) + "% wins, " + percentage(losses, total) + "% losses"
    : label + ": no results";
  return <div>
    <div className={styles.summaryBar} role="img" aria-label={ariaLabel}>
      <span className={styles.summaryWin} style={{ width: winPct + "%" }} />
      <span className={styles.summaryLoss} style={{ width: lossPct + "%" }} />
    </div>
    {total > 0 ? <div className={styles.summaryLabels}><span className={styles.winLabel}>{percentage(wins, total)}% wins</span><span className={styles.lossLabel}>{percentage(losses, total)}% losses</span></div> : <p className={styles.summarySmall}>No results</p>}
  </div>;
}

function SideBar({ blueGames, total }: { blueGames: number; total: number }) {
  const redGames = Math.max(0, total - blueGames);
  const bluePct = total > 0 ? (blueGames / total) * 100 : 0;
  const redPct = total > 0 ? (redGames / total) * 100 : 0;
  const ariaLabel = total > 0
    ? "Side played: Blue " + blueGames + " games, " + percentage(blueGames, total) + "%; Red " + redGames + " games, " + percentage(redGames, total) + "%"
    : "Side played: no recorded draft sample";
  return <div>
    <div className={styles.sideNumber}><span className={styles.blueLabel}>{percentage(blueGames, total)}<small>%</small></span><span className={styles.redLabel}>{percentage(redGames, total)}<small>%</small></span></div>
    <div className={styles.summaryBar} role="img" aria-label={ariaLabel}>
      <span className={styles.summaryBlue} style={{ width: bluePct + "%" }} />
      <span className={styles.summaryRed} style={{ width: redPct + "%" }} />
    </div>
    {total > 0 ? <div className={styles.summaryLabels}><span className={styles.blueLabel}>Blue · {blueGames}</span><span className={styles.redLabel}>Red · {redGames}</span></div> : <p className={styles.summarySmall}>No recorded side sample</p>}
  </div>;
}

export default function OpponentScout({
  source,
  perspective = "opponent",
  showExtendedPatterns = false,
}: {
  source: ScoutSource;
  perspective?: "opponent" | "team";
  showExtendedPatterns?: boolean;
}) {
  const [scope, setScope] = useState<ScoutScope>("season");
  const [mode, setMode] = useState<"regular" | "inhouse">("regular");
  const data = useMemo(
    () => deriveScoutData(source, scope, { playerLimit: null }),
    [source, scope],
  );
  const hasDrafts = data.pastDrafts.length > 0;
  const subjectLabel = perspective === "team" ? "Team" : "Opponent";
  const emptyDraftCopy = perspective === "team"
    ? "No recorded drafts for this team yet"
    : "No recorded drafts for this opponent yet";
  const subjectName = source.teamName ?? source.opponentName;
  const currentSeasonFixtures = source.fixtures.filter((fixture) => fixture.season === source.currentSeason);
  const currentSeasonRecord = teamRecord(currentSeasonFixtures, subjectName);
  const currentSeasonGameRecord = teamGameRecord(currentSeasonFixtures, subjectName);
  const fixtureOpponentName = source.nextFixture && perspective === "team"
    ? scoutKey(source.nextFixture.team_a) === scoutKey(subjectName)
      ? source.nextFixture.team_b ?? source.opponentName
      : scoutKey(source.nextFixture.team_b) === scoutKey(subjectName)
        ? source.nextFixture.team_a ?? source.opponentName
        : source.opponentName
    : source.opponentName;
  const hasPlayerPoolStats = data.playerPools.some((player) => player.gamesSampled > 0);
  const showPoolsWithoutHistory = !hasDrafts && (perspective === "team" || hasPlayerPoolStats);
  const inhouseStatus = source.inhousePlayerStatsStatus ?? "available";
  const poolResetKey = [subjectName, source.currentSeason, source.roster.map((player) => player.id).join(",")].join(":");

  return <section aria-labelledby="scouting-heading" className="mt-8 space-y-4">
    <h2 id="scouting-heading" className="sr-only">Scouting</h2>
    <header className={styles.reportHeader}>
      <div className={styles.reportIdentity}>
        <span className={styles.eyebrow}>My Team · Scouting</span>
        <h3 className={styles.reportName}>{subjectName}</h3>
        <p className={styles.reportSupporting}>{subjectLabel} report · draft evidence and roster performance for {source.currentSeason}</p>
        <div className={styles.reportControls}>
          {mode === "regular" ? <label className={styles.scopeControl}>Draft history<select aria-label="Draft history" value={scope} onChange={(event) => setScope(event.target.value as ScoutScope)} className={styles.scopeSelect}><option value="season">Current season</option><option value="recent">Recent 5 series</option><option value="all">All history</option></select></label> : <span className="label-dash">In-house scope · all available games</span>}
          <span className="label-dash"><span>{subjectLabel}</span>: {source.teamName ?? source.opponentName}</span>
        </div>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCell}>
          <div className={styles.summaryLabel}>Series record</div>
          <div className={styles.summaryNumber}><span className="sr-only">{currentSeasonRecord.wins}-{currentSeasonRecord.losses}</span>{currentSeasonRecord.wins} <span className={styles.summaryMuted}>– {currentSeasonRecord.losses}</span></div>
          <RecordBar wins={currentSeasonRecord.wins} losses={currentSeasonRecord.losses} label="Series record" />
          <p className={styles.summarySmall}>{currentSeasonRecord.seriesPlayed} series · current season</p>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.summaryLabel}>Game record</div>
          <div className={styles.summaryNumber}><span className="sr-only">{currentSeasonGameRecord.wins}-{currentSeasonGameRecord.losses}</span>{currentSeasonGameRecord.wins} <span className={styles.summaryMuted}>– {currentSeasonGameRecord.losses}</span></div>
          <RecordBar wins={currentSeasonGameRecord.wins} losses={currentSeasonGameRecord.losses} label="Game record" />
          <p className={styles.summarySmall}>{currentSeasonGameRecord.gamesPlayed} games · current season</p>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.summaryLabel}>Drafts sampled</div>
          <div className={styles.summaryNumber}>{mode === "regular" ? data.gamesSampled : <span className={styles.summaryMuted}>—</span>}</div>
          <p className={styles.summarySmall}>{mode === "regular" ? (scope === "season" ? "Current season" : scope === "recent" ? "Recent 5 series" : "All history") + " · recorded drafts" : "Regular draft scope only"}</p>
        </div>
        <div className={styles.summaryCell}>
          <div className={styles.summaryLabel}>Side played</div>
          {mode === "regular" ? <SideBar blueGames={data.blueGames} total={data.gamesSampled} /> : <p className={styles.summarySmall}>Not used for in-house stats</p>}
        </div>
        <div className={styles.summaryCell} aria-label="Next fixture">
          <div className={styles.summaryLabel}>{source.nextFixture ? "Next fixture" : "Upcoming fixture"}</div>
          {source.nextFixture ? <><div className={styles.summaryFixture}>vs {fixtureOpponentName} <span className="label-dash">Bo{source.nextFixture.best_of}</span><span className="sr-only">Bo{source.nextFixture.best_of} · vs {fixtureOpponentName}</span></div><p className={styles.summarySmall}>{formatKickoff(source.nextFixture.scheduled_at)}</p></> : <p className={styles.summarySmall + " mt-2"}>No fixture scheduled</p>}
        </div>
      </div>
    </header>
    {showPoolsWithoutHistory ? <p className="card-brand p-5 text-sm text-muted">{emptyDraftCopy}</p> : null}
    {mode === "inhouse" || hasDrafts || showPoolsWithoutHistory ? <><ScoutPlayerPools data={data} scope={scope} resetKey={poolResetKey} unavailable={source.roster.length === 0} mode={mode} onModeChange={() => setMode((current) => current === "regular" ? "inhouse" : "regular")} inhousePlayers={source.inhousePlayerStats ?? []} inhouseStatus={inhouseStatus} />{mode === "regular" && hasDrafts ? <><ScoutPatterns data={data} showExtendedPatterns={showExtendedPatterns} /><ScoutPastDrafts drafts={data.pastDrafts} /></> : null}</> : <p className="card-brand p-5 text-sm text-muted">{emptyDraftCopy}</p>}
  </section>;
}
