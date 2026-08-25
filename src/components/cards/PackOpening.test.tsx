import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PackOpening from "./PackOpening";

const { flipTone, packDropThud, walkoutSting, setMuted } = vi.hoisted(() => ({
  flipTone: vi.fn(),
  packDropThud: vi.fn(),
  walkoutSting: vi.fn(),
  setMuted: vi.fn(),
}));

// jsdom has no WebAudio, and the ritual's job isn't to prove the synth works.
vi.mock("@/lib/packs/sounds", () => ({
  flipTone,
  packDropThud,
  walkoutSting,
  setMuted,
  ripTick: vi.fn(),
  ripOpen: vi.fn(),
  revealTone: vi.fn(),
}));

/** jsdom ships no matchMedia at all, so every test states its own answer. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function makeCard(
  name: string,
  tier: PlayerCardData["tier"],
  overall: number,
  artSkin = 0,
): PlayerCardData {
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
    artSkin,
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

// Deliberately handed over best-first, so a passing order assertion can only
// come from the overlay's own sort.
const pulls = [
  { card: makeCard("Chaseworthy", { key: "challenger", label: "Challenger" }, 92), foil: true, foilType: "prisma", signed: false, inventoryId: 5 },
  { card: makeCard("Epicsson", { key: "diamond", label: "Diamond" }, 84), foil: false, foilType: null, signed: false, inventoryId: 4 },
  { card: makeCard("Rarity", { key: "platinum", label: "Platinum" }, 76), foil: false, foilType: null, signed: false, inventoryId: 3 },
  { card: makeCard("Commonly", { key: "silver", label: "Silver" }, 62), foil: false, foilType: null, signed: false, inventoryId: 2 },
  { card: makeCard("Bronzey", { key: "bronze", label: "Bronze" }, 51), foil: false, foilType: null, signed: false, inventoryId: 1 },
];

function renderOpening(overrides: Partial<ComponentProps<typeof PackOpening>> = {}) {
  const onOpenAnother = vi.fn(async () => ({ ok: true as const, cards: pulls, balance: 600 }));
  const onExit = vi.fn();
  const result = render(
    <PackOpening
      pulls={pulls}
      balance={800}
      packCost={200}
      ownedSlugs={["bronzey"]}
      muted={false}
      onOpenAnother={onOpenAnother}
      onExit={onExit}
      {...overrides}
    />,
  );
  return { ...result, onOpenAnother, onExit };
}

/** The face-down cards still waiting to be turned. Backs that have already
 *  flipped are aria-hidden, so they drop out of this on their own. */
function backs() {
  return screen.queryAllByRole("button", { name: /reveal card/i });
}

/** Tear the wrapper off via PackRip's three-click path (jsdom can't drag),
 *  then let the drop timer and the burst both land. */
async function ripPack() {
  const pack = screen.getByRole("button", { name: /rip it open/i });
  for (let click = 0; click < 3; click += 1) fireEvent.click(pack);
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
}

/** Turn everything face-up by hand, clearing walkouts as they interrupt. */
function flipEverything() {
  for (let guard = 0; guard < 20; guard += 1) {
    const walkout = screen.queryByRole("button", { name: "Continue" });
    if (walkout) {
      fireEvent.click(walkout);
      continue;
    }
    const remaining = backs();
    if (remaining.length === 0) return;
    fireEvent.click(remaining[0]);
  }
  throw new Error("the line never finished flipping");
}

beforeEach(() => {
  vi.useFakeTimers();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  flipTone.mockReset();
  packDropThud.mockReset();
  walkoutSting.mockReset();
  setMuted.mockReset();
});

