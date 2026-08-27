import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PackShop from "./PackShop";

const { openPackAction, openChampionsPackAction, sounds } = vi.hoisted(() => {
  // The real sounds module needs WebAudio, which jsdom doesn't have — and the
  // shop's job isn't to prove the synth works. The mute store is kept real (a
  // flag and a listener set) because the shop reads it through
  // useSyncExternalStore, so a stub returning a constant would never update.
  let muted = false;
  const listeners = new Set<() => void>();
  return {
    openPackAction: vi.fn(),
    openChampionsPackAction: vi.fn(),
    sounds: {
      reset: () => {
        muted = false;
      },
      getMuted: () => muted,
      getMutedServer: () => false,
      subscribeMuted: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setMuted: vi.fn((next: boolean) => {
        muted = next;
        listeners.forEach((listener) => listener());
      }),
    },
  };
});

vi.mock("@/lib/packs/actions", () => ({ openPackAction, openChampionsPackAction }));
// server-only transitively — the shop only hands it to the overlay.
vi.mock("@/lib/trades/actions", () => ({ dustManyAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/packs/sounds", () => ({ ...sounds, revealTone: vi.fn(), ripTick: vi.fn(), ripOpen: vi.fn() }));

// The whole ritual is PackOpening's, and it has its own suite. Here it stands
// in for itself, reporting the props the shop handed it and offering the two
// callbacks the shop is on the hook for.
interface OpeningProps {
  pulls: { card: PlayerCardData }[];
  balance: number;
  packCost: number;
  ownedSlugs: string[];
  muted: boolean;
  onOpenAnother: () => Promise<unknown>;
  onExit: () => void;
}
vi.mock("./PackOpening", () => ({
  default: (props: OpeningProps) => (
    <div data-testid="opening">
      <span data-testid="opening-pulls">{props.pulls.map((pull) => pull.card.name).join(",")}</span>
      <span data-testid="opening-balance">{props.balance}</span>
      <span data-testid="opening-owned">{props.ownedSlugs.join(",")}</span>
      <span data-testid="opening-muted">{String(props.muted)}</span>
      <span data-testid="opening-cost">{props.packCost}</span>
      <button type="button" onClick={() => void props.onOpenAnother()}>
        overlay open another
      </button>
      <button type="button" onClick={props.onExit}>
        overlay done
      </button>
    </div>
  ),
}));

/** A card that only differs from its siblings where the shop cares. */
function makeCard(name: string, tier: PlayerCardData["tier"], overall: number): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall,
    tier,
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
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

const pulls = [
  { card: makeCard("Chaseworthy", { key: "challenger", label: "Challenger" }, 92), foil: true, signed: false, inventoryId: 5 },
  { card: makeCard("Bronzey", { key: "bronze", label: "Bronze" }, 51), foil: false, signed: false, inventoryId: 1 },
];

function renderShop() {
  return render(
    <PackShop league="premier" balance={1000} packCost={200} openCount={3} ownedSlugs={["bronzey"]} />,
  );
}

/** Click and let the (mocked, already-resolved) server action settle. */
async function openPack() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /open pack/i }));
  });
}

beforeEach(() => {
  openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
});

afterEach(() => {
  cleanup();
  // The mute store is module state, so it would leak between tests.
  sounds.reset();
  sounds.setMuted.mockClear();
  openPackAction.mockReset();
  openChampionsPackAction.mockReset();
});

