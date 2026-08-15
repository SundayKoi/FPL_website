type PlayerRankSource = {
  rank: string | null;
  canonical_player_id?: string | null;
  display_name: string;
};

export type CanonicalPlayerMetadata = {
  id: string;
  display_name: string;
  rank: string | null;
};

function normalizePlayerName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function resolvePlayerRank(
  player: PlayerRankSource,
  canonicalPlayers: CanonicalPlayerMetadata[],
) {
  if (player.rank) return player.rank;

  const byId = player.canonical_player_id
    ? canonicalPlayers.find((candidate) => candidate.id === player.canonical_player_id)
    : undefined;
  if (byId?.rank) return byId.rank;

  const normalizedName = normalizePlayerName(player.display_name);
  return canonicalPlayers.find((candidate) => normalizePlayerName(candidate.display_name) === normalizedName)?.rank ?? null;
}
