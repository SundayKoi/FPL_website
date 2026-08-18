"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PlayerPoolAdmin, { type PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { findFreeAgencyPlayer, isPlayerAvailableToCaptain, normalizePlayerName } from "@/lib/players/freeAgency";
import { FREE_AGENCY_CAPTAINS, type FreeAgencyCaptain } from "@/lib/players/freeAgencyData";
import {
  FREE_AGENCY_BID_BOARD,
  FREE_AGENCY_BID_BOARD_HEADERS,
} from "@/lib/players/freeAgencyBidBoard";
import type { RoleSection, SeasonKey } from "@/lib/players/seasonData";
import { SEASON_OPTIONS } from "@/lib/players/seasonData";
import LeaguePageToggle from "@/components/LeaguePageToggle";

type DirectorySection = "player-list" | "free-agency";
type SortOption = "name" | "rank" | "value";

type Props = {
  seasons: Record<SeasonKey, RoleSection[]>;
  canonicalPlayers?: PlayerPoolRow[];
  poolSeasonKey?: SeasonKey;
  freeAgencyCaptains?: FreeAgencyCaptain[];
  isAdmin?: boolean;
  isOwner?: boolean;
  initialAvgBids?: Record<string, number>;
  freeAgencyPlayers?: { name: string; avgBid: number | null }[];
  emptyStateMessages?: Partial<Record<SeasonKey, string>>;
  pageView?: "premier" | "academy";
  showFreeAgency?: boolean;
  showMinSort?: boolean;
};

const ROLE_TONES = {
  top: "border-violet-300/50 bg-violet-300/10 text-violet-100",
  jungle: "border-mint/50 bg-mint/10 text-mint",
  mid: "border-sky-300/50 bg-sky-300/10 text-sky-100",
  adc: "border-amber-300/50 bg-amber-300/10 text-amber-100",
  support: "border-purple-300/50 bg-purple-300/10 text-purple-100",
} as const;

export function mergeScopedPlayerPoolRows(
  currentRows: PlayerPoolRow[],
  scopedRows: PlayerPoolRow[],
  scopedSeasonKey: SeasonKey,
) {
  return [...currentRows.filter((row) => row.season_key !== scopedSeasonKey), ...scopedRows];
}

