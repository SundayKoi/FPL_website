import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import DustControls, { type DustCopy } from "./DustControls";

const { dustCardAction } = vi.hoisted(() => ({ dustCardAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ dustCardAction }));
// server-only transitively, same as trades/actions — mocked so jsdom can load.
vi.mock("@/lib/cards/reroll-actions", () => ({ rerollPrintAction: vi.fn() }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** The frozen print each row now shows. artSkin is what makes two copies of
 *  one player look different, so it's the interesting knob here. */
function makeCard(tier: string, artSkin: number, signature: string | null = "Jhin"): PlayerCardData {
  return {
    slug: "chaseworthy-na1",
    name: "Chaseworthy",
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall: 88,
    tier: { key: tier as PlayerCardData["tier"]["key"], label: tier.charAt(0).toUpperCase() + tier.slice(1) },
    archetype: "Playmaker",
    signature: signature ? { champion: signature, games: 12 } : null,
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

// One of each thing the value table cares about: a plain common, a foil
// epic, and the signed legendary nobody should ever dust. The foil is also
// the one in an alternate skin — the case where a thumbnail earns its place.
const copies: DustCopy[] = [
  { id: 1, tier: "silver", foil: false, signed: false, editionWeek: "2026-08-17", card: makeCard("silver", 0) },
  { id: 2, tier: "diamond", foil: true, signed: false, editionWeek: "2026-08-24", card: makeCard("diamond", 64) },
  { id: 3, tier: "challenger", foil: false, signed: true, editionWeek: "2026-08-31", card: makeCard("challenger", 0) },
];

function open() {
  const result = render(<DustControls playerName="Chaseworthy" copies={copies} />);
  fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));
  return result;
}

/** The inline print thumbnails, in row order. */
function thumbs(container: HTMLElement) {
  return [...container.querySelectorAll('img[src*="/champion/"]')] as HTMLImageElement[];
}

/** Click and let the (mocked, already-resolved) server action settle. */
async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  dustCardAction.mockReset().mockResolvedValue({ ok: true, value: 10, balance: 1010 });
  refresh.mockReset();
});

afterEach(cleanup);

