"use client";

import { useState } from "react";
import type { RoleSection, SeasonKey } from "@/lib/players/seasonData";
import { SEASON_OPTIONS } from "@/lib/players/seasonData";

type Props = { seasons: Record<SeasonKey, RoleSection[]> };

const ROLE_TONES = {
  top: "border-violet-300/50 bg-violet-300/10 text-violet-100",
  jungle: "border-emerald-300/50 bg-emerald-300/10 text-emerald-100",
  mid: "border-sky-300/50 bg-sky-300/10 text-sky-100",
  adc: "border-amber-300/50 bg-amber-300/10 text-amber-100",
  support: "border-purple-300/50 bg-purple-300/10 text-purple-100",
} as const;

export default function PlayersDirectory({ seasons }: Props) {
  const [selectedSeason, setSelectedSeason] = useState<SeasonKey>("season-5");
  const sections = seasons[selectedSeason];

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">PLAYER POOL</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Players</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              Browse each role&apos;s available players, ranked and sorted by minimum bid.
            </p>
          </div>

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
        </header>

        <section aria-label="Player directory" className="card-brand mt-10 p-4 sm:p-6">
          {sections.length === 0 ? (
            <p className="text-steel">Season 4 player data has not been added yet.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
              {sections.map((section) => (
                <section
                  key={section.key}
                  className={`overflow-hidden rounded border ${ROLE_TONES[section.key]}`}
                >
                  <h2 className="px-4 py-3 text-lg font-bold uppercase tracking-wide">{section.label}</h2>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-navy px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-steel">
                    <span>Player Name</span>
                    <span>Rank</span>
                    <span>Min</span>
                  </div>
                  <ul>
                    {section.players.map((player) => (
                      <li
                        key={player.opggUrl}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-t border-current/15 px-4 py-3 text-sm"
                      >
                        <a
                          href={player.opggUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 break-words font-semibold underline decoration-current/40 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                        >
                          {player.name}
                        </a>
                        <span className="font-medium">{player.rank}</span>
                        <span className="font-medium">{player.min}</span>
                      </li>
                    ))}
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