describe("PackShop", () => {
  it("shows the wallet, the price, and how many packs have been opened", () => {
    renderShop();
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open pack — $200" })).toBeTruthy();
    expect(screen.getByText("3 packs opened")).toBeTruthy();
    // Nothing is opening until someone buys one.
    expect(screen.queryByTestId("opening")).toBeNull();
  });

  it("surfaces the action's error and opens nothing", async () => {
    openPackAction.mockResolvedValue({ ok: false, error: "Insufficient balance." });
    renderShop();
    await openPack();

    expect(screen.getByText("Insufficient balance.")).toBeTruthy();
    // Wallet untouched, no stage raised.
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.queryByTestId("opening")).toBeNull();
  });

  it("hands the pack to the full-screen opening and banks the charge", async () => {
    renderShop();
    await openPack();

    expect(screen.getByTestId("opening-pulls").textContent).toBe("Chaseworthy,Bronzey");
    expect(screen.getByTestId("opening-balance").textContent).toBe("800");
    // What's already on the shelf travels with it, for the NEW badges.
    expect(screen.getByTestId("opening-owned").textContent).toBe("bronzey");
    expect(screen.getByText("$800")).toBeTruthy();
    expect(screen.getByText("4 packs opened")).toBeTruthy();
  });

  it("buys another pack for the overlay without tearing it down", async () => {
    renderShop();
    await openPack();

    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 600 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlay open another" }));
    });

    expect(openPackAction).toHaveBeenCalledTimes(2);
    // The stage stays up; the till behind it keeps count.
    expect(screen.getByTestId("opening")).toBeTruthy();
    expect(screen.getByText("$600")).toBeTruthy();
    expect(screen.getByText("5 packs opened")).toBeTruthy();
  });

  it("re-deals a Faceless Pack from the overlay, at the Faceless price", async () => {
    // The bug this pins down: "Open another" after a champions pack fell
    // back to a normal pack (and quoted the normal price).
    const relic = [{ card: makeCard("faceless-k", { key: "gold", label: "Champion" }, 0), foil: false, signed: false, inventoryId: 9 }];
    openChampionsPackAction.mockResolvedValue({ ok: true, cards: relic, balance: 750 });
    render(
      <PackShop league="premier" balance={1000} packCost={200} openCount={3} ownedSlugs={[]} championsOpen />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /faceless pack/i }));
    });
    expect(screen.getByTestId("opening-cost").textContent).toBe("250");

    openChampionsPackAction.mockResolvedValue({ ok: true, cards: relic, balance: 500 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlay open another" }));
    });
    expect(openChampionsPackAction).toHaveBeenCalledTimes(2);
    // The normal-pack action never fires from a champions overlay.
    expect(openPackAction).not.toHaveBeenCalled();
  });

  it("labels the Faceless Pack FREE while tribute comps remain, then reprices", async () => {
    const relic = [{ card: makeCard("faceless-k", { key: "gold", label: "Champion" }, 0), foil: false, signed: false, inventoryId: 9 }];
    // Spending the first of two comps: the server reports one left.
    openChampionsPackAction.mockResolvedValue({ ok: true, cards: relic, balance: 1000, compsLeft: 1 });
    render(
      <PackShop league="premier" balance={1000} packCost={200} openCount={0} ownedSlugs={[]} championsOpen championComps={2} />,
    );
    expect(screen.getByRole("button", { name: /faceless pack — free \(2 left\)/i })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /faceless pack/i }));
    });
    // The server said one comp remains; when it says 0, the price returns.
    expect(screen.getByRole("button", { name: /faceless pack — free \(1 left\)/i })).toBeTruthy();
  });

  it("never lets a normal pack's comp count relabel the Faceless button", async () => {
    // A normal open reports compsLeft too now — the Weekly Draw pays out
    // standard pack comps. That count belongs to the shop's own shelf, and
    // banking it here would claim the tribute had been spent.
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800, compsLeft: 0 });
    render(
      <PackShop league="premier" balance={1000} packCost={200} openCount={0} ownedSlugs={[]} championsOpen championComps={2} />,
    );
    await openPack();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "overlay open another" }));
    });

    expect(openPackAction).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /faceless pack — free \(2 left\)/i })).toBeTruthy();
  });

  it("takes the stage down when the opening is done with it", async () => {
    renderShop();
    await openPack();
    expect(screen.getByTestId("opening")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "overlay done" }));
    expect(screen.queryByTestId("opening")).toBeNull();
    // The wallet the opening spent stays spent.
    expect(screen.getByText("$800")).toBeTruthy();
  });

  it("toggles the sound preference through the shared store", async () => {
    renderShop();
    fireEvent.click(screen.getByRole("button", { name: /mute pack sounds/i }));
    expect(sounds.setMuted).toHaveBeenCalledWith(true);
    // The toggle flips to its "click to unmute" state off the store, not off
    // local component state — and the overlay is told the same thing.
    expect(screen.getByRole("button", { name: /unmute pack sounds/i })).toBeTruthy();

    await openPack();
    expect(screen.getByTestId("opening-muted").textContent).toBe("true");
  });

  it("sells a pack for any archived week, newest selected by default", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    render(
      <PackShop
        league="premier"
        balance={1000}
        packCost={200}
        openCount={3}
        editionWeeks={["2026-09-07", "2026-08-31", "2026-08-24"]}
      />,
    );

    // Newest first, numbered up from the season's first archived week — so
    // the oldest of three reads "Week 1".
    const picker = screen.getByLabelText(/edition/i) as HTMLSelectElement;
    expect(picker.value).toBe("2026-09-07");
    expect(screen.getByRole("option", { name: /Week 3/ }).getAttribute("value")).toBe("2026-09-07");
    expect(screen.getByRole("option", { name: /Week 1/ }).getAttribute("value")).toBe("2026-08-24");

    await openPack();
    expect(openPackAction).toHaveBeenCalledWith("premier", "2026-09-07");

    // An older week re-mints that edition rather than the current cards.
    openPackAction.mockClear();
    await act(async () => {
      fireEvent.change(picker, { target: { value: "2026-08-24" } });
    });
    await openPack();
    expect(openPackAction).toHaveBeenCalledWith("premier", "2026-08-24");
  });

  it("hides the picker and asks for no week before the first archive exists", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    renderShop();

    expect(screen.queryByLabelText(/edition/i)).toBeNull();
    await openPack();
    expect(openPackAction).toHaveBeenCalledWith("premier", undefined);
  });
});
