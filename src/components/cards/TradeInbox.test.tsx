import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import TradeInbox, { type InboxCard, type InboxTrade } from "./TradeInbox";

const { respondTradeAction } = vi.hoisted(() => ({ respondTradeAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ respondTradeAction }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ME = "me-1";

/** The frozen copy behind a chip — enough of one for the preview to render. */
function frozen(name: string, artSkin = 0): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall: 77,
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin,
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

function card(id: number, playerName: string, extra: Partial<InboxCard> = {}): InboxCard {
  return {
    id,
    playerName,
    overall: 77,
    tier: "gold",
    editionWeek: "2026-08-17",
    foil: false,
    signed: false,
    altArt: false,
    card: frozen(playerName, extra.altArt ? 12 : 0),
    stale: false,
    ...extra,
  };
}

function trade(over: Partial<InboxTrade> = {}): InboxTrade {
  return {
    id: 1,
    fromDiscordId: "them-1",
    fromUsername: "Rivalry",
    toDiscordId: ME,
    toUsername: "Mine",
    offered: [card(10, "Canny")],
    requested: [card(20, "Epicsson")],
    offeredDollars: 0,
    requestedDollars: 0,
    status: "pending",
    stale: false,
    ...over,
  };
}

function renderInbox(incoming: InboxTrade[], outgoing: InboxTrade[] = []) {
  return render(<TradeInbox incoming={incoming} outgoing={outgoing} viewerDiscordId={ME} />);
}

/** Click and let the (mocked, already-resolved) server action settle. */
async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  respondTradeAction.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

afterEach(cleanup);

describe("TradeInbox", () => {
  it("says so when both lists are empty", () => {
    renderInbox([], []);
    expect(screen.getByText("Nobody has offered you a trade yet.")).toBeTruthy();
    expect(screen.getByText("You haven't sent any offers yet.")).toBeTruthy();
  });

  it("renders offers in both directions, with cards, dollars and status", () => {
    renderInbox(
      [trade({ id: 1, requestedDollars: 100 })],
      [
        trade({
          id: 2,
          fromDiscordId: ME,
          fromUsername: "Mine",
          toDiscordId: "them-2",
          toUsername: "Otherguy",
          offered: [card(30, "Bronzey", { foil: true })],
          requested: [],
          offeredDollars: 0,
          requestedDollars: 0,
          status: "accepted",
        }),
      ],
    );

    // Names sit alongside the rating/edition inside one chip, so match loosely.
    expect(screen.getAllByText(/Canny/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Epicsson/).length).toBeGreaterThan(0);
    expect(screen.getByText("$100")).toBeTruthy();
    expect(screen.getAllByText(/Bronzey/).length).toBeGreaterThan(0);
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    // Edition chips come off the copy's own print run.
    expect(screen.getAllByText(/WK Aug 17/).length).toBeGreaterThan(0);
  });

  it("accepts a pending incoming offer with no money in it in one click", async () => {
    renderInbox([trade({ id: 7 })]);

    await click(screen.getByRole("button", { name: "Accept" }));
    expect(respondTradeAction).toHaveBeenCalledTimes(1);
    expect(respondTradeAction).toHaveBeenCalledWith(7, true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("makes you confirm when your own dollars are leaving", async () => {
    renderInbox([trade({ id: 8, requestedDollars: 250 })]);

    await click(screen.getByRole("button", { name: "Accept" }));
    expect(respondTradeAction).not.toHaveBeenCalled();

    await click(screen.getByRole("button", { name: "Confirm — $250 leaves your wallet?" }));
    expect(respondTradeAction).toHaveBeenCalledWith(8, true);
  });

  it("disables Accept on a stale trade and marks the moved card", () => {
    renderInbox([
      trade({
        id: 9,
        stale: true,
        requested: [card(20, "Card no longer available", { stale: true })],
      }),
    ]);

    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("no longer available")).toBeTruthy();
    expect(screen.getByText(/can no longer be accepted/)).toBeTruthy();
  });

  it("declines an incoming offer and cancels an outgoing one", async () => {
    renderInbox(
      [trade({ id: 11 })],
      [
        trade({
          id: 12,
          fromDiscordId: ME,
          fromUsername: "Mine",
          toDiscordId: "them-2",
          toUsername: "Otherguy",
        }),
      ],
    );

    await click(screen.getByRole("button", { name: "Decline" }));
    expect(respondTradeAction).toHaveBeenCalledWith(11, false);

    await click(screen.getByRole("button", { name: "Cancel offer" }));
    expect(respondTradeAction).toHaveBeenCalledWith(12, false);
    // No Accept on your own offer — you can only withdraw it.
    expect(screen.queryByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Cancel offer" })).toHaveLength(1);
  });

  it("surfaces the action's error and doesn't refresh", async () => {
    respondTradeAction.mockResolvedValue({ ok: false, error: "That trade has already been answered." });
    renderInbox([trade({ id: 13 })]);

    await click(screen.getByRole("button", { name: "Accept" }));

    expect(screen.getByText("That trade has already been answered.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hides the buttons once a trade has been answered", () => {
    renderInbox([trade({ id: 14, status: "declined" })]);
    // The chips are still buttons — they open the card — but nothing on the
    // row can act on the trade any more.
    expect(screen.queryByRole("button", { name: /Accept|Decline|Cancel/ })).toBeNull();
  });

  it("marks an alternate print on the chip", () => {
    renderInbox([trade({ id: 15, offered: [card(10, "Canny", { altArt: true, foil: true })] })]);

    expect(screen.getByTitle("Alternate art print").textContent).toBe("ALT");
    expect(screen.getByTitle("Foil copy").textContent).toBe(" ✦");
  });

  it("opens the exact copy behind a chip, and closes again", async () => {
    renderInbox([trade({ id: 16, offered: [card(10, "Canny", { altArt: true })], requested: [] })]);

    const chip = screen.getByRole("button", { name: "View Canny 77 WK Aug 17 card" });
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");

    await click(chip);
    expect(screen.getByRole("dialog", { name: "Canny — card preview" })).toBeTruthy();
    // The card itself, not another chip: PlayerCard3D labels its own frame.
    expect(screen.getByRole("button", { name: /^Canny player card/ })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves a moved card as a dead chip with nothing to open", () => {
    renderInbox([
      trade({ id: 17, stale: true, requested: [card(20, "Card no longer available", { stale: true })] }),
    ]);

    expect(screen.queryByRole("button", { name: /^View Card no longer available/ })).toBeNull();
  });
});
