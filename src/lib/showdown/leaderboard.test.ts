import { describe, expect, it } from "vitest";
import { aggregateWeek, type HandRow } from "./leaderboard";

const hand = (id: number, pot: number, net: Record<string, number>, winners: number[], best: { seatNo: number; rank: string; label: string } | null, rake = 0): HandRow => ({
  id,
  tableId: 3,
  handNo: id,
  bracket: "free",
  playedAt: "2026-09-02T18:00:00Z",
  pot,
  rake,
  record: {
    handNo: id,
    board: [],
    pot,
    rake,
    pots: [{ amount: pot - rake, eligible: [0, 1], winners, rank: best?.label ?? null }],
    net,
    shown: {},
    best,
    players: { 0: { discordId: "u0", username: "Alice" }, 1: { discordId: "u1", username: "Bob" } },
    dealerSeat: 0,
  },
});

describe("the week's board", () => {
  it("ranks players by net, counts hands and wins, and finds the biggest pot and best hand", () => {
    const board = aggregateWeek([
      hand(1, 300, { 0: 150, 1: -150 }, [0], { seatNo: 0, rank: "trips", label: "Trips" }),
      hand(2, 900, { 0: -400, 1: 400 }, [1], { seatNo: 1, rank: "roster_flush", label: "Roster Flush" }, 27),
      hand(3, 100, { 0: 50, 1: -50 }, [0], { seatNo: 0, rank: "pair", label: "Pair" }),
    ]);
    expect(board.hands).toBe(3);
    expect(board.raked).toBe(27);
    expect(board.standings.map((s) => [s.username, s.net, s.hands, s.won, s.biggestPot])).toEqual([
      ["Bob", 200, 3, 1, 900],
      ["Alice", -200, 3, 2, 300],
    ]);
    expect(board.biggestPot).toEqual({ pot: 900, winners: ["Bob"], tableId: 3, handNo: 2 });
    expect(board.bestHand).toMatchObject({ rank: "roster_flush", username: "Bob", handNo: 2 });
  });

  it("is empty on an empty week", () => {
    expect(aggregateWeek([])).toEqual({ hands: 0, raked: 0, standings: [], biggestPot: null, bestHand: null });
  });
});
