// The week's board, from the hand history. Pure: rows in, standings out.
// Practice hands count in play chips and say so; the board is bragging
// rights, not a payout.

import { HAND_RANKS, type HandRankKey } from "./hands";
import type { HandResult } from "./engine";

export interface HandRow {
  id: number;
  tableId: number;
  handNo: number;
  bracket: string;
  playedAt: string;
  pot: number;
  rake: number;
  record: HandResult;
}

export interface PlayerStanding {
  discordId: string;
  username: string;
  net: number;
  hands: number;
  won: number;
  biggestPot: number;
}

export interface WeekBoard {
  hands: number;
  raked: number;
  standings: PlayerStanding[];
  biggestPot: { pot: number; winners: string[]; tableId: number; handNo: number } | null;
  bestHand: { rank: HandRankKey; label: string; username: string; tableId: number; handNo: number } | null;
}

const rankOrder = (key: string) => HAND_RANKS.find((rank) => rank.key === key)?.order ?? -1;

export function aggregateWeek(rows: HandRow[]): WeekBoard {
  const byPlayer = new Map<string, PlayerStanding>();
  let biggestPot: WeekBoard["biggestPot"] = null;
  let bestHand: WeekBoard["bestHand"] = null;
  let raked = 0;

  for (const row of rows) {
    const record = row.record;
    raked += row.rake;
    const winners = new Set(record.pots.flatMap((pot) => pot.winners));
    for (const [seatNo, who] of Object.entries(record.players ?? {})) {
      const standing = byPlayer.get(who.discordId) ?? { discordId: who.discordId, username: who.username, net: 0, hands: 0, won: 0, biggestPot: 0 };
      standing.username = who.username;
      standing.net += record.net[seatNo] ?? 0;
      standing.hands += 1;
      if (winners.has(Number(seatNo))) {
        standing.won += 1;
        standing.biggestPot = Math.max(standing.biggestPot, row.pot);
      }
      byPlayer.set(who.discordId, standing);
    }
    if (!biggestPot || row.pot > biggestPot.pot) {
      biggestPot = {
        pot: row.pot,
        winners: [...winners].map((seatNo) => record.players?.[seatNo]?.username ?? `seat ${seatNo + 1}`),
        tableId: row.tableId,
        handNo: row.handNo,
      };
    }
    if (record.best && (!bestHand || rankOrder(record.best.rank) > rankOrder(bestHand.rank))) {
      bestHand = {
        rank: record.best.rank as HandRankKey,
        label: record.best.label,
        username: record.players?.[record.best.seatNo]?.username ?? `seat ${record.best.seatNo + 1}`,
        tableId: row.tableId,
        handNo: row.handNo,
      };
    }
  }

  const standings = [...byPlayer.values()].sort((a, b) => b.net - a.net || b.won - a.won || a.username.localeCompare(b.username));
  return { hands: rows.length, raked, standings, biggestPot, bestHand };
}
