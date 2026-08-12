import {
  FREE_AGENCY_PLAYER_SUMMARIES,
  type FreeAgencyCaptain,
  type FreeAgencyPlayer,
} from "./freeAgencyData";

const PLAYER_NAME_ALIASES: Record<string, string> = {
  "flyinq squirtle": "flying squirtle",
  "conguitos0": "conguitos",
  begfourmercy: "beg",
  "08 mitsu eclipse": "chime",
};

export function normalizePlayerName(name: string): string {
  const normalized = name
    .normalize("NFKC")
    .trim()
    .replace(/^captain:\s*/i, "")
    .split("#")[0]
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

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

  const captain = captains.find((candidate) => candidate.name === captainName);

  if (!captain) {
    return false;
  }

  const normalizedName = normalizePlayerName(playerName);

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
