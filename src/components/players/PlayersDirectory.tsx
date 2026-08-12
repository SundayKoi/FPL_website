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

type DirectorySection = "player-list" | "free-agency";

type Props = {
  seasons: Record<SeasonKey, RoleSection[]>;
  canonicalPlayers?: PlayerPoolRow[];
  freeAgencyCaptains?: FreeAgencyCaptain[];
  isAdmin?: boolean;
  initialAvgBids?: Record<string, number>;
  freeAgencyPlayers?: { name: string; avgBid: number | null }[];
  emptyStateMessages?: Partial<Record<SeasonKey, string>>;
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
  canonicalPlayers = [],
  freeAgencyCaptains = FREE_AGENCY_CAPTAINS,
  isAdmin = false,
  initialAvgBids = {},
  freeAgencyPlayers,
  emptyStateMessages = {},
}: Props) {
  const [selectedSeason, setSelectedSeason] = useState<SeasonKey>("season-5");
  const [selectedSection, setSelectedSection] = useState<DirectorySection>("player-list");
  const [selectedCaptain, setSelectedCaptain] = useState("");
  const [selectedBidBoardPlayer, setSelectedBidBoardPlayer] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [avgBids, setAvgBids] = useState(initialAvgBids);
  const [savingPlayer, setSavingPlayer] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [poolEditMode, setPoolEditMode] = useState(false);
  const [poolPlayers, setPoolPlayers] = useState(canonicalPlayers);
  const sections = seasons[selectedSeason] ?? [];
  const emptyStateMessage =
    emptyStateMessages[selectedSeason] ?? "No player data is available for this season.";
  const hasPlayers = sections.some((section) => section.players.length > 0);
  const isFreeAgency = selectedSection === "free-agency";
  const adminPlayers = poolPlayers
    .filter((player) => player.season_key === selectedSeason)
    .sort((left, right) => left.display_name.localeCompare(right.display_name));
  const displaySections = isFreeAgency
    ? sections.map((section) => ({
        ...section,
        players: [...section.players].sort(
          (left, right) =>
            (avgBidFor(right.name) ?? -1) - (avgBidFor(left.name) ?? -1),
        ),
      }))
    : sections;

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
            {isAdmin && isFreeAgency ? (
              <button
                type="button"
                onClick={() => setEditMode((editing) => !editing)}
                className="rounded border border-gold px-3 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
            {saveError && isAdmin && isFreeAgency ? <p className="mb-4 text-sm text-red-400">{saveError}</p> : null}
            <div className="grid gap-5 sm:grid-cols-2 xl:min-w-[1500px] xl:grid-cols-5">
              {displaySections.map((section) => (
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
                            {isFreeAgency && isAdmin && editMode ? (
                              <input
                                aria-label={`Avg Bid for ${player.name}`}
                                type="number"
                                min="0"
                                step="1"
                                defaultValue={avgBidFor(player.name) ?? ""}
                                disabled={savingPlayer === (freeAgencyPlayer?.name ?? player.name)}
                                onBlur={(event) => void saveAvgBid(freeAgencyPlayer?.name ?? player.name, event.target.value)}
                                className="w-16 rounded border border-line bg-navy px-1 text-right font-medium text-white focus:border-gold focus:outline-none"
                              />
                            ) : isFreeAgency ? (avgBidFor(player.name) ?? "—") : player.min}
                          </span>
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
                            className={`bg-panel px-2 py-3 text-left transition-colors hover:bg-gold/20 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                              isHighlighted
                                ? "font-extrabold text-white [box-shadow:inset_0_0_0_2px_var(--color-gold)]"
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
            <button type="button" onClick={() => setPoolEditMode((editing) => !editing)} className="rounded border border-gold px-3 py-2 text-sm font-semibold text-gold">
              {poolEditMode ? "Done Editing Players" : "Edit Player Pool"}
            </button>
            {poolEditMode ? <PlayerPoolAdmin seasonKey={selectedSeason} players={adminPlayers} onPlayersChange={setPoolPlayers} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
