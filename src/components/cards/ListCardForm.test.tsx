import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ListCardForm, { parseAsk, unavailableReason } from "./ListCardForm";
import type { TradeCardOption } from "./TradeBuilder";

const { createListing } = vi.hoisted(() => ({ createListing: vi.fn() }));
vi.mock("@/lib/market/actions", () => ({ createListing }));

const { fetchInventoryCardAction } = vi.hoisted(() => ({ fetchInventoryCardAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ fetchInventoryCardAction }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function option(id: number, playerName: string, over: Partial<TradeCardOption> = {}): TradeCardOption {
  return {
    id,
    slug: playerName.toLowerCase(),
    playerName,
    role: "Mid",
    overall: 80,
    tier: "gold",
    foil: false,
    signed: false,
    altArt: false,
    editionWeek: "2026-08-24",
    card: null,
    ...over,
  };
}

beforeEach(() => {
  createListing.mockReset().mockResolvedValue({ ok: true, id: 1 });
  fetchInventoryCardAction.mockReset().mockResolvedValue({ ok: false, error: "no" });
  refresh.mockReset();
});

afterEach(cleanup);

describe("parseAsk", () => {
  it("takes digits and nothing else — a price is not a sentence", () => {
    expect(parseAsk(" 500 ")).toBe(500);
    expect(parseAsk("")).toBeNull();
    expect(parseAsk("5.5")).toBeNull();
    expect(parseAsk("-5")).toBeNull();
    expect(parseAsk("lots")).toBeNull();
  });
});

describe("unavailableReason", () => {
  it("names the reason so a greyed row explains itself", () => {
    expect(unavailableReason(1, new Set([1]), new Set())).toBe("On expedition");
    expect(unavailableReason(1, new Set(), new Set([1]))).toBe("Already listed");
    expect(unavailableReason(1)).toBe("");
  });
});

describe("ListCardForm", () => {
  it("tells an empty shelf what to do instead of showing a dead form", () => {
    render(<ListCardForm inventory={[]} />);
    expect(screen.getByTestId("list-card-form").textContent).toMatch(/open a pack/i);
  });

  it("lists the chosen copy at the entered price", async () => {
    render(<ListCardForm inventory={[option(11, "Doug")]} />);

    fireEvent.click(screen.getByRole("radio", { name: /doug/i }));
    fireEvent.change(screen.getByLabelText("Asking price"), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Listing note"), { target: { value: "will take offers" } });
    fireEvent.click(screen.getByRole("button", { name: "List it" }));

    await waitFor(() =>
      expect(createListing).toHaveBeenCalledWith({ inventoryId: 11, ask: 500, note: "will take offers" }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("refuses a price that isn't a whole number, without a round trip", async () => {
    render(<ListCardForm inventory={[option(11, "Doug")]} />);

    fireEvent.click(screen.getByRole("radio", { name: /doug/i }));
    fireEvent.change(screen.getByLabelText("Asking price"), { target: { value: "5.5" } });
    fireEvent.click(screen.getByRole("button", { name: "List it" }));

    expect(await screen.findByText(/whole number/i)).toBeTruthy();
    expect(createListing).not.toHaveBeenCalled();
  });

  it("shows a copy that cannot be sold rather than hiding it, disabled with the reason", () => {
    // A card missing from the list looks like a bug; a card greyed with an
    // explanation next to it is an answer.
    render(<ListCardForm inventory={[option(11, "Doug")]} deployedIds={new Set([11])} />);

    const radio = screen.getByRole("radio", { name: /doug/i });
    expect(radio.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("On expedition")).toBeTruthy();
  });

  it("renders the action's refusal inline", async () => {
    createListing.mockResolvedValue({ ok: false, error: "That card is already on the market." });
    render(<ListCardForm inventory={[option(11, "Doug")]} />);

    fireEvent.click(screen.getByRole("radio", { name: /doug/i }));
    fireEvent.change(screen.getByLabelText("Asking price"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "List it" }));

    expect(await screen.findByText("That card is already on the market.")).toBeTruthy();
  });
});
