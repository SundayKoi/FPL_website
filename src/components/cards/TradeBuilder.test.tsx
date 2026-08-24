import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import TradeBuilder, { type TradeCardOption } from "./TradeBuilder";

const { createTradeAction, fetchInventoryCardAction, fetchPartnerInventoryAction } = vi.hoisted(() => ({
  createTradeAction: vi.fn(),
  fetchInventoryCardAction: vi.fn(),
  fetchPartnerInventoryAction: vi.fn(),
}));
vi.mock("@/lib/trades/actions", () => ({
  createTradeAction,
  fetchInventoryCardAction,
  fetchPartnerInventoryAction,
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ME = "me-1";
const THEM = "them-1";

/** A frozen copy, as your own shelf ships them (a partner's rows don't). */
function frozen(name: string, overall: number): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall,
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 48,
    topChampions: [],
    form: [],
    subStats: [{ key: "combat", label: "Combat", value: 50 }],
    highlights: [],
    badges: [],
    standout: false,
    wins: 1,
    losses: 1,
    winratePct: 50,
    level: 10,
    pentas: 0,
    season: "S5",
  };
}

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
    altArt: false,
    editionWeek: "2026-08-17",
    ...extra,
  };
}

// Your own shelf carries its frozen cards; the partner's rows are flat, and
// their previews go and fetch one.
const mine = [
  option(1, "Canny", 77, { card: frozen("Canny", 77) }),
  option(2, "Bronzey", 51, { foil: true, altArt: true, card: frozen("Bronzey", 51) }),
];
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
  fetchInventoryCardAction.mockReset().mockResolvedValue({ ok: true, card: frozen("Chaseworthy", 92) });
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

  it("keeps the summary line in step with the picks, variants counted", async () => {
    renderBuilder();
    await pickPartner();

    expect(screen.getByTestId("trade-summary").textContent).toBe("nothing ⇄ nothing");

    await click(screen.getByLabelText(/^Canny 77/));
    await click(screen.getByLabelText(/^Bronzey 51/));
    fireEvent.change(screen.getByLabelText("Dollars you give"), { target: { value: "100" } });
    await click(screen.getByLabelText(/^Chaseworthy 92/));

    // Bronzey is the foil and the alternate print; Chaseworthy is signed.
    expect(screen.getByTestId("trade-summary").textContent).toBe(
      "2 cards (1 ✦, 1 ALT) + $100 ⇄ 1 card (1 ✍)",
    );
  });

  it("marks alternate prints on both shelves", async () => {
    fetchPartnerInventoryAction.mockResolvedValue({
      ok: true,
      cards: [option(9, "Chaseworthy", 92, { altArt: true })],
    });
    renderBuilder();
    await pickPartner();

    // One on your shelf (Bronzey), one on theirs.
    expect(screen.getAllByTitle("Alternate art print")).toHaveLength(2);
  });

  it("previews one of your own copies without asking the server", async () => {
    renderBuilder();
    await pickPartner();

    await click(screen.getByRole("button", { name: "View Canny 77 WK Aug 17 card" }));

    expect(fetchInventoryCardAction).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Canny — card preview" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Canny player card/ })).toBeTruthy();
    // Looking is not picking: the checkbox stays where it was.
    expect((screen.getByLabelText(/^Canny 77/) as HTMLInputElement).checked).toBe(false);

    await click(screen.getByRole("button", { name: "Close card preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fetches a partner's frozen card only when its preview opens", async () => {
    renderBuilder();
    await pickPartner();

    expect(fetchInventoryCardAction).not.toHaveBeenCalled();

    await click(screen.getByRole("button", { name: "View Chaseworthy 92 WK Aug 17 card" }));

    expect(fetchInventoryCardAction).toHaveBeenCalledWith(9);
    expect(screen.getByRole("button", { name: /^Chaseworthy player card/ })).toBeTruthy();
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
