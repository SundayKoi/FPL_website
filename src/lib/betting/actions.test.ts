import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
vi.mock("./wallet", () => ({ getBettingUser }));

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc })),
}));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { placeBet, cashoutBet, placePickemCard, suggestProp } from "./actions";

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

describe("placePickemCard", () => {
  it("rejects a signed-out caller without touching the RPC", async () => {
    getBettingUser.mockResolvedValue(null);

    const result = await placePickemCard(7, { 1: 11, 2: 14 }, 300);

    expect(result).toEqual({ ok: false, error: "Sign in to play the pick'em." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a caller without betting access", async () => {
    getBettingUser.mockResolvedValue({ ...ALLOWED_USER, allowed: false });

    const result = await placePickemCard(7, { 1: 11, 2: 14 }, 300);

    expect(result).toEqual({ ok: false, error: "FPL Better members only." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-positive amount without touching the RPC", async () => {
    const result = await placePickemCard(7, { 1: 11, 2: 14 }, 0);

    expect(result).toEqual({ ok: false, error: "Enter a valid card amount." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an empty picks map without touching the RPC", async () => {
    const result = await placePickemCard(7, {}, 300);

    expect(result).toEqual({ ok: false, error: "Pick a team for every series." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("re-derives the discord id server-side and calls place_pickem_card", async () => {
    const result = await placePickemCard(7, { 1: 11, 2: 14 }, 300);

    expect(rpc).toHaveBeenCalledWith("place_pickem_card", {
      p_user: "42",
      p_pickem: 7,
      p_picks: { "1": 11, "2": 14 },
      p_amount: 300,
    });
    expect(result).toEqual({ ok: true, balance: 800 });
    expect(revalidatePath).toHaveBeenCalledWith("/betting");
  });

  it.each([
    ["insufficient balance", "Insufficient balance."],
    ["amount must be positive", "Enter a valid card amount."],
    ["picks must choose a team for every series", "Pick a team for every series."],
    ["pick-em is locked", "This pick'em has locked — entries are closed."],
    ["unknown pick-em 7", "Pick'em not found."],
    ["unknown user 42", "Account not found — try signing in again."],
    ["something totally unexpected", "Something went wrong placing that card."],
  ])("maps the RPC error %j to a friendly message", async (rpcMessage, friendly) => {
    rpc.mockResolvedValue({ data: null, error: { message: rpcMessage } });

    const result = await placePickemCard(7, { 1: 11, 2: 14 }, 300);

    expect(result).toEqual({ ok: false, error: friendly });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("suggestProp", () => {
  it("rejects a signed-out caller without touching the RPC", async () => {
    getBettingUser.mockResolvedValue(null);

    const result = await suggestProp("How much will Chime go for?", "Over 500", "Under 500");

    expect(result).toEqual({ ok: false, error: "Sign in to suggest a bet." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a too-short question before any RPC", async () => {
    const result = await suggestProp("Hi?", "Yes", "No");

    expect(result).toEqual({ ok: false, error: "Question must be 5–200 characters." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects identical sides before any RPC", async () => {
    const result = await suggestProp("Will it happen tonight?", "Yes", "yes");

    expect(result).toEqual({ ok: false, error: "The two sides must be different." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("files the suggestion with trimmed args and revalidates", async () => {
    rpc.mockResolvedValue({ data: 7, error: null });

    const result = await suggestProp("  How much will Chime go for?  ", " Over 500 ", "Under 500", "  ");

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("suggest_prop", {
      p_user: "42",
      p_question: "How much will Chime go for?",
      p_side_a: "Over 500",
      p_side_b: "Under 500",
      p_note: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/betting");
  });

  it("maps the pending-cap error to friendly copy", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "you already have 3 pending suggestions — wait for a review" } });

    const result = await suggestProp("Will it happen tonight?", "Yes", "No");

    expect(result).toEqual({ ok: false, error: "You already have 3 suggestions waiting for review." });
  });
});
