import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
vi.mock("./wallet", () => ({ getBettingUser }));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc })),
}));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { placeBet, cashoutBet } from "./actions";

const ALLOWED_USER = {
  discordId: "42",
  profileId: "p1",
  username: "Zed",
  balance: 1000,
  allowed: true,
  staff: false,
};

beforeEach(() => {
  getBettingUser.mockReset().mockResolvedValue(ALLOWED_USER);
  rpc.mockReset().mockResolvedValue({ data: 800, error: null });
  revalidatePath.mockReset();
});

describe("placeBet", () => {
  it("rejects a signed-out caller without touching the RPC", async () => {
    getBettingUser.mockResolvedValue(null);

    const result = await placeBet(5, 1, 100);

    expect(result).toEqual({ ok: false, error: "Sign in to place a bet." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a caller without betting access", async () => {
    getBettingUser.mockResolvedValue({ ...ALLOWED_USER, allowed: false });

    const result = await placeBet(5, 1, 100);

    expect(result).toEqual({ ok: false, error: "FPL Better members only." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount without touching the RPC", async () => {
    const result = await placeBet(5, 1, 0);

    expect(result).toEqual({ ok: false, error: "Enter a valid bet amount." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("re-derives the discord id server-side and calls place_bet", async () => {
    const result = await placeBet(5, 1, 100);

    expect(rpc).toHaveBeenCalledWith("place_bet", {
      p_user: "42",
      p_market: 5,
      p_team: 1,
      p_amount: 100,
    });
    expect(result).toEqual({ ok: true, balance: 800 });
    expect(revalidatePath).toHaveBeenCalledWith("/betting");
  });

  it("accepts -1 as the draw team sentinel", async () => {
    await placeBet(5, -1, 100);
    expect(rpc).toHaveBeenCalledWith("place_bet", {
      p_user: "42",
      p_market: 5,
      p_team: -1,
      p_amount: 100,
    });
  });

  it.each([
    ["insufficient balance", "Insufficient balance."],
    ["amount must be positive", "Enter a valid bet amount."],
    ["market 5 locked", "This market has locked — betting is closed."],
    ["market 5 not open (status=LOCKED)", "This market isn't open for betting."],
    ["this market has no draw option", "This market has no draw option."],
    ["team 3 not in market 5", "Invalid team selection."],
    ["unknown market 5", "Market not found."],
    ["unknown user 42", "Account not found — try signing in again."],
    ["something totally unexpected", "Something went wrong placing that bet."],
  ])("maps the RPC error %j to a friendly message", async (rpcMessage, friendly) => {
    rpc.mockResolvedValue({ data: null, error: { message: rpcMessage } });

    const result = await placeBet(5, 1, 100);

    expect(result).toEqual({ ok: false, error: friendly });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("cashoutBet", () => {
  it("rejects a signed-out caller without touching the RPC", async () => {
    getBettingUser.mockResolvedValue(null);

    const result = await cashoutBet(9);

    expect(result).toEqual({ ok: false, error: "Sign in to cash out." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a caller without betting access", async () => {
    getBettingUser.mockResolvedValue({ ...ALLOWED_USER, allowed: false });

    const result = await cashoutBet(9);

    expect(result).toEqual({ ok: false, error: "FPL Better members only." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("re-derives the discord id server-side and calls cashout_bet", async () => {
    const result = await cashoutBet(9);

    expect(rpc).toHaveBeenCalledWith("cashout_bet", { p_user: "42", p_bet: 9 });
    expect(result).toEqual({ ok: true, balance: 800 });
    expect(revalidatePath).toHaveBeenCalledWith("/betting");
  });

  it.each([
    ["unknown or settled bet 9", "That bet no longer exists or has already settled."],
    ["not your bet", "That isn't your bet."],
    ["market is locked — no cashout", "Betting has locked — cashout is no longer available."],
    ["unknown user 42", "Account not found — try signing in again."],
    ["something totally unexpected", "Something went wrong cashing out."],
  ])("maps the RPC error %j to a friendly message", async (rpcMessage, friendly) => {
    rpc.mockResolvedValue({ data: null, error: { message: rpcMessage } });

    const result = await cashoutBet(9);

    expect(result).toEqual({ ok: false, error: friendly });
  });
});