export default function PlayersDirectory({
  seasons,
  canonicalPlayers = [],
  poolSeasonKey,
  freeAgencyCaptains = FREE_AGENCY_CAPTAINS,
  isAdmin = false,
  isOwner = false,
  initialAvgBids = {},
  freeAgencyPlayers,
  emptyStateMessages = {},
  pageView = "premier",
  showFreeAgency = true,
  showMinSort = true,
}: Props) {
  const [selectedSeason, setSelectedSeason] = useState<SeasonKey>("season-5");
  const [selectedSection, setSelectedSection] = useState<DirectorySection>("player-list");
  const [sortOption, setSortOption] = useState<SortOption>(showMinSort ? "value" : "rank");
  const [selectedCaptain, setSelectedCaptain] = useState("");
  const [selectedBidBoardPlayer, setSelectedBidBoardPlayer] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [avgBids, setAvgBids] = useState(initialAvgBids);
  const [savingPlayer, setSavingPlayer] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [poolEditMode, setPoolEditMode] = useState(false);
  const [poolPlayers, setPoolPlayers] = useState(canonicalPlayers);
  const activePoolSeasonKey = poolSeasonKey ?? selectedSeason;
  const sections = seasons[selectedSeason] ?? [];
  const emptyStateMessage =
    emptyStateMessages[selectedSeason] ?? "No player data is available for this season.";
  const hasPlayers = sections.some((section) => section.players.length > 0);
  const isFreeAgency = showFreeAgency && selectedSection === "free-agency";
  const hasValueColumn = isFreeAgency || showMinSort;
  const adminPlayers = poolPlayers
    .filter((player) => player.season_key === activePoolSeasonKey)
    .sort((left, right) => left.display_name.localeCompare(right.display_name));
  const handlePoolPlayersChange = (updatedScopedPlayers: PlayerPoolRow[]) => {
    setPoolPlayers((currentPlayers) =>
      mergeScopedPlayerPoolRows(currentPlayers, updatedScopedPlayers, activePoolSeasonKey),
    );
  };
  const displaySections = sections.map((section) => ({
    ...section,
    players: [...section.players].sort((left, right) => {
      if (!isFreeAgency) {
        const leftIsCaptain = /^captain:/i.test(left.name);
        const rightIsCaptain = /^captain:/i.test(right.name);
        if (leftIsCaptain !== rightIsCaptain) return leftIsCaptain ? -1 : 1;
      }
      if (sortOption === "name") return left.name.localeCompare(right.name);
      if (sortOption === "rank") return rankValue(right.rank) - rankValue(left.rank) || left.name.localeCompare(right.name);
      const rightValue = isFreeAgency ? avgBidFor(right.name) : right.min;
      const leftValue = isFreeAgency ? avgBidFor(left.name) : left.min;
      return (rightValue ?? -1) - (leftValue ?? -1) || left.name.localeCompare(right.name);
    }),
  }));

  function rankValue(rank: string) {
    const normalized = rank.trim().toUpperCase();
    const tier = normalized.startsWith("M") ? 5 : normalized.startsWith("D") ? 4 : normalized.startsWith("E") ? 3 : normalized.startsWith("P") ? 2 : normalized.startsWith("G") ? 1 : 0;
    const division = Number(normalized.replace(/^[A-Z]+/, "")) || 0;
    return tier * 100 + division;
  }

  const handleSectionChange = (value: DirectorySection) => {
    setSelectedSection(value);

    if (value === "player-list") {
      setSelectedCaptain("");
      setEditMode(false);
      setSelectedBidBoardPlayer(null);
    }
  };

  function avgBidFor(playerName: string) {
    const imported = findFreeAgencyPlayer(playerName, freeAgencyCaptains, freeAgencyPlayers);
    return avgBids[imported?.name ?? playerName] ?? imported?.avgBid ?? null;
  }

  const saveAvgBid = async (playerName: string, value: string) => {
    const avgBid = Number(value);
    if (!Number.isInteger(avgBid) || avgBid < 0) {
      setSaveError("Avg Bid must be a non-negative integer.");
      return;
    }
    setSavingPlayer(playerName);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase.from("free_agency_avg_bids").upsert({ player_name: playerName, avg_bid: avgBid });
    setSavingPlayer(null);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setAvgBids((current) => ({ ...current, [playerName]: avgBid }));
  };

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-6 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="label-dash">PLAYER POOL</span>
            <h1 className="type-display mt-3 text-5xl sm:text-6xl">Players</h1>
            <hr className="accent-rule mt-5 w-48 sm:w-64" />
            <p className="mt-4 max-w-2xl text-lg leading-8 text-steel">
              Browse each role&apos;s available players, ranked and sorted by minimum bid.
            </p>
          </div>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
            <LeaguePageToggle page="players" view={pageView} />
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label htmlFor="player-season" className="label-dash">
                Season
              </label>
              <select
                id="player-season"
                value={selectedSeason}
                onChange={(event) => setSelectedSeason(event.target.value as SeasonKey)}
                className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                {SEASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label htmlFor="player-sort" className="label-dash">
                Sort by
              </label>
              <select
                id="player-sort"
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                {showMinSort ? <option value="value">{isFreeAgency ? "Avg Bid" : "Min"}</option> : null}
                <option value="name">Name</option>
                <option value="rank">Rank</option>
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
                className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                <option value="player-list">Player List</option>
                {showFreeAgency ? <option value="free-agency">Free Agency</option> : null}
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
                  className="w-full rounded border border-line bg-navy px-3 py-2 text-sm font-semibold text-white sm:w-44 focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
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
            {isOwner && isFreeAgency ? (
              <button
                type="button"
                onClick={() => setEditMode((editing) => !editing)}
                className="rounded border border-coral px-3 py-2 text-sm font-semibold text-coral transition hover:bg-coral/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                {editMode ? "Done Editing" : "Edit Avg Bids"}
              </button>
            ) : null}
          </div>
        </header>

        <section aria-label="Player directory" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
          {!hasPlayers ? (
            <p className="text-steel">{emptyStateMessage}</p>
          ) : (
            <>
            {saveError && isOwner && isFreeAgency ? <p className="mb-4 text-sm text-red-400">{saveError}</p> : null}
            <div className="grid gap-5 sm:grid-cols-2 xl:min-w-[1500px] xl:grid-cols-5">
              {displaySections.map((section) => (
                <section
                  key={section.key}
                  className={`overflow-hidden rounded border ${ROLE_TONES[section.key]}`}
                >
                  <h2 className="px-4 py-3 text-lg font-bold uppercase tracking-wide">{section.label}</h2>
                  <div className={`grid ${hasValueColumn ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} gap-3 bg-navy px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-steel`}>
                    <span>Player Name</span>
                    <span>Rank</span>
                    {hasValueColumn ? <span>{isFreeAgency ? "Avg Bid" : "Min"}</span> : null}
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
                          key={player.name}
                          data-available={isAvailable ? "true" : "false"}
                          className={`grid ${hasValueColumn ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} gap-3 border-t border-current/15 px-4 py-3 text-sm transition-opacity ${
                            isAvailable ? "opacity-100" : "opacity-50"
                          }`}
                        >
                          {player.opggUrl ? <a
                            href={player.opggUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`min-w-0 break-words whitespace-nowrap underline decoration-current/40 underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${
                              isFreeAgency && selectedCaptain && isAvailable
                                ? "font-extrabold text-white decoration-white/70"
                                : "font-semibold"
                            }`}
                          >
                            {player.name}
                          </a> : <span className="min-w-0 break-words whitespace-nowrap font-semibold">{player.name}</span>}
                          <span className="font-medium">{player.rank}</span>
                          {hasValueColumn ? <span className="font-medium">
                            {isFreeAgency && isOwner && editMode ? (
                              <input
                                aria-label={`Avg Bid for ${player.name}`}
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={avgBidFor(player.name) ?? ""}
                                disabled={savingPlayer === (freeAgencyPlayer?.name ?? player.name)}
                                onBlur={(event) => void saveAvgBid(freeAgencyPlayer?.name ?? player.name, event.target.value)}
                                className="w-16 rounded border border-line bg-navy px-1 text-right font-medium text-white focus:border-coral focus:outline-none"
                              />
                            ) : isFreeAgency ? (avgBidFor(player.name) ?? "—") : player.min}
                          </span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {isFreeAgency ? (
              <section aria-label="Free Agency bid board" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
                <h2 className="type-display text-2xl text-white">Bid Board</h2>
                <div className="mt-4 min-w-[1100px]">
                  <div className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(12,minmax(5.5rem,1fr))] gap-px bg-line text-center text-[0.6rem] font-bold uppercase tracking-[0.08em] text-steel">
                    <span className="bg-navy px-2 py-2 text-left">Captain</span>
                    {FREE_AGENCY_BID_BOARD_HEADERS.map((header, index) => (
                      <span key={`${header}-${index}`} className="bg-navy px-2 py-2">{header}</span>
                    ))}
                    {FREE_AGENCY_BID_BOARD.flatMap((row) => [
                      <span key={`${row.captain}-name`} className="bg-panel px-2 py-3 text-left font-semibold text-white">{row.captain}</span>,
                      ...row.bids.map((player, index) => {
                        // Voided bid (player removed from the league): keep
                        // the slot as an empty cell so later bids stay in
                        // their point-value columns.
                        if (player === null) {
                          return (
                            <span
                              key={`${row.captain}-${index}`}
                              aria-label="Voided bid"
                              className="bg-panel/60 px-2 py-3"
                            />
                          );
                        }
                        const isHighlighted =
                          selectedBidBoardPlayer !== null &&
                          normalizePlayerName(player) === normalizePlayerName(selectedBidBoardPlayer);
                        return (
                          <button
                            key={`${row.captain}-${index}`}
                            type="button"
                            aria-pressed={isHighlighted}
                            onClick={() =>
                              setSelectedBidBoardPlayer((current) =>
                                current !== null && normalizePlayerName(current) === normalizePlayerName(player)
                                  ? null
                                  : player,
                              )
                            }
                            className={`bg-panel px-2 py-3 text-left transition-colors hover:bg-coral/20 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                              isHighlighted
                                ? "font-extrabold text-white [box-shadow:inset_0_0_0_2px_var(--color-coral)]"
                                : "font-medium text-steel"
                            }`}
                          >
                            {player}
                          </button>
                        );
                      }),
                    ])}
                  </div>
                </div>
              </section>
            ) : null}
            </>
          )}
        </section>

        {isAdmin && !isFreeAgency ? (
          <>
            <button type="button" onClick={() => setPoolEditMode((editing) => !editing)} className="rounded border border-coral px-3 py-2 text-sm font-semibold text-coral">
              {poolEditMode ? "Done Editing Players" : "Edit Player Pool"}
            </button>
            {poolEditMode ? <PlayerPoolAdmin seasonKey={activePoolSeasonKey} players={adminPlayers} onPlayersChange={handlePoolPlayersChange} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
