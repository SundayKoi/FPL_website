type PlayerRankSource = {
  rank: string | null;
  canonical_player_id?: string | null;
  display_name: string;
};

type PlayerOpggSource = {
  opgg_url: string | null;
  canonical_player_id?: string | null;
  display_name: string;
};

export type CanonicalPlayerMetadata = {
  id: string;
  display_name: string;
  rank: string | null;
  opgg_url?: string | null;
};

function normalizePlayerName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

type ParsedRank = {
  priority: number;
  division: number;
};

function parseRank(rank: string | null): ParsedRank {
  if (!rank) return { priority: 0, division: Number.POSITIVE_INFINITY };

  const match = rank.trim().toUpperCase().match(/^([MDE])(\d+)$/);
  if (!match) return { priority: 0, division: Number.POSITIVE_INFINITY };

  const tierPriority = { M: 3, D: 2, E: 1 } as const;
  return {
    priority: tierPriority[match[1] as keyof typeof tierPriority],
    division: Number(match[2]),
  };
}

export function comparePlayerRanks(left: string | null, right: string | null) {
  const leftRank = parseRank(left);
  const rightRank = parseRank(right);

  if (leftRank.priority !== rightRank.priority) {
    return rightRank.priority - leftRank.priority;
  }

  if (leftRank.division !== rightRank.division) {
    return leftRank.division - rightRank.division;
  }

  return 0;
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

export function resolvePlayerOpggUrl(
  player: PlayerOpggSource,
  canonicalPlayers: CanonicalPlayerMetadata[],
) {
  if (player.opgg_url) return player.opgg_url;

  const byId = player.canonical_player_id
    ? canonicalPlayers.find((candidate) => candidate.id === player.canonical_player_id)
    : undefined;
  if (byId?.opgg_url) return byId.opgg_url;

  const normalizedName = normalizePlayerName(player.display_name);
  return canonicalPlayers.find((candidate) => normalizePlayerName(candidate.display_name) === normalizedName)?.opgg_url ?? null;
}