describe("DustControls", () => {
  it("keeps the drawer shut until asked", () => {
    render(<DustControls playerName="Chaseworthy" copies={copies} />);

    expect(screen.queryByText(/Dust ·/)).toBeNull();
    expect(screen.getByRole("button", { name: "Manage copies" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("lists every copy with its edition, tier and dust value", () => {
    open();

    // silver = common $10; diamond = epic $60 doubled for foil; challenger =
    // legendary $150 plus the flat $1,200 autograph bonus.
    expect(screen.getByText("Dust · $10")).toBeTruthy();
    expect(screen.getByText("Dust · $120")).toBeTruthy();
    expect(screen.getByText("Dust · $1,350")).toBeTruthy();

    expect(screen.getByText("WK Aug 17")).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByText("✍")).toBeTruthy();
    expect(screen.getByText("✦")).toBeTruthy();
  });

  it("needs two clicks and then dusts exactly once", async () => {
    open();

    await click(screen.getByText("Dust · $120"));
    expect(dustCardAction).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm $120?")).toBeTruthy();

    await click(screen.getByText("Confirm $120?"));
    expect(dustCardAction).toHaveBeenCalledTimes(1);
    expect(dustCardAction).toHaveBeenCalledWith(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    // disarmed again — the button is back to its resting label
    expect(screen.getByText("Dust · $120")).toBeTruthy();
  });

  it("disarms a primed copy when a different one is clicked", async () => {
    open();

    await click(screen.getByText("Dust · $1,350"));
    expect(screen.getByText("Confirm $1,350?")).toBeTruthy();

    await click(screen.getByText("Dust · $10"));
    expect(screen.queryByText("Confirm $1,350?")).toBeNull();
    expect(screen.getByText("Confirm $10?")).toBeTruthy();
    expect(dustCardAction).not.toHaveBeenCalled();
  });

  it("shows each row the art its own copy printed in", () => {
    const { container } = open();

    const srcs = thumbs(container).map((img) => img.getAttribute("src"));
    expect(srcs).toHaveLength(3);
    // The alternate-skin copy is the whole point: its row can't look like
    // the two base-art rows around it.
    expect(srcs[1]).toContain("/centered/Jhin_64.jpg");
    expect(srcs[0]).toContain("/centered/Jhin_0.jpg");
  });

  it("falls a thumbnail back to the regular splash before dropping it", () => {
    const { container } = open();

    const thumb = thumbs(container).find((img) => img.getAttribute("src")?.includes("_64")) as HTMLImageElement;
    fireEvent.error(thumb);
    expect(thumb.getAttribute("src")).toContain("/splash/Jhin_64.jpg");

    // Neither directory has it: the row loses its thumb rather than showing
    // a broken image next to a destroy button.
    fireEvent.error(thumb);
    expect(thumbs(container)).toHaveLength(2);
  });

  it("opens the exact copy full-size from its row", async () => {
    open();

    expect(screen.getAllByRole("button", { name: /^Look at the / })).toHaveLength(3);
    await click(screen.getByRole("button", { name: "Look at the WK Aug 24 Diamond copy of Chaseworthy" }));

    expect(screen.getByRole("dialog", { name: "Chaseworthy — card preview" })).toBeTruthy();
    // Its own foil roll and alternate print, not the player's best copy.
    expect(screen.getByTestId("foil")).toBeTruthy();
    expect(screen.getByText("Alt art")).toBeTruthy();
    // Looking is not arming: the dust button is untouched by the preview.
    expect(screen.getByText("Dust · $120")).toBeTruthy();
    expect(dustCardAction).not.toHaveBeenCalled();
  });

  it("won't melt a copy that's out on an expedition", () => {
    render(<DustControls playerName="Chaseworthy" copies={copies} deployedIds={new Set([2])} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));

    const away = screen.getByRole("button", { name: "Dust the WK Aug 24 Diamond copy of Chaseworthy" });
    expect((away as HTMLButtonElement).disabled).toBe(true);
    expect(away.getAttribute("title")).toBe("On expedition — back soon.");
    // The row says why instead of quoting a price it can't honour.
    expect(away.textContent).toBe("On expedition");
    expect(screen.queryByText("Dust · $120")).toBeNull();

    // Only that copy — the two at home still melt.
    expect(screen.getByText("Dust · $10")).toBeTruthy();
    expect(screen.getByText("Dust · $1,350")).toBeTruthy();
  });

  it("surfaces the action's error and doesn't refresh", async () => {
    dustCardAction.mockResolvedValue({ ok: false, error: "That card is fielded in this week's lineup." });
    open();

    await click(screen.getByText("Dust · $10"));
    await click(screen.getByText("Confirm $10?"));

    expect(screen.getByText("That card is fielded in this week's lineup.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("a one-of-one in the drawer", () => {
  // The first Eclipse ever pulled showed "Dust · $2,190" under it. The
  // server would have refused — dust_card raises for an Eclipse — but a
  // price on a button reads as an offer, and the holder had no way to know
  // it was one the ledger would never honour.
  it("offers no price and cannot be pressed", () => {
    render(
      <DustControls
        playerName="Chaseworthy"
        copies={[
          { id: 9, tier: "master", foil: true, foilType: "eclipse", signed: true, editionWeek: "2026-08-24", card: makeCard("master", 0) },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));
    const button = screen.getByRole("button", { name: /Dust the .* copy of Chaseworthy/ });
    expect(button.textContent).toBe("1 of 1");
    expect(button).toHaveProperty("disabled", true);
    expect(screen.queryByText(/Dust · /)).toBeNull();
  });
});

describe("what a copy can go and do", () => {
  it("offers Sell, Trade, Send out and Field, each landing with the copy chosen", () => {
    render(<DustControls playerName="Chaseworthy" copies={copies} base="/academy/cards" />);
    fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));
    const menu = screen.getAllByText("Use ▾")[0].closest("details")!;
    const hrefs = [...menu.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(hrefs).toEqual([
      ["Sell", "/academy/cards/market?sell=1"],
      ["Trade", "/academy/cards/trades?offer=1"],
      ["Send out", "/academy/cards/expeditions?send=1"],
      ["Field", "/academy/cards/fantasy?field=1"],
    ]);
  });

  it("offers nothing for a copy that is away", () => {
    render(<DustControls playerName="Chaseworthy" copies={copies} deployedIds={new Set([1, 2, 3])} />);
    fireEvent.click(screen.getByRole("button", { name: "Manage copies" }));
    expect(screen.queryByText("Use ▾")).toBeNull();
  });
});
