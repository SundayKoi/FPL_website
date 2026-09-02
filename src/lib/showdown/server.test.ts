import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser, rpc, fetchTable, fetchSecret, fetchInventoryByIds, fetchCardSeason, fetchCurrentWeekCards } = vi.hoisted(() => ({
  getBettingUser: vi.fn(),
  rpc: vi.fn(),
  fetchTable: vi.fn(),
  fetchSecret: vi.fn(),
  fetchInventoryByIds: vi.fn(),
  fetchCardSeason: vi.fn(),
  fetchCurrentWeekCards: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: vi.fn(() => ({ rpc })) }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason, fetchCurrentWeekCards, fetchEditionCards: vi.fn(async () => []) }));
vi.mock("@/lib/packs/queries", () => ({ fetchInventory: vi.fn(async () => []), fetchInventoryByIds }));
vi.mock("./queries", () => ({ fetchTable, fetchSecret, fetchOpenTables: vi.fn(async () => []), fetchViewerSeat: vi.fn(async () => null) }));
vi.mock("./random", () => ({ secureRand: () => 0 }));

import { emptyPublic, emptySecret } from "./engine";
import { act, createTable, sitDown, standUp } from "./server";

const member = { discordId: "u1", profileId: "p1", username: "Alice", balance: 5000, allowed: true, staff: false };
const table = (overrides = {}) => ({
  id: 3,
  bracket: "open",
  season: "S5",
  name: "Felt",
  code: null,
  status: "waiting",
  version: 4,
  handNo: 0,
  publicState: emptyPublic(),
  deadlineAt: null,
  createdBy: "u1",
  ...overrides,
});

beforeEach(() => {
  getBettingUser.mockReset();
  rpc.mockReset();
  fetchTable.mockReset();
  fetchSecret.mockReset();
  fetchInventoryByIds.mockReset();
  fetchCardSeason.mockReset();
  getBettingUser.mockResolvedValue(member);
  fetchTable.mockResolvedValue(table());
  fetchSecret.mockResolvedValue(emptySecret());
  fetchCardSeason.mockResolvedValue("S5");
  fetchCurrentWeekCards.mockResolvedValue(
    Array.from({ length: 30 }, (_, i) => ({ slug: `p${i}`, name: `P${i}`, role: "Mid", teamName: `T${i % 6}`, tier: { key: "gold" }, overall: 50 + i })),
  );
});

describe("who may play", () => {
  it("turns away the signed-out and the not-allowed before touching anything", async () => {
    getBettingUser.mockResolvedValueOnce(null);
    await expect(createTable({ bracket: "low", name: "Felt" })).rejects.toThrow(/Sign in/);
    getBettingUser.mockResolvedValueOnce({ ...member, allowed: false });
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, house: true })).rejects.toThrow(/league members/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("sitting down", () => {
  it("refuses a buy-in outside the bracket and one you cannot afford, before the RPC", async () => {
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 500, house: true })).rejects.toThrow(/1000 to 5000/);
    getBettingUser.mockResolvedValueOnce({ ...member, balance: 800 });
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, house: true })).rejects.toThrow(/that many dollars/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("wants exactly ten of your own cards from this season, under the cap", async () => {
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, cardIds: [1, 2, 3] })).rejects.toThrow(/exactly 10/);
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    fetchInventoryByIds.mockResolvedValueOnce([]);
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, cardIds: ids })).rejects.toThrow(/not yours/);
    const rows = ids.map((id) => ({ id, season: "S5", playerName: "P", role: "Mid", overall: 80, tier: "diamond", foil: false, card: { name: "P", role: "Mid", teamName: "T", tier: { key: "diamond" }, overall: 80 } }));
    fetchInventoryByIds.mockResolvedValueOnce(rows);
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, cardIds: ids })).rejects.toThrow(/totals 800 overall/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC's refusals into a sentence", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "already seated" } });
    await expect(sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, house: true })).rejects.toThrow(/already have a seat/);
  });
});

describe("practice tables", () => {
  it("only the practice bracket can be opened while the game is being tried out", async () => {
    await expect(createTable({ bracket: "open", name: "Felt" })).rejects.toThrow(/cannot be opened right now/);
  });

  it("seats a player with no dollars at all, and asks the RPC for the play chips", async () => {
    getBettingUser.mockResolvedValue({ ...member, balance: 0 });
    fetchTable.mockResolvedValue(table({ bracket: "free" }));
    rpc.mockResolvedValue({ data: 1, error: null });
    const view = await sitDown({ tableId: 3, seatNo: 0, buyIn: 1000, house: true });
    expect(rpc).toHaveBeenCalledWith("showdown_sit", expect.objectContaining({ p_user: "u1", p_buy_in: 1000, p_house: true, p_cards: [] }));
    expect(view.viewer?.balance).toBe(0);
  });
});

describe("standing up", () => {
  it("refuses when you are not at the table", async () => {
    await expect(standUp({ tableId: 3 })).rejects.toThrow(/not at this table/);
  });
});

describe("acting", () => {
  it("refuses a malformed action and a seat you do not hold", async () => {
    await expect(act({ tableId: 3, action: { type: "shove" } })).rejects.toThrow(/Bad action/);
    await expect(act({ tableId: 3, action: { type: "raise", to: -5 } })).rejects.toThrow(/Enter an amount/);
    await expect(act({ tableId: 3, action: { type: "fold" } })).rejects.toThrow(/not at this table/);
    expect(rpc).not.toHaveBeenCalled();
  });
});
