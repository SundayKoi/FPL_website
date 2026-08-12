"use client";

import { useState } from "react";
import { findFreeAgencyPlayer, isPlayerAvailableToCaptain } from "@/lib/players/freeAgency";
import { FREE_AGENCY_CAPTAINS, type FreeAgencyCaptain } from "@/lib/players/freeAgencyData";
import type { RoleSection, SeasonKey } from "@/lib/players/seasonData";
import { SEASON_OPTIONS } from "@/lib/players/seasonData";

type DirectorySection = "player-list" | "free-agency";

type Props = {
  seasons: Record<SeasonKey, RoleSection[]>;
  freeAgencyCaptains?: FreeAgencyCaptain[];
};

const ROLE_TONES = {
  top: "border-violet-300/50 bg-violet-300/10 text-violet-100",
  jungle: "border-emerald-300/50 bg-emerald-300/10 text-emerald-100",
  mid: "border-sky-300/50 bg-sky-300/10 text-sky-100",
  adc: "border-amber-300/50 bg-amber-300/10 text-amber-100",
  support: "border-purple-300/50 bg-purple-300/10 text-purple-100",
} as const;

export default function PlayersDirectory({
  seasons,
  freeAgencyCaptains = FREE_AGENCY_CAPTAINS,
}: Props) {
  const [selectedSeason, setSelectedSeason] = useState<SeasonKey>("season-5");
  const [selectedSection, setSelectedSection] = useState<DirectorySection>("player-list");
  const [selectedCaptain, setSelectedCaptain] = useState("");
  const sections = seasons[selectedSeason];
  const isFreeAgency = selectedSection === "free-agency";

  const handleSectionChange = (value: DirectorySection) => {
    setSelectedSection(value);

    if (value === "player-list") {
      setSelectedCaptain("");
    }
  };

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">PLAYER POOL</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Players</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              Browse each role&apos;s available players, ranked and sorted by minimum bid.
            </p>
          </div>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label htmlFor="player-season" className="label-dash">
                Season
              </label>
              <select
                id="player-season"
                value={selectedSeason}
                onChange={(event) => setSelectedSeason(event.target.value as SeasonKey)}
                className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {SEASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label htmlFor="player-section" className="label-dash">
                Section
              </label>
              <select
                id="player-section"
                value={selectedSection}
                onChange={(event) => handleSectionChange(event.target.value as DirectorySection)}
                className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                <option value="player-list">Player List</option>
                <option value="free-agency">Free Agency</option>
              </select>
            </div>

            {isFreeAgency ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                <label htmlFor="player-captain" className="label-dash">
                  Captain
                </label>
                <select
                  id="player-captain"
                  value={selectedCaptain}
                  onChange={(event) => setSelectedCaptain(event.target.value)}
                  className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <option value="">No captain</option>
                  {freeAgencyCaptains.map((captain) => (
                    <option key={captain.name} value={captain.name}>
                      {captain.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </header>

        <section aria-label="Player directory" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
          {sections.length === 0 ? (
            <p className="text-steel">Season 4 player data has not been added yet.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:min-w-[1500px] xl:grid-cols-5">
              {sections.map((section) => (
                <section
                  key={section.key}
                  className={`overflow-hidden rounded border ${ROLE_TONES[section.key]}`}
                >
                  <h2 className="px-4 py-3 text-lg font-bold uppercase tracking-wide">{section.label}</h2>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-navy px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-steel">
                    <span>Player Name</span>
                    <span>Rank</span>
                    <span>{isFreeAgency ? "Avg Bid" : "Min"}</span>
                  </div>
                  <ul>
                    {section.players.map((player) => {
                      const isAvailable =
                        !isFreeAgency ||
                        isPlayerAvailableToCaptain(
                          player.name,
                          selectedCaptain ? selectedCaptain : null,
                          freeAgencyCaptains,
                        );
                      const freeAgencyPlayer = isFreeAgency
                        ? findFreeAgencyPlayer(player.name, freeAgencyCaptains)
                        : undefined;

                      return (
                        <li
                          key={player.opggUrl}
                          data-available={isAvailable ? "true" : "false"}
                          className={`grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-current/15 px-4 py-3 text-sm transition-opacity ${
                            isAvailable ? "opacity-100" : "opacity-50"
                          }`}
                        >
                          <a
                            href={player.opggUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`min-w-0 break-words whitespace-nowrap underline decoration-current/40 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                              isFreeAgency && selectedCaptain && isAvailable
                                ? "font-extrabold text-white decoration-white/70"
                                : "font-semibold"
                            }`}
                          >
                            {player.name}
                          </a>
                          <span className="font-medium">{player.rank}</span>
                          <span className="font-medium">
                            {isFreeAgency ? (freeAgencyPlayer?.avgBid ?? "—") : player.min}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
