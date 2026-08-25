// Head-to-head: who beats whom, across every game two players were on
// opposite sides of.
//
// Ported from the original stats site's heatmap tab, which is the one thing
// on it that no aggregate can answer — every other view tells you how well
// someone played, and this tells you who they played WELL AGAINST. Two
// players with identical averages can have a lopsided record against each
// other, and only a pairwise table shows it.

export interface HeadToHeadRow {
  match_id: string | null;
  team_name: string | null;
  summoner_name: string | null;
  win: boolean | null;
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
}

export interface HeadToHead {
  /** Every player who appeared, sorted. */
  players: string[];
  /** player -> the team they most recently appeared for. */
  teamOf: Map<string, string>;
  /** player -> opponent -> that player's record against them. */
  records: Map<string, Map<string, HeadToHeadRecord>>;
}

/**
 * Pairwise records from raw game rows.
 *
 * A game only counts when exactly two teams appear in it. Anything else is
 * a partially-ingested match, and pairing players across three "teams"
 * would invent matchups that never happened — better to drop the game than
 * to report a record nobody played.
 *
 * Every pair is recorded from both sides, so the matrix is symmetric and a
 * lookup never has to try the key both ways round.
 */
export function buildHeadToHead(rows: HeadToHeadRow[]): HeadToHead {
  const byMatch = new Map<string, HeadToHeadRow[]>();
  for (const row of rows) {
    if (!row.match_id || !row.summoner_name || !row.team_name) continue;
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row);
    byMatch.set(row.match_id, list);
  }

  const records = new Map<string, Map<string, HeadToHeadRecord>>();
  const teamOf = new Map<string, string>();

  const record = (player: string, opponent: string): HeadToHeadRecord => {
    const row = records.get(player) ?? new Map<string, HeadToHeadRecord>();
    records.set(player, row);
    const cell = row.get(opponent) ?? { wins: 0, losses: 0 };
    row.set(opponent, cell);
    return cell;
  };

  for (const game of byMatch.values()) {
    const sides = new Map<string, HeadToHeadRow[]>();
    for (const row of game) {
      const team = row.team_name!.trim();
      if (!team) continue;
      const side = sides.get(team) ?? [];
      side.push(row);
      sides.set(team, side);
    }
    if (sides.size !== 2) continue;

    const [left, right] = [...sides.values()];
    for (const row of game) teamOf.set(row.summoner_name!, row.team_name!.trim());

    for (const a of left) {
      for (const b of right) {
        const nameA = a.summoner_name!;
        const nameB = b.summoner_name!;
        // A game nobody is recorded as winning tells us nothing about
        // either player, so it is not a matchup — counting it as a loss
        // for both would understate everyone.
        if (a.win === null || b.win === null) continue;
        const cellA = record(nameA, nameB);
        const cellB = record(nameB, nameA);
        if (a.win) {
          cellA.wins += 1;
          cellB.losses += 1;
        } else {
          cellA.losses += 1;
          cellB.wins += 1;
        }
      }
    }
  }

  return {
    players: [...records.keys()].sort((a, b) => a.localeCompare(b)),
    teamOf,
    records,
  };
}

/** One player's record against one opponent, or null if they never met. */
export function recordBetween(h2h: HeadToHead, player: string, opponent: string): HeadToHeadRecord | null {
  return h2h.records.get(player)?.get(opponent) ?? null;
}

/** Win rate 0-100, or null when they have never met. */
export function winRateBetween(h2h: HeadToHead, player: string, opponent: string): number | null {
  const cell = recordBetween(h2h, player, opponent);
  if (!cell) return null;
  const played = cell.wins + cell.losses;
  return played === 0 ? null : (cell.wins / played) * 100;
}

/** A player's combined record across everyone they have faced. */
export function overallRecord(h2h: HeadToHead, player: string): HeadToHeadRecord {
  const row = h2h.records.get(player);
  if (!row) return { wins: 0, losses: 0 };
  let wins = 0;
  let losses = 0;
  for (const cell of row.values()) {
    wins += cell.wins;
    losses += cell.losses;
  }
  return { wins, losses };
}
