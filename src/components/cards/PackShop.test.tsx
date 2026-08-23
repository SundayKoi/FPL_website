import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PackShop from "./PackShop";

const { openPackAction } = vi.hoisted(() => ({ openPackAction: vi.fn() }));

vi.mock("@/lib/packs/actions", () => ({ openPackAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
  { card: makeCard("Chaseworthy", { key: "challenger", label: "Challenger" }, 92), foil: true, inventoryId: 5 },
  { card: makeCard("Epicsson", { key: "diamond", label: "Diamond" }, 84), foil: false, inventoryId: 4 },
  { card: makeCard("Rarity", { key: "platinum", label: "Platinum" }, 76), foil: false, inventoryId: 3 },
  { card: makeCard("Commonly", { key: "silver", label: "Silver" }, 62), foil: false, inventoryId: 2 },
  { card: makeCard("Bronzey", { key: "bronze", label: "Bronze" }, 51), foil: false, inventoryId: 1 },
];

function renderShop() {
  return render(<PackShop league="premier" balance={1000} packCost={200} openCount={3} />);
}

/** Click and let the (mocked, already-resolved) server action settle. */
async function openPack() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /open pack/i }));
  });
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  openPackAction.mockReset();
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

  it("reveals the five pulls worst-first, then offers another pack", async () => {
    openPackAction.mockResolvedValue({ ok: true, cards: pulls, balance: 800 });
    renderShop();
    await openPack();

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
    // Foil pulls are chipped; the other four aren't.
    expect(screen.getAllByText("✦ Foil")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Open another" })).toBeTruthy();
  });
});
