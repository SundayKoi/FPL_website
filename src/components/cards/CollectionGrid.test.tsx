import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import CollectionGrid from "./CollectionGrid";

// DustControls (rendered under every player group) reaches for the router and
// the dust action; neither is exercised here.
const { dustManyAction } = vi.hoisted(() => ({ dustManyAction: vi.fn() }));
vi.mock("@/lib/trades/actions", () => ({ dustCardAction: vi.fn(), dustManyAction }));
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
  {
    foil = false,
    signed = false,
    artSkin = 0,
    foilType = null as string | null,
    printNumber = null as number | null,
  } = {},
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
    printNumber,
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
    // The week picker lists the same labels as options; the captions are
    // the ones that are not.
    const caption = (label: string) => screen.getAllByText(label).filter((node) => node.tagName !== "OPTION");
    expect(caption("WK Aug 24")).toHaveLength(1);
    expect(caption("WK Aug 31")).toHaveLength(1);
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

describe("CollectionGrid print numbers", () => {
  // Two copies of the same player from different weeks: different prints,
  // so different denominators — which is the thing a single counter would
  // get wrong.
  const numbered: InventoryRow[] = [
    makeRow(1, "Chaseworthy", 92, "2026-08-17", { foil: true, printNumber: 7 }),
    makeRow(2, "Chaseworthy", 90, "2026-08-24", { foil: true, printNumber: 2 }),
  ];
  const printRuns = new Map([
    ["2026-08-17|chaseworthy", 43],
    ["2026-08-24|chaseworthy", 3],
  ]);

  it("stamps each copy against its OWN print's total", () => {
    render(<CollectionGrid inventory={numbered} printRuns={printRuns} />);
    fireEvent.click(screen.getByRole("button", { name: "✦ Foils · 2" }));

    expect(screen.getByText("#7 of 43")).toBeTruthy();
    expect(screen.getByText("#2 of 3")).toBeTruthy();
  });

  it("says nothing at all when the page never read the counters", () => {
    render(<CollectionGrid inventory={numbered} />);
    fireEvent.click(screen.getByRole("button", { name: "✦ Foils · 2" }));

    // A serial with no denominator is a number nobody can read, so the chip
    // is absent rather than half-written.
    expect(screen.queryByText(/^#\d+ of/)).toBeNull();
  });

  it("says nothing for a copy minted before numbering existed", () => {
    render(
      <CollectionGrid
        inventory={[makeRow(3, "Chaseworthy", 92, "2026-08-17", { foil: true })]}
        printRuns={printRuns}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "✦ Foils · 1" }));

    expect(screen.queryByText(/^#\d+ of/)).toBeNull();
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


describe("CollectionGrid select-to-dust", () => {
  afterEach(() => {
    cleanup();
    dustManyAction.mockReset();
  });

  /** Enter select mode and hand back every pickable copy cell. */
  function enterSelectMode(props: Partial<Parameters<typeof CollectionGrid>[0]> = {}) {
    render(<CollectionGrid inventory={inventory} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Select to dust" }));
  }

  it("shows every COPY, not one card per player", () => {
    // The point of the mode is clearing duplicates, and a duplicate is a
    // copy. The collapsed shelf shows two players; select mode shows five
    // cards, because there are five cards.
    enterSelectMode();
    expect(cardsFor("Chaseworthy")).toHaveLength(3);
    expect(cardsFor("Commonly")).toHaveLength(2);
  });

  it("adds up only what is ticked", () => {
    enterSelectMode();
    expect(screen.getByText("0 selected")).toBeTruthy();

    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    expect(screen.getByText("1 selected")).toBeTruthy();
    // Two gold copies of the same print are worth the same, so ticking the
    // second doubles the total rather than guessing at it.
    const oneCard = screen.getByRole("button", { name: /^Dust selected/ }).textContent;
    fireEvent.click(cardsFor("Commonly")[1].closest("button[aria-pressed]")!);
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Dust selected/ }).textContent).not.toBe(oneCard);
  });

  it("takes two taps, and sends exactly the ticked ids", async () => {
    dustManyAction.mockResolvedValue({ ok: true, dusted: 1, value: 10, balance: 1010, skipped: 0 });
    enterSelectMode();

    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    fireEvent.click(screen.getByRole("button", { name: /^Dust selected/ }));
    // Armed, not fired — there is no undo on the other side of this.
    expect(dustManyAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Dust 1 — sure?" })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dust 1 — sure?" }));
    });
    expect(dustManyAction).toHaveBeenCalledTimes(1);
    expect(dustManyAction.mock.calls[0][0]).toHaveLength(1);
  });

  it("stands the confirm down when the selection changes under it", () => {
    enterSelectMode();
    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    fireEvent.click(screen.getByRole("button", { name: /^Dust selected/ }));
    expect(screen.getByRole("button", { name: "Dust 1 — sure?" })).toBeTruthy();

    fireEvent.click(cardsFor("Commonly")[1].closest("button[aria-pressed]")!);
    expect(screen.queryByRole("button", { name: /sure\?/ })).toBeNull();
  });

  it("refuses to tick a copy that is out on an expedition", () => {
    enterSelectMode({ deployedIds: new Set([4]) });
    const away = cardsFor("Commonly")[0].closest("button[aria-pressed]") as HTMLButtonElement;
    expect(away.disabled).toBe(true);
    fireEvent.click(away);
    expect(screen.getByText("0 selected")).toBeTruthy();
    expect(screen.getByText("On expedition")).toBeTruthy();
  });

  it("says what the server refused instead of pretending it worked", async () => {
    dustManyAction.mockResolvedValue({ ok: true, dusted: 1, value: 10, balance: 1010, skipped: 1 });
    enterSelectMode();
    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    fireEvent.click(cardsFor("Commonly")[1].closest("button[aria-pressed]")!);
    fireEvent.click(screen.getByRole("button", { name: /^Dust selected/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dust 2 — sure?" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("1 couldn't be sold");
  });

  it("surfaces a refusal and keeps the selection", async () => {
    dustManyAction.mockResolvedValue({ ok: false, error: "Those cards aren't yours." });
    enterSelectMode();
    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    fireEvent.click(screen.getByRole("button", { name: /^Dust selected/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dust 1 — sure?" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("Those cards aren't yours.");
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("leaves the shelf exactly as it was on cancel", () => {
    enterSelectMode();
    fireEvent.click(cardsFor("Commonly")[0].closest("button[aria-pressed]")!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // Back to one card per player, and the selection is gone rather than
    // waiting to be committed the next time the mode is opened.
    expect(cardsFor("Chaseworthy")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Select to dust" }));
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("narrows with the variant chips, so 'dust my spare foils' is two taps", () => {
    enterSelectMode();
    fireEvent.click(screen.getByRole("button", { name: /Foils · / }));
    expect(cardsFor("Chaseworthy")).toHaveLength(2);
    expect(cardsFor("Commonly")).toHaveLength(0);
  });
});

describe("a one-of-one on the shelf", () => {
  // The first Eclipse ever pulled stacked behind a signed Prisma of the same
  // player and showed as "×2" — the print key was skin/foil/signed, and an
  // Eclipse is, technically, a signed foil. The opposite of what it is.
  const shelf = [
    makeRow(1, "Chaseworthy", 92, "2026-08-17", { foil: true, foilType: "prisma", signed: true }),
    makeRow(2, "Chaseworthy", 90, "2026-08-24", { foil: true, foilType: "eclipse", signed: true }),
  ];

  it("is its own print, and the copy the shelf shows", () => {
    render(<CollectionGrid inventory={shelf} />);
    // One shelf card for the player — and it is the Eclipse, not the
    // higher-rated signed Prisma the old ranking would have put on top.
    const card = cardsFor("Chaseworthy");
    expect(card).toHaveLength(1);
    expect(card[0].getAttribute("aria-label")).toMatch(/Eclipse foil/);
    expect(screen.getByText("◐ 1 of 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View prints (2)" })).toBeTruthy();
  });

  it("cannot be ticked for dust, and says so in place of a price", () => {
    render(<CollectionGrid inventory={shelf} />);
    fireEvent.click(screen.getByRole("button", { name: "Select to dust" }));
    const cells = cardsFor("Chaseworthy").map((node) => node.closest("button[aria-pressed]") as HTMLButtonElement);
    const eclipse = cells.find((cell) => cell.textContent?.includes("1 of 1"))!;
    expect(eclipse.disabled).toBe(true);
    expect(eclipse.textContent).toContain("Can't be dusted");
    expect(eclipse.textContent).not.toMatch(/\+\$/);
    fireEvent.click(eclipse);
    expect(screen.getByText("0 selected")).toBeTruthy();
  });

  it("names a parallel on its chip instead of a bare ✦", () => {
    render(<CollectionGrid inventory={[makeRow(3, "Chaseworthy", 88, "2026-08-31", { foil: true, foilType: "ice" })]} />);
    expect(screen.getByText("Cracked Ice")).toBeTruthy();
  });
});

describe("finding a card on the shelf", () => {
  const shelf = [
    makeRow(1, "Chaseworthy", 92, "2026-08-17"),
    makeRow(2, "Commonly", 60, "2026-08-24"),
    makeRow(3, "Bystander", 75, "2026-08-24", { foil: true, foilType: "prisma" }),
  ];

  it("narrows by part of a name, case-blind, and says how many are left", () => {
    render(<CollectionGrid inventory={shelf} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search your cards" }), { target: { value: "COMM" } });
    expect(cardsFor("Commonly")).toHaveLength(1);
    expect(cardsFor("Chaseworthy")).toHaveLength(0);
    expect(screen.getByText("1 of 3 copies")).toBeTruthy();
  });

  it("narrows to one edition week, and the variant counts follow", () => {
    render(<CollectionGrid inventory={shelf} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Week" }), { target: { value: "2026-08-24" } });
    expect(cardsFor("Chaseworthy")).toHaveLength(0);
    expect(cardsFor("Bystander")).toHaveLength(1);
    // The foil chip counts only what the week shows.
    expect(screen.getByRole("button", { name: /Foils · 1/ })).toBeTruthy();
  });

  it("says so when nothing matches, instead of an empty wall", () => {
    render(<CollectionGrid inventory={shelf} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search your cards" }), { target: { value: "zzz" } });
    expect(screen.getByText(/Nothing on your shelf matches “zzz”/)).toBeTruthy();
  });

  it("orders the shelf by name, rating, or edition on request", () => {
    render(<CollectionGrid inventory={shelf} />);
    const names = () =>
      screen
        .getAllByRole("button", { name: /player card/ })
        .map((node) => node.getAttribute("aria-label")?.split(" player card")[0]);
    // Default: best first — by rating here, since nothing is signed or one-of-one.
    expect(names()).toEqual(["Chaseworthy", "Bystander", "Commonly"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "name" } });
    expect(names()).toEqual(["Bystander", "Chaseworthy", "Commonly"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort" }), { target: { value: "week" } });
    // Newest edition first; ties fall back to the showcase order.
    expect(names()).toEqual(["Bystander", "Commonly", "Chaseworthy"]);
  });
});
