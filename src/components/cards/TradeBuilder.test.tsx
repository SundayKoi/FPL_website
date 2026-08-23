import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TradeBuilder, { type TradeCardOption } from "./TradeBuilder";

const { createTradeAction, fetchPartnerInventoryAction } = vi.hoisted(() => ({
  createTradeAction: vi.fn(),
  fetchPartnerInventoryAction: vi.fn(),
}));
vi.mock("@/lib/trades/actions", () => ({ createTradeAction, fetchPartnerInventoryAction }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ME = "me-1";
const THEM = "them-1";

function option(id: number, playerName: string, overall: number, extra: Partial<TradeCardOption> = {}): TradeCardOption {
  return {
    id,
    slug: playerName.toLowerCase(),
    playerName,
    role: "Mid",
    overall,
    tier: "gold",
    foil: false,
    signed: false,
    editionWeek: "2026-08-17",
    ...extra,
  };
}

const mine = [option(1, "Canny", 77), option(2, "Bronzey", 51, { foil: true })];
const theirs = [option(9, "Chaseworthy", 92, { signed: true })];

const collectors = [
  { discordId: THEM, username: "Rivalry", cards: 12 },
  { discordId: ME, username: "Mine", cards: 4 },
];

function renderBuilder() {
  return render(
    <TradeBuilder collectors={collectors} myInventory={mine} viewerDiscordId={ME} league="premier" />,
  );
}

/** Pick the partner and let the (mocked) inventory action settle. */
async function pickPartner(discordId = THEM) {
  await act(async () => {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: discordId } });
  });
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

beforeEach(() => {
  fetchPartnerInventoryAction.mockReset().mockResolvedValue({ ok: true, cards: theirs });
  createTradeAction.mockReset().mockResolvedValue({ ok: true, id: 42 });
  refresh.mockReset();
});

afterEach(cleanup);

describe("TradeBuilder", () => {
  it("lists everyone but the viewer, with their card counts", () => {
    renderBuilder();

    expect(screen.getByRole("option", { name: "Rivalry — 12 cards" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Mine/ })).toBeNull();
    expect(screen.getByText("Pick someone to see what they have.")).toBeTruthy();
  });

  it("loads the partner's collection once one is picked", async () => {
    renderBuilder();
    await pickPartner();

    expect(fetchPartnerInventoryAction).toHaveBeenCalledWith(THEM, "premier");
    // Both shelves are on the table now.
    expect(screen.getByLabelText(/^Canny 77/)).toBeTruthy();
    expect(screen.getByLabelText(/^Chaseworthy 92/)).toBeTruthy();
  });

  it("keeps the summary line in step with the picks", async () => {
    renderBuilder();
    await pickPartner();

    expect(screen.getByTestId("trade-summary").textContent).toBe("nothing ⇄ nothing");

    await click(screen.getByLabelText(/^Canny 77/));
    await click(screen.getByLabelText(/^Bronzey 51/));
    fireEvent.change(screen.getByLabelText("Dollars you give"), { target: { value: "100" } });
    await click(screen.getByLabelText(/^Chaseworthy 92/));

    expect(screen.getByTestId("trade-summary").textContent).toBe("2 cards + $100 ⇄ 1 card");
  });

  it("sends the chosen ids and dollars, then clears the form", async () => {
    renderBuilder();
    await pickPartner();

    await click(screen.getByLabelText(/^Canny 77/));
    await click(screen.getByLabelText(/^Chaseworthy 92/));
    fireEvent.change(screen.getByLabelText("Dollars you give"), { target: { value: "150" } });

    await click(screen.getByRole("button", { name: "Send offer" }));

    expect(createTradeAction).toHaveBeenCalledTimes(1);
    expect(createTradeAction).toHaveBeenCalledWith({
      toDiscordId: THEM,
      offeredIds: [1],
      requestedIds: [9],
      offeredDollars: 150,
      requestedDollars: 0,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("trade-summary").textContent).toBe("nothing ⇄ nothing");
  });

  it("refuses an empty trade without calling the action", async () => {
    renderBuilder();
    await pickPartner();

    await click(screen.getByRole("button", { name: "Send offer" }));

    expect(createTradeAction).not.toHaveBeenCalled();
    expect(screen.getByText("An empty trade isn't a trade — add a card or some dollars.")).toBeTruthy();
  });

  it("refuses dollars that aren't a whole number", async () => {
    renderBuilder();
    await pickPartner();

    await click(screen.getByLabelText(/^Canny 77/));
    fireEvent.change(screen.getByLabelText("Dollars you give"), { target: { value: "12.5" } });
    await click(screen.getByRole("button", { name: "Send offer" }));

    expect(createTradeAction).not.toHaveBeenCalled();
    expect(screen.getByText("Trade dollars have to be a whole number.")).toBeTruthy();
  });

  it("surfaces the action's error and doesn't refresh", async () => {
    createTradeAction.mockResolvedValue({ ok: false, error: "You can only offer cards you own." });
    renderBuilder();
    await pickPartner();

    await click(screen.getByLabelText(/^Canny 77/));
    await click(screen.getByRole("button", { name: "Send offer" }));

    expect(screen.getByText("You can only offer cards you own.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("surfaces a failed collection load", async () => {
    fetchPartnerInventoryAction.mockResolvedValue({ ok: false, error: "FPL Better members only." });
    renderBuilder();
    await pickPartner();

    expect(screen.getByText("FPL Better members only.")).toBeTruthy();
  });
});
