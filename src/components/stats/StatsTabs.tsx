"use client";

import { useEffect, useState } from "react";
import { fetchPlayerAgg, fetchSeasons } from "@/lib/stats/queries";
import { scopeSeasons } from "@/lib/stats/scope";
import { resolvePlayerParam } from "@/lib/stats/resolvePlayer";
import ChampionsTab from "./ChampionsTab";
import LeaderboardTab from "./LeaderboardTab";
import PlayerDetail from "./PlayerDetail";
import PlayersTab, { type SelectedPlayer } from "./PlayersTab";
import PowerRankingsTab from "./PowerRankingsTab";
import RecordsTab from "./RecordsTab";
import SeasonSelect, { ALL_SEASONS, type PhaseFilter } from "./SeasonSelect";
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

const PHASES: PhaseFilter[] = ["All", "Regular", "Playoffs"];

export default function StatsTabs({
  initialPlayer,
  initialTab,
  initialSeason,
  initialPhase,
  teamNames,
  allowedSeasons,
  excludedSeasons,
}: {
  initialPlayer?: string;
  initialTab?: string;
  initialSeason?: string;
  initialPhase?: string;
  teamNames?: string[];
  /** Only these seasons are offered (Academy: its own season code). */
  allowedSeasons?: string[];
  /** These seasons are hidden (Premier: the Academy season code). */
  excludedSeasons?: string[];
}) {
  // Arrays arrive as fresh references on every render, so the effects below
  // key off their contents rather than their identity.
  const allowedKey = (allowedSeasons ?? []).join(",");
  const excludedKey = (excludedSeasons ?? []).join(",");
  const singleSeason = allowedSeasons?.length === 1 ? allowedSeasons[0] : null;
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "Leaderboard",
  );
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState<string>(initialSeason || singleSeason || ALL_SEASONS);
  const [phase, setPhase] = useState<PhaseFilter>(
    PHASES.includes(initialPhase as PhaseFilter) ? (initialPhase as PhaseFilter) : "All",
  );
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);
  // Selection state lives here, one level above both entry points
  // (LeaderboardTab row click and the Players tab list), so either one
  // opens the identical PlayerDetail via the same `onSelectPlayer`
  // callback — simplest consistent approach per the brief, rather than
  // duplicating detail-view state inside each tab.
  const [selectedPlayer, setSelectedPlayer] = useState<SelectedPlayer | null>(null);
  // ?player= deep links (e.g. roster names on the teams page). Resolved
  // against stats identities once on mount; a hit opens PlayerDetail, a
  // miss lands on the Players tab with the query prefilled so the visitor
  // can pick the right person instead of us guessing.
  const [playersPrefill, setPlayersPrefill] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = scopeSeasons(
          await fetchSeasons(),
          allowedKey ? allowedKey.split(",") : undefined,
          excludedKey ? excludedKey.split(",") : undefined,
        );
        if (cancelled) return;
        setSeasons(data);
        // Default to the newest season — but not when a ?player= deep link
        // is active (the resolve effect opens the card in all-seasons view
        // and this default would race it) and not when the URL asked for a
        // specific season (?season=). A single-season league has no
        // "All seasons" option, so it defaults regardless.
        if (data.length > 0 && (singleSeason || (!initialPlayer && !initialSeason))) setSeason(data[0]);
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
  }, [initialPlayer, initialSeason, allowedKey, excludedKey, singleSeason]);

  // True while a ?player= deep link is still resolving — the URL-sync
  // effect below holds off so it doesn't strip the player param before the
  // card opens (a refresh in that window would otherwise lose the link).
  const [deepLinkPending, setDeepLinkPending] = useState(Boolean(initialPlayer));

  useEffect(() => {
    if (!initialPlayer) return;
    let cancelled = false;

    async function resolve() {
      try {
        // Unfiltered fetch (every season/phase) so the deep link works even
        // for players with no games in the default season.
        const rows = await fetchPlayerAgg();
        if (cancelled) return;
        const match = resolvePlayerParam(rows, initialPlayer!);
        if (match) {
          // Open in "All seasons / All phases" so the card is never empty
          // for a player whose games are in an earlier season than the
          // page's default (newest) selection. A single-season league stays
          // on its own season — "all seasons" there would mean other leagues.
          setSeason(singleSeason ?? ALL_SEASONS);
          setPhase("All");
          setSelectedPlayer(match);
        } else {
          setActiveTab("Players");
          setPlayersPrefill(initialPlayer!);
        }
      } catch {
        if (cancelled) return;
        setActiveTab("Players");
        setPlayersPrefill(initialPlayer!);
      } finally {
        if (!cancelled) setDeepLinkPending(false);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [initialPlayer, singleSeason]);

  // Mirror the view state into the URL (history.replaceState — no
  // navigation, no re-render) so any stats view is shareable: the active
  // tab, non-default season/phase, and the open player card. Defaults are
  // omitted to keep pasted links clean.
  useEffect(() => {
    if (!seasonsLoaded || deepLinkPending) return;
    const params = new URLSearchParams();
    if (activeTab !== "Leaderboard") params.set("tab", activeTab);
    if (!(seasons.length > 0 && season === seasons[0])) params.set("season", season);
    if (phase !== "All") params.set("phase", phase);
    if (selectedPlayer) params.set("player", `${selectedPlayer.summonerName}#${selectedPlayer.tag}`);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [seasonsLoaded, deepLinkPending, activeTab, season, phase, selectedPlayer, seasons]);

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
          allowAllSeasons={!singleSeason}
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
        <LeaderboardTab season={season} phase={phase} onSelectPlayer={setSelectedPlayer} teamNames={teamNames} />
      ) : activeTab === "Teams" ? (
        <TeamsTab season={season} phase={phase} teamNames={teamNames} />
      ) : activeTab === "Champions" ? (
        <ChampionsTab season={season} phase={phase} teamNames={teamNames} />
      ) : activeTab === "Records" ? (
        <RecordsTab season={season} phase={phase} teamNames={teamNames} />
      ) : activeTab === "Power Rankings" ? (
        <PowerRankingsTab season={season} phase={phase} teamNames={teamNames} />
      ) : activeTab === "Timeline" ? (
        <TimelineTab season={season} phase={phase} teamNames={teamNames} />
      ) : activeTab === "Players" ? (
        <PlayersTab
          key={playersPrefill}
          season={season}
          phase={phase}
          onSelectPlayer={setSelectedPlayer}
          initialQuery={playersPrefill}
          teamNames={teamNames}
        />
      ) : null}
    </div>
  );
}
