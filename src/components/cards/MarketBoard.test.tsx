import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketBoard, { byPrice, expiryLabel, type BoardCopy, type BoardListing } from "./MarketBoard";

const { buyListing } = vi.hoisted(() => ({ buyListing: vi.fn() }));
vi.mock("@/lib/market/actions", () => ({ buyListing }));

const { fetchInventoryCardAction } = vi.hoisted(() => ({ fetchInventoryCardAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ fetchInventoryCardAction }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ME = "me-1";

function copy(over: Partial<BoardCopy> = {}): BoardCopy {
  return {
    id: 11,
    playerName: "Doug",
    overall: 88,
    tier: "master",
    foil: false,
    foilType: null,
    signed: false,
    altArt: false,
    editionWeek: "2026-08-24",
    ...over,
  };
}

function listing(over: Partial<BoardListing> = {}): BoardListing {
  return {
    id: 1,
    sellerDiscordId: "seller-1",
    sellerUsername: "Nina",
    ask: 500,
    note: null,
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    stale: false,
    copy: copy(),
    ...over,
  };
}

beforeEach(() => {
  buyListing.mockReset().mockResolvedValue({ ok: true });
  fetchInventoryCardAction.mockReset().mockResolvedValue({ ok: false, error: "no" });
  refresh.mockReset();
});

afterEach(cleanup);

describe("expiryLabel", () => {
  it("rounds up, so a listing with hours left does not read as gone", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(expiryLabel("2026-09-01T11:00:00Z", now)).toBe("last day");
    expect(expiryLabel("2026-09-04T12:00:00Z", now)).toBe("4 days left");
  });

  it("says expired for anything already past", () => {
    expect(expiryLabel("2026-08-01T00:00:00Z", new Date("2026-09-01T00:00:00Z"))).toBe("expired");
  });
});

describe("byPrice", () => {
  it("sorts cheapest first — a board is read for the price", () => {
    const rows = [listing({ id: 1, ask: 900 }), listing({ id: 2, ask: 100 })].sort(byPrice);
    expect(rows.map((row) => row.id)).toEqual([2, 1]);
  });
});

describe("MarketBoard", () => {
  it("says the board is empty rather than rendering an empty list", () => {
    render(<MarketBoard listings={[]} viewerDiscordId={ME} />);
    expect(screen.getByTestId("market-board").textContent).toMatch(/nothing is for sale/i);
  });

  it("shows the card, the seller and the price", () => {
    render(<MarketBoard listings={[listing()]} viewerDiscordId={ME} />);
    const row = screen.getByTestId("market-listing");
    expect(within(row).getByText("Doug")).toBeTruthy();
    expect(row.textContent).toContain("Nina");
    expect(row.textContent).toContain("$500");
  });

  it("makes you confirm before the money leaves", async () => {
    render(<MarketBoard listings={[listing()]} viewerDiscordId={ME} />);

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));

    // One click arms; nothing has been spent yet.
    expect(buyListing).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("button", { name: "Confirm $500" });
    fireEvent.click(confirm);
    await waitFor(() => expect(buyListing).toHaveBeenCalledWith(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders the action's refusal instead of pre-empting it", async () => {
    buyListing.mockResolvedValue({ ok: false, error: "You don't have enough to cover that." });
    render(<MarketBoard listings={[listing()]} viewerDiscordId={ME} />);

    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm $500" }));

    expect(await screen.findByText("You don't have enough to cover that.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables Buy on a listing whose copy has moved on, and says why", () => {
    render(<MarketBoard listings={[listing({ stale: true })]} viewerDiscordId={ME} />);

    const row = screen.getByTestId("market-listing");
    expect(row.textContent).toMatch(/card has moved on/i);
    expect(within(row).getByRole("button", { name: "Buy" }).hasAttribute("disabled")).toBe(true);
  });

  it("will not sell you your own listing", () => {
    render(<MarketBoard listings={[listing({ sellerDiscordId: ME })]} viewerDiscordId={ME} />);

    const button = screen.getByRole("button", { name: "Yours" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("fetches the frozen card only when someone opens it", async () => {
    render(<MarketBoard listings={[listing()]} viewerDiscordId={ME} />);
    expect(fetchInventoryCardAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /view doug/i }));

    await waitFor(() => expect(fetchInventoryCardAction).toHaveBeenCalledWith(11));
  });
});
