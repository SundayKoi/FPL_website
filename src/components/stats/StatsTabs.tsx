"use client";

import { useEffect, useState } from "react";
import { fetchSeasons } from "@/lib/stats/queries";
import ChampionsTab from "./ChampionsTab";
import LeaderboardTab from "./LeaderboardTab";
import RecordsTab from "./RecordsTab";
import SeasonSelect, { ALL_SEASONS, type PhaseFilter } from "./SeasonSelect";
import TeamsTab from "./TeamsTab";

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

function PlaceholderTab({ tab }: { tab: Tab }) {
  return (
    <div className="card-brand p-8 text-center">
      <p className="type-display text-2xl">{tab}</p>
      <p className="mt-2 text-steel">Coming soon in this build.</p>
    </div>
  );
}

export default function StatsTabs() {
  const [activeTab, setActiveTab] = useState<Tab>("Leaderboard");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState<string>(ALL_SEASONS);
  const [phase, setPhase] = useState<PhaseFilter>("All");
  const [seasonsLoaded, setSeasonsLoaded] = useState(false);

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
              onClick={() => setActiveTab(tab)}
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
      ) : activeTab === "Leaderboard" ? (
        <LeaderboardTab season={season} phase={phase} />
      ) : activeTab === "Teams" ? (
        <TeamsTab season={season} phase={phase} />
      ) : activeTab === "Champions" ? (
        <ChampionsTab season={season} phase={phase} />
      ) : activeTab === "Records" ? (
        <RecordsTab season={season} phase={phase} />
      ) : (
        <PlaceholderTab tab={activeTab} />
      )}
    </div>
  );
}
