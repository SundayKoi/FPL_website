import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRACKETS } from "@/lib/showdown/config";
import { emptyPublic, newSeat } from "@/lib/showdown/engine";
import type { TableView } from "@/lib/showdown/server";
import ShowdownTable from "./ShowdownTable";

vi.mock("@/lib/showdown/actions", () => ({
  showdownActAction: vi.fn(),
  sitDownAction: vi.fn(),
  standUpAction: vi.fn(),
  syncShowdownTableAction: vi.fn(async () => ({ ok: true, value: view() })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      const chain = { on: () => chain, subscribe: () => chain };
      return chain;
    },
    removeChannel: vi.fn(),
  }),
}));

afterEach(cleanup);

const hole = [
  { id: "c1", name: "Doug", role: "Mid" as const, team: "Gamblers", tier: "diamond" as const, overall: 88, foil: false },
  { id: "c2", name: "Ana", role: "Support" as const, team: "Gamblers", tier: "gold" as const, overall: 71, foil: true },
];

function view(overrides: Partial<TableView> = {}): TableView {
  const state = emptyPublic();
  state.seats = [
    { ...newSeat({ seatNo: 0, discordId: "u1", username: "Alice", chips: 950, houseStack: false }), inHand: true, bet: 50 },
    { ...newSeat({ seatNo: 2, discordId: "u2", username: "Bob", chips: 975, houseStack: true }), inHand: true, bet: 25 },
  ];
  state.dealerSeat = 2;
  state.hand = {
    handNo: 4,
    dealerSeat: 2,
    street: "preflop",
    board: [],
    pot: 75,
    toAct: 0,
    currentBet: 50,
    minRaise: 50,
    pending: [0],
    deadlineAt: "2026-09-02T18:00:45.000Z",
    sawFlop: false,
    log: [],
  };
  return {
    table: { id: 3, bracket: "open", season: "S5", name: "Friday felt", code: null, status: "hand", version: 9, handNo: 4, deadlineAt: null },
    bracket: BRACKETS.open,
    state,
    myHole: hole,
    myStack: [],
    mySeat: 0,
    viewer: { discordId: "u1", username: "Alice", balance: 4000 },
    serverNow: "2026-09-02T18:00:10.000Z",
    ...overrides,
  };
}

describe("the felt", () => {
  it("shows the viewer their own cards, hides everyone else's, and offers the action bar on their turn", () => {
    render(<ShowdownTable initial={view()} options={[]} />);
    expect(screen.getByText("Friday felt")).toBeTruthy();
    expect(screen.getByText("Doug")).toBeTruthy();
    expect(screen.getAllByLabelText("Face-down card")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Fold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Raise to/ })).toBeTruthy();
    expect(screen.getByText(/Hand 4 · Preflop · pot \$75/)).toBeTruthy();
  });

  it("offers a spectator no seat and no cards, but lets a signed-in stranger sit", () => {
    render(<ShowdownTable initial={view({ mySeat: null, myHole: [], viewer: null })} options={[]} />);
    expect(screen.queryByText("Doug")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sit here" })).toBeNull();
    expect(screen.getByText(/Anyone can watch/)).toBeTruthy();
    cleanup();
    render(<ShowdownTable initial={view({ mySeat: null, myHole: [], viewer: { discordId: "u9", username: "Cy", balance: 100 } })} options={[]} />);
    expect(screen.getAllByRole("button", { name: "Sit here" })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Fold" })).toBeNull();
  });
});
