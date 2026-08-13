import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BidControls from "./BidControls";

const rpc = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

const team = { id: "team-1", name: "Team 1", points_remaining: 30 } as never;
const lot = { id: "lot-1", current_bid: 10, status: "open", leading_team_id: "team-2" } as never;
const player = { id: "player-1", display_name: "Player 1", role: "top" } as never;

afterEach(() => {
  cleanup();
});

describe("BidControls", () => {
  it("submits the custom bid amount when the bid form is submitted", async () => {
    render(<BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />);

    const input = screen.getByDisplayValue("11");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("place_bid", {
      p_lot_id: "lot-1",
      p_amount: 25,
    }));
  });

  it("keeps non-integer characters out of the bid amount", () => {
    render(<BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />);

    const input = screen.getByDisplayValue("11");
    fireEvent.change(input, { target: { value: "12abc.5" } });

    expect((input as HTMLInputElement).value).toBe("125");
  });
});

describe("BidControls reprice race guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the typed amount when someone else raises on the same lot", () => {
    const { rerender } = render(
      <BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />,
    );

    const input = screen.getByDisplayValue("11") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "25" } });

    rerender(
      <BidControls
        team={team}
        lot={{ ...(lot as object), current_bid: 40 } as never}
        lotPlayer={player}
        players={[]}
        onError={vi.fn()}
      />,
    );

    // the field must NOT be rewritten to 41 under the user's cursor
    expect(input.value).toBe("25");
    // and the submit button is blocked because 25 is now too low
    expect((screen.getByRole("button", { name: /^bid$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disarms the quick-bid button briefly after a reprice, then re-arms", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />,
    );

    rerender(
      <BidControls
        team={team}
        lot={{ ...(lot as object), current_bid: 20 } as never}
        lotPlayer={player}
        players={[]}
        onError={vi.fn()}
      />,
    );

    const quickButton = screen.getByRole("button", { name: /bid 21/i }) as HTMLButtonElement;
    expect(quickButton.disabled).toBe(true);
    expect(screen.getByText(/price moved/i)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect((screen.getByRole("button", { name: /bid 21/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("still resets the field when a NEW lot opens", () => {
    const { rerender } = render(
      <BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />,
    );
    fireEvent.change(screen.getByDisplayValue("11"), { target: { value: "25" } });

    rerender(
      <BidControls
        team={team}
        lot={{ ...(lot as object), id: "lot-2", current_bid: 5 } as never}
        lotPlayer={player}
        players={[]}
        onError={vi.fn()}
      />,
    );

    expect((screen.getByDisplayValue("6") as HTMLInputElement).value).toBe("6");
  });
});
