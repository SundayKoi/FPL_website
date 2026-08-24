import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import CardCopyPreview from "./CardCopyPreview";

function makeCard(name: string, artSkin = 0): PlayerCardData {
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

const caption = {
  playerName: "Canny",
  editionWeek: "2026-08-17",
  tier: "gold",
  foil: true,
  signed: false,
  altArt: true,
};

function renderPreview(props: Partial<React.ComponentProps<typeof CardCopyPreview>> = {}) {
  return render(
    <CardCopyPreview card={makeCard("Canny")} foil caption={caption} label="View Canny card" {...props}>
      chip
    </CardCopyPreview>,
  );
}

async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

/** The card itself, not the caption — PlayerCard3D labels its own frame. */
function renderedCards() {
  return screen.queryAllByRole("button", { name: /player card/ });
}

afterEach(cleanup);

describe("CardCopyPreview", () => {
  it("stays shut until the trigger is clicked", () => {
    renderPreview();

    const trigger = screen.getByRole("button", { name: "View Canny card" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the exact copy, with its markers in the caption", async () => {
    renderPreview();
    await click(screen.getByRole("button", { name: "View Canny card" }));

    expect(screen.getByRole("dialog", { name: "Canny — card preview" })).toBeTruthy();
    expect(renderedCards()).toHaveLength(1);
    expect(screen.getAllByText("Canny").length).toBeGreaterThan(0);
    // This copy's own foil roll holographs a Gold, which has no tier foil.
    expect(screen.getByTestId("foil")).toBeTruthy();
    expect(screen.getByText("Alt art")).toBeTruthy();
    expect(screen.getByText("✦")).toBeTruthy();
    expect(screen.getByText("WK Aug 17")).toBeTruthy();
    // The tier reads on the card's own banner as well as in the caption.
    expect(screen.getAllByText("Gold").length).toBeGreaterThan(1);
  });

  it("focuses the close button on open and hands focus back on close", async () => {
    renderPreview();
    const trigger = screen.getByRole("button", { name: "View Canny card" });
    await click(trigger);

    const close = screen.getByRole("button", { name: "Close card preview" });
    expect(document.activeElement).toBe(close);

    await click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", async () => {
    renderPreview();
    await click(screen.getByRole("button", { name: "View Canny card" }));

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a backdrop click but not on a click inside the card", async () => {
    renderPreview();
    await click(screen.getByRole("button", { name: "View Canny card" }));

    // The card flips rather than dismissing — clicks inside don't bubble out.
    await click(renderedCards()[0]);
    expect(screen.queryByRole("dialog")).toBeTruthy();

    await click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("fetches the frozen card on first open, then reuses it", async () => {
    const loadCard = vi.fn().mockResolvedValue(makeCard("Chaseworthy"));
    renderPreview({ card: null, loadCard, caption: { ...caption, playerName: "Chaseworthy" } });

    await click(screen.getByRole("button", { name: "View Canny card" }));
    expect(loadCard).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("Chaseworthy").length).toBeGreaterThan(0);

    await click(screen.getByRole("button", { name: "Close card preview" }));
    await click(screen.getByRole("button", { name: "View Canny card" }));
    // Cached: a second look costs nothing.
    expect(loadCard).toHaveBeenCalledTimes(1);
    expect(renderedCards()).toHaveLength(1);
  });

  it("says so when the copy can't be loaded", async () => {
    const loadCard = vi.fn().mockResolvedValue(null);
    renderPreview({ card: null, loadCard });

    await click(screen.getByRole("button", { name: "View Canny card" }));

    expect(screen.getByText(/couldn't be loaded/)).toBeTruthy();
    expect(renderedCards()).toHaveLength(0);
  });
});
