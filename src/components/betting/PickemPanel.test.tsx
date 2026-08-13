import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PickemData } from "@/lib/betting/types";
import { PickemPanel } from "./PickemPanel";

const { placePickemCard } = vi.hoisted(() => ({ placePickemCard: vi.fn() }));
vi.mock("@/lib/betting/actions", () => ({ placePickemCard }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const team = (id: number, code: string) => ({ id, name: code, short_code: code, color: "#123456", logo_url: null });

const pickem: PickemData = {
  id: 9,
  title: "Friday Night Pick'em",
  status: "OPEN",
  lock_at: new Date(Date.now() + 3_600_000).toISOString(),
  carryover: 1500,
  pool: 1800,
  cards: 2,
  legs: [
    { market_id: 1, title: "A vs B", team_a: team(11, "AAA"), team_b: team(12, "BBB"), status: "OPEN", winning_team_id: null },
    { market_id: 2, title: "C vs D", team_a: team(13, "CCC"), team_b: team(14, "DDD"), status: "OPEN", winning_team_id: null },
  ],
  my_card: null,
};

function lockInButton() {
  return screen.getByRole("button", { name: /lock it in/i }) as HTMLButtonElement;
}

describe("PickemPanel", () => {
  it("shows the jackpot pool", () => {
    render(<PickemPanel pickem={pickem} balance={1000} loggedIn />);
    expect(screen.getByTestId("pickem-panel")).toBeTruthy();
    expect(screen.getByText(/1,500 jackpot/)).toBeTruthy();
    expect(screen.getByText(/\$1,800/)).toBeTruthy();
  });

  it("disables submit until every leg is picked, then submits picks + amount", async () => {
    placePickemCard.mockResolvedValue({ ok: true, balance: 700 });
    render(<PickemPanel pickem={pickem} balance={1000} loggedIn />);

    expect(lockInButton().disabled).toBe(true); // no picks yet, no amount

    fireEvent.click(screen.getByRole("button", { name: "AAA" }));
    expect(lockInButton().disabled).toBe(true); // only one of two legs picked

    fireEvent.click(screen.getByRole("button", { name: "DDD" }));
    expect(lockInButton().disabled).toBe(true); // both legs picked but amount still 0

    fireEvent.change(screen.getByLabelText(/card amount/i), { target: { value: "300" } });
    expect(lockInButton().disabled).toBe(false);

    fireEvent.click(lockInButton());
    await waitFor(() => expect(placePickemCard).toHaveBeenCalledWith(9, { 1: 11, 2: 14 }, 300));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByText(/card placed/i)).toBeTruthy();
  });

  it("surfaces a server error without refreshing", async () => {
    placePickemCard.mockResolvedValue({ ok: false, error: "Insufficient balance." });
    render(<PickemPanel pickem={pickem} balance={1000} loggedIn />);

    fireEvent.click(screen.getByRole("button", { name: "AAA" }));
    fireEvent.click(screen.getByRole("button", { name: "DDD" }));
    fireEvent.change(screen.getByLabelText(/card amount/i), { target: { value: "300" } });
    fireEvent.click(lockInButton());

    await waitFor(() => expect(screen.getByText("Insufficient balance.")).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("prompts a logged-out visitor to log in instead of showing the amount input", () => {
    render(<PickemPanel pickem={pickem} balance={0} loggedIn={false} />);
    expect(screen.getByText(/log in to play/i)).toBeTruthy();
    expect(screen.queryByLabelText(/card amount/i)).toBeNull();
  });

  it("shows the existing card's stake and disables editing once locked, without a submit button", () => {
    const lockedPickem: PickemData = {
      ...pickem,
      status: "LOCKED",
      my_card: { amount: 300, picks: { 1: 11, 2: 14 }, correct: null, payout: null, settled: false },
    };
    render(<PickemPanel pickem={lockedPickem} balance={1000} loggedIn />);

    expect(screen.getByTestId("pickem-mycard").textContent).toContain("$300");
    expect(screen.queryByLabelText(/card amount/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /lock it in|update card/i })).toBeNull();
    expect((screen.getByRole("button", { name: "AAA" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the resolved card's result — a perfect card's payout", () => {
    const resolvedPickem: PickemData = {
      ...pickem,
      status: "RESOLVED",
      legs: pickem.legs.map((l) => ({ ...l, status: "RESOLVED", winning_team_id: l.team_a.id })),
      my_card: { amount: 300, picks: { 1: 11, 2: 13 }, correct: 2, payout: 1800, settled: true },
    };
    render(<PickemPanel pickem={resolvedPickem} balance={1000} loggedIn />);
    const banner = screen.getByTestId("pickem-mycard").textContent ?? "";
    expect(banner).toMatch(/perfect card/i);
    expect(banner).toContain("$1,800");
  });

  it("shows the resolved card's result — an imperfect card's near-miss line", () => {
    const resolvedPickem: PickemData = {
      ...pickem,
      status: "RESOLVED",
      legs: pickem.legs.map((l) => ({ ...l, status: "RESOLVED", winning_team_id: l.team_a.id })),
      my_card: { amount: 300, picks: { 1: 11, 2: 14 }, correct: 1, payout: 0, settled: true },
    };
    render(<PickemPanel pickem={resolvedPickem} balance={1000} loggedIn />);
    expect(screen.getByTestId("pickem-mycard").textContent).toContain("1/2");
  });
});
