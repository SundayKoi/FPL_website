import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import CollectionGrid from "./CollectionGrid";

// DustControls (rendered under every player group) reaches for the router and
// the dust action; neither is exercised here.
vi.mock("@/lib/trades/actions", () => ({ dustCardAction: vi.fn() }));
// server-only transitively, same as trades/actions — mocked so jsdom can load.
vi.mock("@/lib/cards/reroll-actions", () => ({ rerollPrintAction: vi.fn() }));
// Same for the binder pin: the actions module is server-only, and the
// button's own behaviour is covered in BinderPinButton.test.tsx.
vi.mock("@/lib/binder/actions", () => ({ toggleBinderCardAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function makeCard(name: string, overall: number, artSkin: number, autograph: string | null): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall,
    // Gold has no tier foil of its own, so a data-testid="foil" layer in the
    // output can only have come from the copy's own forceFoil.
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin,
    autograph,
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

function makeRow(
  id: number,
  name: string,
  overall: number,
  editionWeek: string,
  { foil = false, signed = false, artSkin = 0, foilType = null as string | null } = {},
): InventoryRow {
  return {
    id,
    season: "S5",
    slug: name.toLowerCase(),
    playerName: name,
    role: "Mid",
    editionWeek,
    // A foil always names its parallel; the database rejects the pairing
    // otherwise, so a fixture that skipped it would not be a real row.
    foilType: foilType ?? (foil ? "prisma" : null),
    overall,
    tier: "gold",
    foil,
    signed,
    card: makeCard(name, overall, artSkin, signed ? "data:image/png;base64,ink" : null),
    packOpenId: null,
    acquiredAt: "2026-08-20T00:00:00Z",
  };
}

// Chaseworthy is owned in three distinct prints — a plain best copy and two
// foils, one of them in an alternate skin. Commonly is owned twice in the
// same print, which is exactly the case that must NOT offer a print strip.
const inventory: InventoryRow[] = [
  makeRow(1, "Chaseworthy", 92, "2026-08-17"),
  makeRow(2, "Chaseworthy", 90, "2026-08-24", { foil: true }),
  makeRow(3, "Chaseworthy", 88, "2026-08-31", { foil: true, artSkin: 12 }),
  makeRow(4, "Commonly", 62, "2026-08-17"),
  makeRow(5, "Commonly", 62, "2026-08-24"),
];

/** Every rendered card of a player — PlayerCard3D labels its frame, so this
 *  counts cards on screen rather than stray text. */
function cardsFor(name: string) {
  return screen.queryAllByRole("button", { name: new RegExp(`^${name} player card`) });
}

afterEach(cleanup);

describe("CollectionGrid binder pins", () => {
  afterEach(cleanup);

  it("pins the shelf's best copy and marks the ones already on display", () => {
    // Chaseworthy's best copy is #1; Commonly's is #4.
    render(<CollectionGrid inventory={inventory} pinnedIds={[1]} />);

    expect(screen.getByRole("button", { name: /take chaseworthy out of your binder/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /put commonly in your binder/i })).toBeTruthy();
  });

  it("treats an unpinned shelf as unpinned when the caller passes nothing", () => {
    render(<CollectionGrid inventory={inventory} />);
    const pin = screen.getByRole("button", { name: /put chaseworthy in your binder/i });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("CollectionGrid", () => {
  it("says the shelf is empty rather than rendering chips", () => {
    render(<CollectionGrid inventory={[]} />);
    expect(screen.getByText("No cards yet — open your first pack.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Variant filter" })).toBeNull();
  });

  it("counts every matching copy in its filter chip", () => {
    render(<CollectionGrid inventory={inventory} />);

    expect(screen.getByRole("button", { name: "All · 5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "✦ Foils · 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "✍ Signed · 0" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alt arts · 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All · 5" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("collapses a player to one card until a variant filter is on", () => {
    render(<CollectionGrid inventory={inventory} />);

    expect(cardsFor("Chaseworthy")).toHaveLength(1);
    expect(cardsFor("Commonly")).toHaveLength(1);
  });

  it("shows every foil COPY under the foil filter, not one card per player", () => {
    render(<CollectionGrid inventory={inventory} />);
    fireEvent.click(screen.getByRole("button", { name: "✦ Foils · 2" }));

    // Both foils belong to the same player: a per-player grid would show one.
    expect(cardsFor("Chaseworthy")).toHaveLength(2);
    expect(cardsFor("Commonly")).toHaveLength(0);
    // Each is holographed, and the alternate print says so in its caption.
    expect(screen.getAllByTestId("foil")).toHaveLength(2);
    expect(screen.getByText("Alt art")).toBeTruthy();
    expect(screen.getByText("WK Aug 24")).toBeTruthy();
    expect(screen.getByText("WK Aug 31")).toBeTruthy();
    // A display case, not a workbench.
    expect(screen.queryAllByRole("button", { name: "Manage copies" })).toHaveLength(0);
  });

  it("names the odds when a variant filter matches nothing", () => {
    render(<CollectionGrid inventory={inventory} />);
    fireEvent.click(screen.getByRole("button", { name: "✍ Signed · 0" }));

    expect(screen.getByText("No signed cards yet — 1-in-100 pulls of players who signed.")).toBeTruthy();
    expect(cardsFor("Chaseworthy")).toHaveLength(0);
  });

  it("offers a print strip only to players owned in more than one print", () => {
    render(<CollectionGrid inventory={inventory} />);

    const toggles = screen.getAllByRole("button", { name: /prints/ });
    expect(toggles).toHaveLength(1);
    expect(toggles[0].textContent).toBe("View prints (3)");
  });

  it("expands the distinct prints, deduped, alongside the shelved copy", () => {
    render(<CollectionGrid inventory={inventory} />);
    fireEvent.click(screen.getByRole("button", { name: "View prints (3)" }));

    // The shelved best copy plus one card per distinct print.
    expect(cardsFor("Chaseworthy")).toHaveLength(4);
    // Two of the three prints are foils; Commonly's two same-print copies are
    // untouched by any of this.
    expect(screen.getAllByTestId("foil")).toHaveLength(2);
    expect(screen.getByText("Alt art")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide prints" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide prints" }));
    expect(cardsFor("Chaseworthy")).toHaveLength(1);
  });

  it("keeps the dust drawer on the shelf", () => {
    render(<CollectionGrid inventory={inventory} />);

    expect(screen.getAllByRole("button", { name: "Manage copies" })).toHaveLength(2);
  });
});

describe("CollectionGrid paging", () => {
  afterEach(cleanup);

  /** 70 players, one copy each — past the 60-cell page so the button shows. */
  const many: InventoryRow[] = Array.from({ length: 70 }, (_, index) =>
    makeRow(1000 + index, `Player${String(index).padStart(2, "0")}`, 99 - index, "2026-08-24"),
  );

  it("mounts a page of the shelf rather than all of it, and says what is left", () => {
    // Every card is a 3D flip with two rendered faces. content-visibility
    // skips the PAINT for what is off screen; React still built every one.
    render(<CollectionGrid inventory={many} />);

    expect(cardsFor("Player00")).toHaveLength(1);
    expect(cardsFor("Player69")).toHaveLength(0);
    expect(screen.getByText(/60 of 70 players · 10 more/)).toBeTruthy();
  });

  it("grows a page at a time and stops offering when the shelf is out", () => {
    render(<CollectionGrid inventory={many} />);

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));

    expect(cardsFor("Player69")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("never hides anything on a shelf that fits", () => {
    render(<CollectionGrid inventory={inventory} />);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("starts a filtered shelf at the top rather than inheriting the last one", () => {
    // A different filter is a different shelf — carrying the scroll depth
    // over would show an arbitrary slice of it.
    render(<CollectionGrid inventory={many} />);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Foils ·/ }));
    fireEvent.click(screen.getByRole("button", { name: /All ·/ }));

    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });
});