describe("PackOpening", () => {
  it("opens sealed, lit by the best card in the pack, with nothing revealed", () => {
    const { container } = renderOpening();

    expect(screen.getByRole("dialog", { name: /opening a card pack/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /rip it open/i })).toBeTruthy();
    // The room's color is the chase card's — a Challenger.
    expect(container.querySelector(".pack-overlay.pack-rarity-legendary")).toBeTruthy();
    expect(backs()).toHaveLength(0);
    expect(screen.queryByText("Bronzey")).toBeNull();
    // The page underneath must not scroll while this is up.
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("thuds when the pack lands in the spotlight", async () => {
    renderOpening();
    expect(packDropThud).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(packDropThud).toHaveBeenCalledTimes(1);
  });

  it("fans five backs out worst-first, each glowing in its own card's rarity", async () => {
    const { container } = renderOpening();
    await ripPack();

    expect(backs()).toHaveLength(5);
    // Still face-down: the pack is open, the cards are not.
    expect(screen.queryByText("Bronzey")).toBeNull();

    const glow = [...container.querySelectorAll(".pack-card-back")].map((back) =>
      [...back.classList].find((name) => name.startsWith("pack-rarity-")),
    );
    expect(glow).toEqual([
      "pack-rarity-common",
      "pack-rarity-common",
      "pack-rarity-rare",
      "pack-rarity-epic",
      "pack-rarity-legendary",
    ]);
  });

  it("turns a card only when it's clicked, and chirps as it goes", async () => {
    renderOpening();
    await ripPack();

    fireEvent.click(backs()[0]);
    expect(screen.getAllByText("Bronzey").length).toBeGreaterThan(0);
    // Its slug was already on the shelf, so it isn't new.
    expect(screen.queryByText("New")).toBeNull();
    expect(flipTone).toHaveBeenCalledWith(0);
    // One turned, four still waiting — nothing auto-reveals.
    expect(backs()).toHaveLength(4);
    expect(screen.queryByText("Commonly")).toBeNull();

    fireEvent.click(backs()[0]);
    expect(screen.getAllByText("Commonly").length).toBeGreaterThan(0);
    expect(screen.getAllByText("New").length).toBe(1);
  });

  it("stops the whole opening for a diamond, then hands the card back to the line", async () => {
    renderOpening();
    await ripPack();

    // Worst-first, so the Platinum sits third and passes without ceremony.
    fireEvent.click(backs()[2]);
    expect(screen.queryByText("💎 DIAMOND PULL")).toBeNull();

    // A back that's been turned drops out of the line's queue, so the Diamond
    // is now the third one still face-down.
    fireEvent.click(backs()[2]);
    expect(screen.getByText("💎 DIAMOND PULL")).toBeTruthy();
    expect(walkoutSting).toHaveBeenCalledWith("epic", false);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByText("💎 DIAMOND PULL")).toBeNull();
    // The card is still turned over in the line behind it.
    expect(screen.getAllByText("Epicsson").length).toBeGreaterThan(0);
    expect(backs()).toHaveLength(3);
  });

  it("crowns a legendary instead, and remembers it as the session's best", async () => {
    renderOpening();
    await ripPack();

    flipEverything();
    expect(walkoutSting).toHaveBeenCalledWith("legendary", false);
    expect(screen.getByText(/Best pull · Chaseworthy/)).toBeTruthy();
  });

  it("tallies the pack once every card is face-up", async () => {
    renderOpening();
    await ripPack();
    flipEverything();

    // 10 + 10 + 25 + 60 + (150 doubled for the foil) = 405.
    expect(screen.getByText("$405")).toBeTruthy();
    // Four of the five slugs weren't on the shelf.
    expect(screen.getByText("4 of 5")).toBeTruthy();
    expect(screen.getByText("1 pack")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open another — $200" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("buys the next pack without leaving the stage", async () => {
    const { onOpenAnother } = renderOpening();
    await ripPack();
    flipEverything();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open another — $200" }));
    });

    expect(onOpenAnother).toHaveBeenCalledTimes(1);
    // Back to a sealed pack, with the session counter carried forward.
    expect(screen.getByRole("button", { name: /rip it open/i })).toBeTruthy();
    expect(backs()).toHaveLength(0);

    await ripPack();
    flipEverything();
    expect(screen.getByText("2 packs")).toBeTruthy();
    expect(screen.getByText("$600")).toBeTruthy();
    // Second time round nothing is new — the session remembers the slugs.
    expect(screen.getByText("0 of 5")).toBeTruthy();
  });

  it("shows a refused re-open in the summary bar and stops offering it", async () => {
    const onOpenAnother = vi.fn(async () => ({ ok: false as const, error: "Insufficient balance." }));
    renderOpening({ onOpenAnother });
    await ripPack();
    flipEverything();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open another — $200" }));
    });

    expect(screen.getByRole("alert").textContent).toBe("Insufficient balance.");
    expect(screen.getByRole("button", { name: "Open another — $200" }).hasAttribute("disabled")).toBe(true);
    // The stage stays up, so "Done" is still the way out.
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("flips the rest on request, one beat at a time", async () => {
    renderOpening();
    await ripPack();
    fireEvent.click(backs()[0]);

    fireEvent.click(screen.getByRole("button", { name: "Flip all" }));
    expect(backs()).toHaveLength(4);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(backs()).toHaveLength(3);

    // The run stalls while a walkout is up rather than turning cards behind it.
    for (let beat = 0; beat < 3; beat += 1) {
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
    }
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(backs().length).toBeGreaterThan(0);
  });

  it("lets Escape skip to the summary rather than out of the pack", async () => {
    const { onExit } = renderOpening();
    await ripPack();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    // Everything face-up, no walkouts, straight to the tally — and still here.
    expect(onExit).not.toHaveBeenCalled();
    expect(backs()).toHaveLength(0);
    expect(walkoutSting).not.toHaveBeenCalled();
    expect(screen.getByText("$405")).toBeTruthy();

    // A second Escape, now that there's nothing left to skip, is the door.
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("keeps the phases but drops the theater when motion is unwelcome", () => {
    stubReducedMotion(true);
    renderOpening();

    // No pack to tear, no backs to turn: the cards are simply there, and the
    // summary is available immediately.
    expect(screen.queryByRole("button", { name: /rip it open/i })).toBeNull();
    expect(backs()).toHaveLength(0);
    expect(screen.getAllByText("Chaseworthy").length).toBeGreaterThan(0);
    expect(screen.getByText("$405")).toBeTruthy();
    expect(walkoutSting).not.toHaveBeenCalled();
  });

  it("stays silent when muted, but still opens", async () => {
    renderOpening({ muted: true });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(packDropThud).not.toHaveBeenCalled();

    await ripPack();
    flipEverything();
    expect(flipTone).not.toHaveBeenCalled();
    expect(walkoutSting).not.toHaveBeenCalled();
    // The tally still lands.
    expect(screen.getByText("$405")).toBeTruthy();
  });
});
