import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BetPanel } from "./BetPanel";
import { MIN_STAKE, MIN_STAKE_ERROR } from "@/lib/betting/stakes";

afterEach(() => {
  cleanup();
});

const teamA = { id: 1, name: "New Origins", short_code: "NOA", color: "#3b82f6", logo_url: null };
const teamB = { id: 2, name: "DoV Twisted", short_code: "DOVT", color: "#ef4444", logo_url: null };

function setup(overrides = {}) {
  const onBet = vi.fn();
  const props = {
    teamA,
    teamB,
    poolA: 4970,
    poolB: 3010,
    poolDraw: 0,
    drawEnabled: false,
    balance: 1000,
    locked: false,
    loggedIn: true,
    onBet,
    error: null,
    ...overrides,
  };
  render(<BetPanel {...props} />);
  return { onBet };
}

function buyButton() {
  return screen.getByRole("button", { name: /buy/i }) as HTMLButtonElement;
}

describe("BetPanel", () => {
  it("disables BUY when logged out", () => {
    setup({ loggedIn: false });
    expect(buyButton().disabled).toBe(true);
  });

  it("disables BUY when amount is 0", () => {
    setup();
    expect(buyButton().disabled).toBe(true);
  });

  it("disables BUY when locked", () => {
    setup({ locked: true });
    const input = screen.getByLabelText(/amount/i);
    fireEvent.change(input, { target: { value: "300" } });
    expect(buyButton().disabled).toBe(true);
  });

  it("shows a live win-payout projection that updates with the amount", () => {
    setup();
    const input = screen.getByLabelText(/amount/i);
    fireEvent.change(input, { target: { value: "1000" } });
    // default side A: profit = 1000 * 3010 / (4970 + 1000) = 504 (floored display)
    expect(screen.getByTestId("payout").textContent).toContain("504");
  });

  it("calls onBet with the selected team and amount", () => {
    const { onBet } = setup();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "300" } });
    fireEvent.click(buyButton());
    expect(onBet).toHaveBeenCalledWith(teamA.id, 300);
  });

  it("disables BUY below the minimum stake and says why", () => {
    setup();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: String(MIN_STAKE - 1) } });
    expect(buyButton().disabled).toBe(true);
    expect(screen.getByText(MIN_STAKE_ERROR)).toBeTruthy();
  });

  it("enables BUY at exactly the minimum stake, with no warning", () => {
    const { onBet } = setup();
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: String(MIN_STAKE) } });
    expect(buyButton().disabled).toBe(false);
    expect(screen.queryByText(MIN_STAKE_ERROR)).toBeNull();
    fireEvent.click(buyButton());
    expect(onBet).toHaveBeenCalledWith(teamA.id, MIN_STAKE);
  });

  it("shows the minimum next to the amount field before anything is typed", () => {
    setup();
    expect(screen.getByText(/min \$250/i)).toBeTruthy();
    expect(screen.queryByText(MIN_STAKE_ERROR)).toBeNull();
  });

  it("disables BUY when amount exceeds balance", () => {
    setup({ balance: 100 });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "500" } });
    expect(buyButton().disabled).toBe(true);
  });

  it("shows a DRAW side only when draw is enabled, and bets it as -1", () => {
    const { onBet } = setup({ drawEnabled: true, poolDraw: 1000 });
    const drawBtn = screen.getByRole("button", { name: "DRAW" });
    fireEvent.click(drawBtn);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "300" } });
    fireEvent.click(buyButton());
    expect(onBet).toHaveBeenCalledWith(-1, 300);
  });

  it("hides the DRAW side when draw is disabled", () => {
    setup();
    expect(screen.queryByRole("button", { name: "DRAW" })).toBeNull();
  });

  it("quick-stake buttons set the amount to a fraction of balance", () => {
    setup({ balance: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe("500");
    fireEvent.click(screen.getByRole("button", { name: "MAX" }));
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe("1000");
  });

  it("shows an over-balance warning without needing the error prop", () => {
    setup({ balance: 100 });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "500" } });
    expect(screen.getByText(/over balance/i)).toBeTruthy();
  });

  it("surfaces a server error message", () => {
    setup({ error: "Insufficient balance" });
    expect(screen.getByText("Insufficient balance")).toBeTruthy();
  });

  it("prompts a logged-out visitor to sign in", () => {
    setup({ loggedIn: false });
    expect(screen.getByText(/log in to bet/i)).toBeTruthy();
  });
});
