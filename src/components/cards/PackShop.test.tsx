import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PackShop from "./PackShop";

const { openPackAction, revealTone, sounds } = vi.hoisted(() => {
  // The real module needs WebAudio, which jsdom doesn't have — and the shop's
  // job isn't to prove the synth works. The mute store is kept real (a flag
  // and a listener set) because the shop reads it through
  // useSyncExternalStore, so a stub returning a constant would never update.
  let muted = false;
  const listeners = new Set<() => void>();
  return {
    openPackAction: vi.fn(),
    revealTone: vi.fn(),
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

vi.mock("@/lib/packs/actions", () => ({ openPackAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/packs/sounds", () => ({ ...sounds, revealTone, ripTick: vi.fn(), ripOpen: vi.fn() }));

/** A card that only differs from its siblings where the shop cares: name,
 *  tier (which drives the reveal order) and rating. */
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

// Deliberately handed to the shop best-first, so a passing reveal-order
// assertion can only come from the component's own sort.
const pulls = [
  { card: makeCard("Chaseworthy", { key: "challenger", label: "Challenger" }, 92), foil: true, signed: false, inventoryId: 5 },
  { card: makeCard("Epicsson", { key: "diamond", label: "Diamond" }, 84), foil: false, signed: true, inventoryId: 4 },
  { card: makeCard("Rarity", { key: "platinum", label: "Platinum" }, 76), foil: false, signed: false, inventoryId: 3 },
  { card: makeCard("Commonly", { key: "silver", label: "Silver" }, 62), foil: false, signed: false, inventoryId: 2 },
  { card: makeCard("Bronzey", { key: "bronze", label: "Bronze" }, 51), foil: false, signed: false, inventoryId: 1 },
];

function renderShop() {
  return render(<PackShop league="premier" balance={1000} packCost={200} openCount={3} />);
}

/** Click and let the (mocked, already-resolved) server action settle. This
 *  leaves a sealed pack on screen, not cards — see ripPack. */
async function openPack() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /open pack/i }));
  });
}

/** Tear the wrapper off via PackRip's three-click path (jsdom can't drag),
 *  then let the burst finish so the reveal run starts. */
async function ripPack() {
  const pack = screen.getByRole("button", { name: /rip it open/i });
  for (let click = 0; click < 3; click += 1) fireEvent.click(pack);
  await act(async () => {
    vi.advanceTimersByTime(900);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // PackRip reads this on mount; jsdom doesn't ship it. `false` keeps the rip
  // in play — the reduced-motion shortcut is PackRip's own test.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  // The mute store is module state, so it would leak between tests.
  sounds.reset();
  sounds.setMuted.mockClear();
  openPackAction.mockReset();
  revealTone.mockReset();
});

describe("PackShop", () => {
  it("shows the wallet, the price, and how many packs have been opened", () => {
    renderShop();
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open pack — $200" })).toBeTruthy();
    expect(screen.getByText("3 packs opened")).toBeTruthy();
  });

  it("surfaces the action's error and opens nothing", async () => {
    openPackAction.mockResolvedValue({ ok: false, error: "Insufficient balance." });
    renderShop();
    await openPack();

    expect(screen.getByText("Insufficient balance.")).toBeTruthy();
    // Wallet untouched, no cards on the table.
    expect(screen.getByText("$1,000")).toBeTruthy();
    expect(screen.queryByText("Bronzey")).toBeNull();
  });

  it("seals the pack behind a rip before showing anything", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    renderShop();
    await openPack();

    // Paid for and rolled, but nothing on the table until the foil comes off.
    expect(screen.getByRole("button", { name: /rip it open/i })).toBeTruthy();
    expect(screen.queryByText("Bronzey")).toBeNull();
    // The aura is colored by the best card in there — a Challenger.
    expect(document.querySelector(".pack-rarity-legendary")).toBeTruthy();

    await ripPack();
    expect(screen.queryByRole("button", { name: /rip it open/i })).toBeNull();
    expect(screen.getAllByText("Bronzey").length).toBeGreaterThan(0);
  });

  it("reveals the five pulls worst-first, then offers another pack", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    renderShop();
    await openPack();
    await ripPack();

    // The chase card can't be first — the worst pull opens the run.
    expect(screen.getAllByText("Bronzey").length).toBeGreaterThan(0);
    expect(screen.queryByText("Chaseworthy")).toBeNull();
    expect(screen.getByText("$800")).toBeTruthy();
    expect(screen.getByText("4 packs opened")).toBeTruthy();

    // One beat per remaining card — each tick has to be flushed on its own,
    // since the next timer is only scheduled once React has re-rendered.
    for (let beat = 1; beat < pulls.length; beat += 1) {
      await act(async () => {
        vi.advanceTimersByTime(700);
      });
    }

    for (const pull of pulls) {
      expect(screen.getAllByText(pull.card.name).length).toBeGreaterThan(0);
    }
    // Foil pulls are chipped; the other four aren't. The autographed pull
    // gets its own, louder chip.
    expect(screen.getAllByText("✦ Foil")).toHaveLength(1);
    expect(screen.getAllByText("✍ Signed")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Open another" })).toBeTruthy();
    // One blip per card as it lands, pitched by that card's rarity rank.
    expect(revealTone).toHaveBeenCalledTimes(pulls.length);
    expect(revealTone.mock.calls.map(([rank]) => rank)).toEqual([0, 0, 1, 2, 3]);
  });

  it("mutes the reveal blips", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    renderShop();
    fireEvent.click(screen.getByRole("button", { name: /mute pack sounds/i }));
    expect(sounds.setMuted).toHaveBeenCalledWith(true);
    // The toggle flips to its "click to unmute" state off the store, not off
    // local component state.
    expect(screen.getByRole("button", { name: /unmute pack sounds/i })).toBeTruthy();

    await openPack();
    await ripPack();
    expect(revealTone).not.toHaveBeenCalled();
  });
});
