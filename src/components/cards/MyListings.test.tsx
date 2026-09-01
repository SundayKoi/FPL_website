import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyListings, { byOpenness, statusLabel, type MyListing } from "./MyListings";

const { cancelListing } = vi.hoisted(() => ({ cancelListing: vi.fn() }));
vi.mock("@/lib/market/actions", () => ({ cancelListing }));

// MyListings renders MarketBoard's helpers, and that module reaches the trade
// actions for its card preview — a "use server" module that cannot be loaded
// into a jsdom test.
vi.mock("@/lib/trades/actions", () => ({ fetchInventoryCardAction: vi.fn() }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function row(over: Partial<MyListing> = {}): MyListing {
  return {
    id: 1,
    ask: 500,
    note: null,
    status: "open",
    expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    buyerUsername: null,
    stale: false,
    copy: {
      id: 11,
      playerName: "Doug",
      overall: 88,
      tier: "master",
      foil: false,
      foilType: null,
      signed: false,
      altArt: false,
      editionWeek: "2026-08-24",
    },
    ...over,
  };
}

beforeEach(() => {
  cancelListing.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

afterEach(cleanup);

describe("statusLabel", () => {
  it("names the buyer on a sale — that is what the panel is read for", () => {
    expect(statusLabel(row({ status: "sold", buyerUsername: "Nina" }))).toBe("Sold to Nina");
    expect(statusLabel(row({ status: "cancelled" }))).toBe("Cancelled");
    expect(statusLabel(row({ status: "expired" }))).toBe("Expired");
    expect(statusLabel(row())).toBe("3 days left");
  });
});

describe("byOpenness", () => {
  it("puts what still needs a decision above the receipts", () => {
    const rows = [row({ id: 1, status: "sold" }), row({ id: 2, status: "open" })].sort(byOpenness);
    expect(rows.map((listing) => listing.id)).toEqual([2, 1]);
  });
});

describe("MyListings", () => {
  it("says the shelf is empty rather than rendering nothing", () => {
    render(<MyListings listings={[]} />);
    expect(screen.getByTestId("my-listings").textContent).toMatch(/nothing on the market/i);
  });

  it("cancels an open listing, and gives a closed one no button at all", async () => {
    render(<MyListings listings={[row(), row({ id: 2, status: "sold", buyerUsername: "Nina" })]} />);

    expect(screen.getAllByRole("button", { name: "Cancel" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(cancelListing).toHaveBeenCalledWith(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders the action's refusal inline", async () => {
    cancelListing.mockResolvedValue({ ok: false, error: "That listing is already closed." });
    render(<MyListings listings={[row()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("That listing is already closed.")).toBeTruthy();
  });

  it("flags a listing whose copy has moved on", () => {
    render(<MyListings listings={[row({ stale: true })]} />);
    expect(screen.getByText(/card has moved on/i)).toBeTruthy();
  });
});
