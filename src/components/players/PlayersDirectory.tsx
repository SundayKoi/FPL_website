"use client";

import Link from "next/link";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BidBoard from "@/components/players/BidBoard";
import PlayerPoolAdmin, { type PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { findFreeAgencyPlayer, isPlayerAvailableToCaptain } from "@/lib/players/freeAgency";
import { FREE_AGENCY_CAPTAINS, type FreeAgencyCaptain } from "@/lib/players/freeAgencyData";
import type { RoleSection, SeasonKey } from "@/lib/players/seasonData";
import { SEASON_OPTIONS } from "@/lib/players/seasonData";
import { rankValue } from "@/lib/players/roleDisplay";
import type { LeagueKey } from "@/lib/players/identity";
import type {
  PlayerIdentityLinkRow,
  VerifiedProfileOption,
} from "@/components/players/PlayerIdentityAdmin";
import PlayerRosterClaim from "@/components/teams/PlayerRosterClaim";
import type { RosterClaimTarget } from "@/lib/teams/rosterClaims";
import LeaguePageShell, { LeagueEmptyState, LeagueToolbar } from "@/components/league/LeaguePageShell";
import type { LeagueView } from "@/lib/league/context";
import styles from "./PlayersDirectory.module.css";

type DirectorySection = "player-list" | "free-agency";
type SortOption = "name" | "rank" | "value";

type Props = {
  league?: LeagueView;
  /** Link each name to its profile on this site. The academy has no stats
   *  profiles yet, so its directory keeps names on op.gg. */
  profileLinks?: boolean;
  seasons: Record<SeasonKey, RoleSection[]>;
  canonicalPlayers?: PlayerPoolRow[];
  poolSeasonKey?: SeasonKey;
  freeAgencyCaptains?: FreeAgencyCaptain[];
  isAdmin?: boolean;
  isOwner?: boolean;
  initialAvgBids?: Record<string, number>;
  freeAgencyPlayers?: { name: string; avgBid: number | null }[];
  emptyStateMessages?: Partial<Record<SeasonKey, string>>;
  showFreeAgency?: boolean;
  showMinSort?: boolean;
  identityLeague?: LeagueKey;
  identitySeason?: string;
  identityLinks?: PlayerIdentityLinkRow[];
  identityProfiles?: VerifiedProfileOption[];
  playerClaims?: Record<string, RosterClaimTarget>;
};

export function mergeScopedPlayerPoolRows(
  currentRows: PlayerPoolRow[],
  scopedRows: PlayerPoolRow[],
  scopedSeasonKey: SeasonKey,
) {
  return [...currentRows.filter((row) => row.season_key !== scopedSeasonKey), ...scopedRows];
}

/** The pool labels captains "Captain: Name"; the profile route wants the name. */
function displayName(name: string): string {
  return name.replace(/^captain:\s*/i, "").trim();
}

/** The player's page on this site. The route resolves a display name
 *  against the stats identities, so a name with no games yet lands on a
 *  "no stats" page that points back here rather than a 404. */
function profileHref(name: string): string {
  return `/players/${encodeURIComponent(displayName(name))}`;
}

export default function PlayersDirectory({
  league = "premier",
  seasons,
  profileLinks = true,
  canonicalPlayers = [],
  poolSeasonKey,
  freeAgencyCaptains = FREE_AGENCY_CAPTAINS,
  isAdmin = false,
  isOwner = false,
  initialAvgBids = {},
  freeAgencyPlayers,
  emptyStateMessages = {},
  showFreeAgency = true,
  showMinSort = true,
  identityLeague,
  identitySeason,
  identityLinks = [],
  identityProfiles = [],
  playerClaims = {},
}: Props) {
  const [selectedSeason, setSelectedSeason] = useState<SeasonKey>("season-5");
  const [selectedSection, setSelectedSection] = useState<DirectorySection>("player-list");
  const [sortOption, setSortOption] = useState<SortOption>(showMinSort ? "value" : "rank");
  const [selectedCaptain, setSelectedCaptain] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
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
  const hasClaimColumn = !isFreeAgency && Object.keys(playerClaims).length > 0;
  const rowColumns = hasValueColumn
    ? hasClaimColumn
      ? "grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      : "grid-cols-[minmax(0,1fr)_auto_auto]"
    : hasClaimColumn
      ? "grid-cols-[minmax(0,1fr)_auto_auto]"
      : "grid-cols-[minmax(0,1fr)_auto]";
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
  const filteredSections = displaySections
    .filter((section) => !selectedRole || section.key === selectedRole)
    .map((section) => ({
      ...section,
      players: section.players.filter((player) =>
        displayName(player.name).toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase()),
      ),
    }))
    .filter((section) => section.players.length > 0);
  const resultCount = filteredSections.reduce((count, section) => count + section.players.length, 0);
  const hasDirectoryFilters = Boolean(searchQuery || selectedRole || selectedCaptain);
  const seasonLabel = league === "academy"
    ? "Season 1"
    : SEASON_OPTIONS.find((option) => option.value === selectedSeason)?.label ?? selectedSeason;

  const clearDirectoryFilters = () => {
    setSearchQuery("");
    setSelectedRole("");
    setSelectedCaptain("");
  };


  const handleSectionChange = (value: DirectorySection) => {
    setSelectedSection(value);

    if (value === "player-list") {
      setSelectedCaptain("");
      setEditMode(false);
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
    <LeaguePageShell
      league={league}
      title="Players"
      season={seasonLabel}
      activeSection="players"
      description="Browse player pools by role, search names, and compare the available ranks and values."
    >
      <LeagueToolbar label="Player filters" className={styles.filters}>
        <label className={styles.searchFilter} htmlFor="player-search">
          <span>Search players</span>
          <input
            id="player-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name"
            className="input-brand px-3 py-2 text-sm"
          />
        </label>

        {league !== "academy" ? (
          <label className={styles.filter} htmlFor="player-season">
            <span>Season</span>
            <select id="player-season" value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value as SeasonKey)} className="input-brand px-3 py-2 text-sm">
              {SEASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ) : null}

        <label className={styles.filter} htmlFor="player-role">
          <span>Role</span>
          <select id="player-role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)} className="input-brand px-3 py-2 text-sm">
            <option value="">All roles</option>
            {sections.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}
          </select>
        </label>

        <label className={styles.filter} htmlFor="player-sort">
          <span>Sort by</span>
          <select id="player-sort" value={sortOption} onChange={(event) => setSortOption(event.target.value as SortOption)} className="input-brand px-3 py-2 text-sm">
            {showMinSort ? <option value="value">{isFreeAgency ? "Avg Bid" : "Min"}</option> : null}
            <option value="name">Name</option>
            <option value="rank">Rank</option>
          </select>
        </label>

        <label className={styles.filter} htmlFor="player-section">
            <span>Section</span>
          <select id="player-section" value={selectedSection} onChange={(event) => handleSectionChange(event.target.value as DirectorySection)} className="input-brand px-3 py-2 text-sm">
            <option value="player-list">Player list</option>
            {showFreeAgency ? <option value="free-agency">Free Agency</option> : null}
          </select>
        </label>

        {isFreeAgency ? (
          <label className={styles.filter} htmlFor="player-captain">
            <span>Captain</span>
            <select id="player-captain" value={selectedCaptain} onChange={(event) => setSelectedCaptain(event.target.value)} className="input-brand px-3 py-2 text-sm">
              <option value="">No captain</option>
              {freeAgencyCaptains.map((captain) => <option key={captain.name} value={captain.name}>{captain.name}</option>)}
            </select>
          </label>
        ) : null}

        {isOwner && isFreeAgency ? (
          <button type="button" onClick={() => setEditMode((editing) => !editing)} className={styles.actionButton}>
            {editMode ? "Done Editing" : "Edit Avg Bids"}
          </button>
        ) : null}
      </LeagueToolbar>

      {!hasPlayers ? (
        <LeagueEmptyState title="Player data unavailable">
          {emptyStateMessage}
        </LeagueEmptyState>
      ) : (
        <section className={styles.results} aria-label="Player directory">
          <div className={styles.resultSummary}>
            <p aria-live="polite">{resultCount} {resultCount === 1 ? "player" : "players"}</p>
            {hasDirectoryFilters ? <button type="button" onClick={clearDirectoryFilters} className={styles.clearButton}>Clear filters</button> : null}
          </div>
          {saveError && isOwner && isFreeAgency ? <p className={styles.saveError} role="alert">{saveError}</p> : null}

          {resultCount === 0 ? (
            <LeagueEmptyState title="No players match these filters">
              Try a different name or role.
              <button type="button" onClick={clearDirectoryFilters} className={styles.inlineClear}>Clear filters</button>
            </LeagueEmptyState>
          ) : (
            <div className={styles.playerPanels}>
              {filteredSections.map((section) => (
                <section key={section.key} data-role={section.key} className={styles.rolePanel} aria-labelledby={`player-role-${section.key}`}>
                  <h2 id={`player-role-${section.key}`}>{section.label}</h2>
                  <div className={`grid ${rowColumns} gap-2 px-3 py-2 text-[0.64rem] font-bold uppercase tracking-wide text-muted`}>
                    <span>Player</span><span>Rank</span>
                  {hasValueColumn ? <span>{isFreeAgency ? "Avg Bid" : "Min"}</span> : null}
                    {hasClaimColumn ? <span>Claim</span> : null}
                  </div>
                  <ul>
                    {section.players.map((player) => {
                      const isAvailable = !isFreeAgency || isPlayerAvailableToCaptain(player.name, selectedCaptain || null, freeAgencyCaptains);
                      const freeAgencyPlayer = isFreeAgency ? findFreeAgencyPlayer(player.name, freeAgencyCaptains) : undefined;
                      const nameClass = `min-w-0 break-words underline decoration-current/40 underline-offset-4 hover:text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${isFreeAgency && selectedCaptain && isAvailable ? "font-extrabold" : "font-semibold"}`;
                      return (
                        <li key={player.name} data-available={isAvailable ? "true" : "false"} className={`grid ${rowColumns} gap-2 border-t border-border-subtle px-3 py-2.5 text-sm ${isAvailable ? "" : "opacity-50"}`}>
                          {profileLinks ? (
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <Link href={profileHref(player.name)} data-player="" title={`${displayName(player.name)}'s profile`} className={nameClass}>{player.name}</Link>
                              {player.opggUrl ? <a href={player.opggUrl} target="_blank" rel="noopener noreferrer" aria-label={`${player.name} on op.gg`} className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-action-text">op.gg ↗</a> : null}
                            </span>
                          ) : player.opggUrl ? (
                            <a href={player.opggUrl} target="_blank" rel="noopener noreferrer" data-player="" className={nameClass}>{player.name}</a>
                          ) : (
                            <span data-player="" className="min-w-0 break-words font-semibold">{player.name}</span>
                          )}
                          <span className="font-medium">{player.rank}</span>
                          {hasValueColumn ? (
                            <span className="font-medium">
                              {isFreeAgency && isOwner && editMode ? (
                                <input aria-label={`Avg Bid for ${player.name}`} type="number" min="0" step="1" defaultValue={avgBidFor(player.name) ?? ""} disabled={savingPlayer === (freeAgencyPlayer?.name ?? player.name)} onBlur={(event) => void saveAvgBid(freeAgencyPlayer?.name ?? player.name, event.target.value)} className="w-16 rounded border border-border-strong bg-surface px-1 text-right font-medium text-content focus:border-action-text focus:outline-none" />
                              ) : isFreeAgency ? (avgBidFor(player.name) ?? "—") : player.min}
                            </span>
                          ) : null}
                          {hasClaimColumn ? (player.playerPoolId && playerClaims[player.playerPoolId] ? <PlayerRosterClaim {...playerClaims[player.playerPoolId]} /> : <span aria-hidden="true" />) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {isFreeAgency ? <BidBoard /> : null}
        </section>
      )}

      {isAdmin && !isFreeAgency ? (
        <details className={styles.management}>
          <summary>Player pool management</summary>
          <div className={styles.managementControls}>
            <button type="button" onClick={() => setPoolEditMode((editing) => !editing)} className={styles.actionButton}>
              {poolEditMode ? "Done Editing Players" : "Edit Player Pool"}
            </button>
            {poolEditMode ? <PlayerPoolAdmin seasonKey={activePoolSeasonKey} players={adminPlayers} onPlayersChange={handlePoolPlayersChange} identityLeague={identityLeague} identitySeason={identitySeason} identityLinks={identityLinks} identityProfiles={identityProfiles} /> : null}
          </div>
        </details>
      ) : null}
    </LeaguePageShell>
  );
}
