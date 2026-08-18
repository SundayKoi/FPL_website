import {
  FREE_AGENCY_CAPTAIN_NAMES,
  FREE_AGENCY_PLAYER_SUMMARIES,
  type FreeAgencyCaptain,
  type FreeAgencyPlayer,
} from "./freeAgencyData";
import { PLAYER_NAME_ALIASES, normalizeBasePlayerName } from "./normalize";
import { PLAYER_SEASONS, type RoleSection, type SeasonKey } from "./seasonData";
import { ROLE_LABELS, ROLE_ORDER } from "@/lib/draft/types";


export type CanonicalPlayerPoolRow = {
  season_key: string;
  display_name: string;
  role: RoleSection["key"];
  rank: string | null;
  opgg_url: string | null;
};

export function normalizePlayerName(name: string): string {
  const normalized = normalizeBasePlayerName(name);
  return PLAYER_NAME_ALIASES[normalized] ?? normalized;
}

export function isPlayerAvailableToCaptain(
  playerName: string,
  captainName: string | null,
  captains: FreeAgencyCaptain[],
): boolean {
  if (captainName === null) {
    return true;
  }

  const normalizedName = normalizePlayerName(playerName);
  if (FREE_AGENCY_CAPTAIN_NAMES.some((name) => normalizePlayerName(name) === normalizedName)) {
    return false;
  }

  const captain = captains.find((candidate) => candidate.name === captainName);

  if (!captain) {
    return false;
  }

  return captain.players.some((player) => normalizePlayerName(player.name) === normalizedName);
}

export function findFreeAgencyPlayer(
  playerName: string,
  captains: FreeAgencyCaptain[],
  playerSummaries: FreeAgencyPlayer[] = FREE_AGENCY_PLAYER_SUMMARIES,
): FreeAgencyPlayer | undefined {
  const normalizedName = normalizePlayerName(playerName);

  const summaryMatch = playerSummaries.find(
    (player) => normalizePlayerName(player.name) === normalizedName,
  );

  if (summaryMatch) {
    return summaryMatch;
  }

  return captains
    .flatMap((captain) => captain.players)
    .find((player) => normalizePlayerName(player.name) === normalizedName);
}

export function adaptCanonicalPlayerPool(
  rows: CanonicalPlayerPoolRow[],
  fallbackSeasons: Record<SeasonKey, RoleSection[]> = PLAYER_SEASONS,
): Record<SeasonKey, RoleSection[]> {
  const emptySeasons = Object.fromEntries(
    (Object.keys(fallbackSeasons) as SeasonKey[]).map((seasonKey) => [seasonKey, createEmptySections()]),
  ) as Record<SeasonKey, RoleSection[]>;

  const minLookup = new Map<string, number>();
  for (const section of fallbackSeasons["season-5"] ?? []) {
    for (const player of section.players) {
      minLookup.set(normalizePlayerName(player.name), player.min);
    }
  }

  for (const row of [...rows].sort((left, right) => left.display_name.localeCompare(right.display_name))) {
    if (!(row.season_key in emptySeasons)) {
      continue;
    }

    const seasonKey = row.season_key as SeasonKey;
    const section = emptySeasons[seasonKey].find((candidate) => candidate.key === row.role);
    if (!section) {
      continue;
    }

    section.players.push({
      name: row.display_name,
      rank: row.rank ?? "—",
      min: minLookup.get(normalizePlayerName(row.display_name)) ?? 0,
      opggUrl: row.opgg_url ?? "#",
    });
  }

  return emptySeasons;
}

function createEmptySections(): RoleSection[] {
  return ROLE_ORDER.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
    players: [],
  }));
}
