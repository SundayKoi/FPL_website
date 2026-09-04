import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import PlayerCard3D from "./PlayerCard3D";

afterEach(cleanup);

const card: PlayerCardData = {
  slug: "7gen-na1",
  name: "7gen",
  tag: "NA1",
  teamName: "Gamblers",
  teamImageUrl: "https://cdn.example/gamblers.png",
  role: "Bot",
  overall: 74,
  tier: { key: "platinum", label: "Platinum" },
  archetype: "Glass Cannon",
  signature: { champion: "Jhin", games: 4 },
  artSkin: 0,
  motto: "I fear nobody",
  serial: 4,
  collectionSize: 48,
  topChampions: [
    { champion: "Jhin", games: 4, wins: 3 },
    { champion: "Jinx", games: 2, wins: 1 },
  ],
  form: [false, true, true, true, true],
  subStats: [
    { key: "combat", label: "Combat", value: 82 },
    { key: "economy", label: "Economy", value: 61 },
    { key: "vision", label: "Vision", value: 43 },
    { key: "form", label: "Form", value: 88 },
    { key: "clutch", label: "Clutch", value: 68 },
  ],
  highlights: [{ label: "Most kills", value: "12", detail: "Jhin vs OMH" }],
  badges: [{ key: "penta", label: "Pentakiller", detail: "1 pentakill this season" }],
  standout: false,
  wins: 7,
  losses: 9,
  winratePct: 43.8,
  level: 16,
  pentas: 1,
  season: "S5",
};

describe("PlayerCard3D", () => {
  it("renders identity, tier, rating, archetype, signature, and stat bars", () => {
    render(<PlayerCard3D card={card} />);

    expect(screen.getAllByText("7gen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Platinum").length).toBeGreaterThan(0);
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText("Glass Cannon")).toBeTruthy();
    // Signature on the front, champion pool entry on the back.
    expect(screen.getAllByText("Jhin")).toHaveLength(2);
    expect(screen.getByText("Combat")).toBeTruthy();
    expect(screen.getByText("82")).toBeTruthy();
    expect(screen.getByText("PENTA ×1")).toBeTruthy();
    expect(screen.getAllByText(/7–9 · 44% WR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("LVL 16").length).toBeGreaterThan(0);
  });

  it("shows the champion pool and form on the back", () => {
    render(<PlayerCard3D card={card} />);

    // Back face content is in the DOM (flip is pure CSS rotation).
    expect(screen.getByText("Champion pool")).toBeTruthy();
    expect(screen.getByText("Jinx")).toBeTruthy();
    expect(screen.getAllByText("W")).toHaveLength(4);
    expect(screen.getAllByText("L")).toHaveLength(1);
  });

  it("flips on click when interactive", () => {
    const { container } = render(<PlayerCard3D card={card} />);
    const button = screen.getByRole("button");
    const flipLayer = container.querySelector('[style*="450ms"]') as HTMLElement;

    expect(flipLayer.style.transform).toContain("rotateY(0deg)");
    fireEvent.click(button);
    expect(flipLayer.style.transform).toContain("rotateY(180deg)");
  });

  it("keeps pointer tilt off the flip layer", () => {
    // Tilt is written straight to the DOM on the outer layer; the flip stays
    // React state on the inner one. Guarding the split: moving the pointer
    // must never disturb the face the flip animation owns.
    const { container } = render(<PlayerCard3D card={card} />);
    const button = screen.getByRole("button");
    const flipLayer = container.querySelector('[style*="450ms"]') as HTMLElement;
    const before = flipLayer.style.transform;

    fireEvent.pointerMove(button, { clientX: 40, clientY: 60 });
    fireEvent.pointerMove(button, { clientX: 120, clientY: 200 });

    expect(flipLayer.style.transform).toBe(before);
  });

  it("rests until the pointer arrives, and Eclipse never rests", () => {
    const { container } = render(<PlayerCard3D card={card} forceFoil foilType="ice" />);
    const root = container.querySelector("[data-motion]")!;
    expect(root.getAttribute("data-motion")).toBe("rest");
    const button = screen.getByRole("button");
    fireEvent.pointerEnter(button);
    expect(root.getAttribute("data-motion")).toBe("live");
    fireEvent.pointerLeave(button);
    expect(root.getAttribute("data-motion")).toBe("rest");

    cleanup();
    const eclipse = render(<PlayerCard3D card={card} forceFoil foilType="eclipse" />);
    expect(eclipse.container.querySelector("[data-motion]")!.getAttribute("data-motion")).toBe("live");
  });

  it("adds the holographic foil only for Emerald tier and above", () => {
    const { container, rerender } = render(<PlayerCard3D card={card} />);
    // Platinum: no foil.
    expect(container.querySelector('[data-testid="foil"]')).toBeNull();

    rerender(<PlayerCard3D card={{ ...card, overall: 90, tier: { key: "master", label: "Master" } }} />);
    expect(container.querySelector('[data-testid="foil"]')).toBeTruthy();
  });

  it("foils any tier when forceFoil is set", () => {
    // Pack foils are rolled independently of rarity, so a Platinum pull can
    // come out holographic even though the tier itself doesn't foil.
    const { container, rerender } = render(<PlayerCard3D card={card} />);
    expect(container.querySelector('[data-testid="foil"]')).toBeNull();

    rerender(<PlayerCard3D card={card} forceFoil />);
    expect(container.querySelector('[data-testid="foil"]')).toBeTruthy();
  });

  it("gives pack foils the pointer-driven wash that tier holos never get", () => {
    // A Master card foils by tier, but its sheen is a flat gradient. Only a
    // pack-pulled copy gets a wash that answers the pointer — that difference
    // is what makes a rolled foil read as rarer than the tier.
    const { container, rerender } = render(
      <PlayerCard3D card={{ ...card, tier: { key: "master", label: "Master" } }} />
    );
    expect(container.querySelector('[data-testid="foil"]')).toBeTruthy();
    expect(container.querySelector(".card-foil-holo")).toBeNull();

    // A Season 4 print: Season 5's foils draw as Battlecast (tested below),
    // and this test is about the ladder's own Prisma wash.
    rerender(<PlayerCard3D card={{ ...card, season: "S4" }} forceFoil />);
    expect(container.querySelector(".card-foil-holo")).toBeTruthy();
    expect(container.querySelector(".card-foil-cosmos")).toBeTruthy();
    // Two layers, not the four-way stack that read as noise: a wash and a
    // sparse star field, both gated on how far the pointer is from centre.
    expect(container.querySelectorAll('[data-testid="foil"] > *')).toHaveLength(2);
  });

  it("parallaxes the artwork on a pack foil, and leaves a tier holo's art alone", () => {
    // The art moving is the tell a tier holo structurally cannot copy: its
    // sheen is a film laid ON the splash and never shifts it.
    const { container, rerender } = render(
      <PlayerCard3D card={{ ...card, tier: { key: "master", label: "Master" } }} />
    );
    expect(container.querySelector("img.card-art-parallax")).toBeNull();

    rerender(<PlayerCard3D card={card} forceFoil />);
    expect(container.querySelector("img.card-art-parallax")).toBeTruthy();
  });

  it("leaves the artwork still — the foil moves, the splash does not", () => {
    // The art used to breathe in and out under every foil; the zoom read as
    // drift rather than shine and fought the frame it sat in.
    const { container } = render(<PlayerCard3D card={card} forceFoil />);
    expect(container.querySelector(".card-art-live")).toBeNull();
  });

  it("throws Eclipse's shadow across the art, under the name and the stat rail", () => {
    // The first cut painted the drain over everything, and the name came out
    // charcoal on black — a foil sits over a card, it does not replace it.
    // Both eclipse layers must precede the type in document order, because
    // positioned siblings at z-index auto paint in exactly that order.
    const { container } = render(<PlayerCard3D card={card} forceFoil foilType="eclipse" />);
    // Front face first; the back carries the same heading.
    const [name] = screen.getAllByRole("heading", { name: card.name });
    for (const testid of ["eclipse-desat", "eclipse-ground"]) {
      const layer = screen.getByTestId(testid);
      expect(container.contains(layer)).toBe(true);
      // FOLLOWING === the name comes after this layer, so the name is on top.
      expect(layer.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("floods totality over the type, the one layer that is allowed to", () => {
    // The drain stays under the name; the flare does not. Light crossing a
    // card crosses the whole card — that beat is the effect.
    render(<PlayerCard3D card={card} forceFoil foilType="eclipse" />);
    const [name] = screen.getAllByRole("heading", { name: card.name });
    const flare = screen.getByTestId("eclipse-flare");
    expect(flare.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("gives Eclipse its own frame and halo, over the tier's and over Card of the Week's", () => {
    // A one-of-one that renders as a Challenger card wearing a filter is not
    // a one-of-one. It outranks the standout frame too.
    const { container } = render(
      <PlayerCard3D card={{ ...card, standout: true }} forceFoil foilType="eclipse" />,
    );
    expect(container.querySelector(".card-frame-eclipse")).toBeTruthy();
    expect(container.querySelector(".card-frame-standout")).toBeNull();
    expect(container.querySelector(".card-glow-eclipse")).toBeTruthy();
    expect(container.querySelector(".card-glow-standout")).toBeNull();
  });

  it("strikes the serial into the chrome instead of a parallel name badge", () => {
    const { rerender } = render(<PlayerCard3D card={card} forceFoil foilType="eclipse" />);
    expect(screen.getByTestId("eclipse-seal").textContent).toMatch(/1 of 1/i);
    // Every other parallel keeps the ordinary name badge — and this card
    // is a Season 5 print, whose ladder is drawn as Battlecast, so the
    // badge says the line's tier rather than the ladder's name.
    rerender(<PlayerCard3D card={card} forceFoil foilType="ice" />);
    expect(screen.queryByTestId("eclipse-seal")).toBeNull();
    expect(screen.getAllByTitle("Battlecast Ultimate parallel").length).toBeGreaterThan(0);
    // A season with no line keeps the ladder's own name.
    rerender(<PlayerCard3D card={{ ...card, season: "S4" }} forceFoil foilType="ice" />);
    expect(screen.getAllByTitle(/Cracked Ice parallel/i).length).toBeGreaterThan(0);
  });

  it("draws a season line's layers on its foils, and only there", () => {
    const { container, rerender } = render(<PlayerCard3D card={card} forceFoil foilType="aurora" />);
    // Season 5, Aurora's rung: Battlecast Chroma — the line's layer, the
    // chroma modifier, and the sheen as a sibling.
    expect(container.querySelector(".card-foil-line-battlecast.card-foil-tier-chroma")).toBeTruthy();
    expect(container.querySelector(".card-foil-tier-chroma-sheen")).toBeTruthy();
    expect(container.querySelector(".card-foil-aurora")).toBeNull();
    rerender(<PlayerCard3D card={{ ...card, season: "S4" }} forceFoil foilType="aurora" />);
    expect(container.querySelector(".card-foil-line-battlecast")).toBeNull();
    expect(container.querySelector(".card-foil-aurora")).toBeTruthy();
    // A matte card in Season 5 wears nothing of the line.
    rerender(<PlayerCard3D card={card} />);
    expect(container.querySelector(".card-foil-line-battlecast")).toBeNull();
  });

  it("drives the foil off the pointer, then settles it back at rest", () => {
    const { container } = render(<PlayerCard3D card={{ ...card, season: "S4" }} forceFoil />);
    const frame = screen.getByRole("button");
    const holo = container.querySelector<HTMLElement>(".card-foil-holo")!;

    fireEvent.pointerEnter(frame);
    fireEvent.pointerMove(frame, { clientX: 40, clientY: 90 });
    // jsdom reports a zero-size rect, so the rAF write is skipped there; what
    // this pins is the release path — the ambient animation must come back.
    fireEvent.pointerLeave(frame);
    expect(holo.style.backgroundPosition).toBe("");
    // The artwork drops back to the resting scale its class carries rather
    // than being pinned at whatever offset the pointer left it on.
    expect(container.querySelector<HTMLElement>("img.card-art-parallax")!.style.transform).toBe("");
    // …and the sheen settles back to its resting strength rather than
    // staying lit at whatever the pointer left it on.
    const foil = container.querySelector<HTMLElement>('[data-testid="foil"]')!;
    expect(Number(foil.style.opacity)).toBeLessThan(0.5);
  });

  it("names the team by its abbreviation so a long name can't run under the signature", () => {
    const { container, rerender } = render(
      <PlayerCard3D card={{ ...card, teamName: "The Original Mocha House", teamAbbr: "TOM9" }} />
    );
    const identity = container.querySelector('[data-testid="card-identity"]')!;
    expect(identity.textContent).toContain("TOM9");
    expect(identity.textContent).not.toContain("The Original Mocha House");

    // Older copies were frozen before abbreviations existed — they keep the
    // full name rather than losing their team entirely.
    rerender(<PlayerCard3D card={{ ...card, teamName: "The Original Mocha House", teamAbbr: null }} />);
    expect(container.querySelector('[data-testid="card-identity"]')!.textContent).toContain(
      "The Original Mocha House"
    );
  });

  it("renders statically without a button when not interactive", () => {
    render(<PlayerCard3D card={card} interactive={false} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows season highs and badges on the back", () => {
    render(<PlayerCard3D card={card} />);
    expect(screen.getByText("Season highs")).toBeTruthy();
    expect(screen.getByText("Most kills")).toBeTruthy();
    expect(screen.getByText("Jhin vs OMH")).toBeTruthy();
    expect(screen.getByText("Pentakiller")).toBeTruthy();
  });

  it("gives the Card of the Week the molten-gold frame, role ribbon, and foil", () => {
    const { container } = render(<PlayerCard3D card={{ ...card, standout: true }} />);
    expect(screen.getByText(/Bot of the Week/i)).toBeTruthy();
    expect(container.querySelector(".card-frame-standout")).toBeTruthy();
    // Standout foils even below Emerald tier.
    expect(container.querySelector('[data-testid="foil"]')).toBeTruthy();
  });

  it("animates the top-tier frames", () => {
    const { container, rerender } = render(
      <PlayerCard3D card={{ ...card, tier: { key: "challenger", label: "Challenger" } }} />,
    );
    expect(container.querySelector(".card-frame-challenger")).toBeTruthy();

    rerender(<PlayerCard3D card={{ ...card, tier: { key: "diamond", label: "Diamond" } }} />);
    expect(container.querySelector(".card-glow-diamond")).toBeTruthy();
  });

  it("watermarks the team logo onto the front", () => {
    const { container } = render(<PlayerCard3D card={card} />);
    expect(container.querySelector('img[src="https://cdn.example/gamblers.png"]')).toBeTruthy();
  });

  it("starts face-down and flips up when revealing", () => {
    const { container } = render(<PlayerCard3D card={card} reveal />);
    const flipLayer = container.querySelector('[style*="850ms"]') as HTMLElement;
    expect(flipLayer.style.transform).toContain("rotateY(180deg)");
  });

  it("stamps the collector serial and shows the motto on the back", () => {
    render(<PlayerCard3D card={card} />);
    expect(screen.getByText("#004/48")).toBeTruthy();
    expect(screen.getByText(/I fear nobody/)).toBeTruthy();
  });

  it("hides the serial on solo builds where rank is unknown", () => {
    render(<PlayerCard3D card={{ ...card, serial: 0 }} />);
    expect(screen.queryByText(/#0*\/\d/)).toBeNull();
  });

  it("sparkles only on Challenger tier and Cards of the Week", () => {
    const { container, rerender } = render(<PlayerCard3D card={card} />);
    expect(container.querySelector('[data-testid="sparkles"]')).toBeNull();

    rerender(<PlayerCard3D card={{ ...card, tier: { key: "challenger", label: "Challenger" } }} />);
    expect(container.querySelector('[data-testid="sparkles"]')).toBeTruthy();

    rerender(<PlayerCard3D card={{ ...card, standout: true }} />);
    expect(container.querySelector('[data-testid="sparkles"]')).toBeTruthy();
  });

  it("inks the autograph and chips a signed copy on the front", () => {
    const autograph = "data:image/png;base64,AAAA";
    const { container } = render(<PlayerCard3D card={{ ...card, autograph }} />);

    const ink = container.querySelector('[data-testid="autograph"]') as HTMLImageElement;
    expect(ink).toBeTruthy();
    expect(ink.getAttribute("src")).toBe(autograph);
    expect(screen.getByText("✍ Signed")).toBeTruthy();
  });

  it("leaves an unsigned card unmarked", () => {
    // Autographs only exist on pack-frozen copies that rolled signed, so a
    // live-built card must never show ink.
    const { container } = render(<PlayerCard3D card={card} />);
    expect(container.querySelector('[data-testid="autograph"]')).toBeNull();
    expect(screen.queryByText("✍ Signed")).toBeNull();
  });

  it("walks the art fallback chain: centered skin → splash skin → base art", () => {
    // Riot's centered directory is missing for plenty of valid skins, and
    // the regular splash of the same skin is a far better answer than
    // dropping the player back to base art.
    const { container } = render(<PlayerCard3D card={{ ...card, artSkin: 64 }} />);
    const art = container.querySelector('img[src*="/champion/"]') as HTMLImageElement;

    expect(art.getAttribute("src")).toContain("/centered/Jhin_64.jpg");
    fireEvent.error(art);
    expect(art.getAttribute("src")).toContain("/splash/Jhin_64.jpg");
    fireEvent.error(art);
    expect(art.getAttribute("src")).toContain("/centered/Jhin_0.jpg");
    // End of the chain — a further error must not restart it.
    fireEvent.error(art);
    expect(art.getAttribute("src")).toContain("/centered/Jhin_0.jpg");
  });

  it("does not retry the same url twice for a base-art card", () => {
    const { container } = render(<PlayerCard3D card={card} />);
    const art = container.querySelector('img[src*="/champion/"]') as HTMLImageElement;

    expect(art.getAttribute("src")).toContain("/centered/Jhin_0.jpg");
    fireEvent.error(art);
    expect(art.getAttribute("src")).toContain("/splash/Jhin_0.jpg");
    fireEvent.error(art);
    expect(art.getAttribute("src")).toContain("/splash/Jhin_0.jpg");
  });

  it("renders the pedestal bloom only when asked", () => {
    const { container, rerender } = render(<PlayerCard3D card={card} />);
    expect(container.querySelector(".blur-3xl")).toBeNull();

    rerender(<PlayerCard3D card={card} bloom />);
    expect(container.querySelector(".blur-3xl")).toBeTruthy();
  });
});

describe("a moment sits the same size as the cards beside it", () => {
  /** A pulled moment copy, as card_inventory stores one. */
  const momentCard = {
    ...card,
    moment: {
      id: 7,
      weekStart: "2026-08-24",
      playerSlug: "x80hdgraphicsx",
      summonerName: "X80HDgraphicsX",
      teamName: "Astronauts",
      champion: "Naafiri",
      title: "The Steal",
      headline: "1 objective stolen · 4/0/9",
    },
  } as unknown as typeof card;

  /** The element that actually carries the card's footprint. */
  const frame = (root: HTMLElement) => root.querySelector("[class*='aspect-']") as HTMLElement;

  it("no longer caps its own width", () => {
    // The plate used to pin itself to 16rem, which is right on the moments
    // wall (a flex row, where uncapped it would stretch the whole line) and
    // wrong in a grid of player cards, where it came out visibly smaller
    // than everything around it.
    const { container } = render(<PlayerCard3D card={momentCard} />);

    expect(frame(container).className).not.toMatch(/max-w-/);
  });

  it("shares the player card's width and aspect ratio", () => {
    // Same aspect ratio means matching the width matches the height too.
    const moment = render(<PlayerCard3D card={momentCard} />);
    const player = render(<PlayerCard3D card={card} />);

    for (const cls of ["w-full", "aspect-[5/7]"]) {
      expect(frame(moment.container).className).toContain(cls);
      expect(frame(player.container).className).toContain(cls);
    }
  });

  it("honours a className the call site sets, as a player card does", () => {
    // Dropping it was the second half of the bug: any call site sizing a
    // card was silently ignored for moments. It rides the outer shell now,
    // exactly where the player card carries it.
    const { container } = render(<PlayerCard3D card={momentCard} className="max-w-[18rem]" />);

    expect((container.firstChild as HTMLElement).className).toContain("max-w-[18rem]");
  });

  it("renders a roster plate in the same 20rem shell as every other card", () => {
    // The bug this pins: the plate's shell was `w-full max-w-[20rem]`, and
    // the card grids are flex, so it had no intrinsic width to resolve
    // against and collapsed to a thumbnail beside full-size player cards.
    const teamCard = {
      ...card,
      team: {
        teamName: "Iron Wolves Gaming",
        abbr: "IWG",
        imageUrl: null,
        monogram: "IWG",
        bannerColor: "#c8102e",
        overall: 78,
        tierKey: "platinum",
        tierLabel: "Platinum",
        weekStart: "2026-08-24",
        slots: [
          { role: "Top", name: "Alba", slug: "alba", overall: 80, champion: "Ornn", standout: false, autograph: null },
          { role: "Jungle", name: "Bo", slug: "bo", overall: 78, champion: "Lee Sin", standout: false, autograph: null },
          { role: "Mid", name: "Ciivil", slug: "ciivil", overall: 79, champion: "Ahri", standout: false, autograph: null },
          { role: "Bot", name: "Dee", slug: "dee", overall: 77, champion: "Jhin", standout: false, autograph: null },
          { role: "Support", name: "Eve", slug: "eve", overall: 76, champion: "Thresh", standout: false, autograph: null },
        ],
      },
    } as unknown as typeof card;
    const { container } = render(<PlayerCard3D card={teamCard} />);

    expect((container.firstChild as HTMLElement).style.width).toBe("20rem");
    // The tag, not the name — five panels is no room for "Iron Wolves Gaming".
    expect(container.textContent).toContain("IWG");
    expect(container.textContent).toContain("Ciivil");
  });

  it("renders a champions card as the Hand, in the same 20rem shell", () => {
    const champCard = {
      ...card,
      champWin: {
        rank: "Q",
        setIndex: 3,
        setSize: 5,
        team: "Faceless",
        seasonWon: "S4",
        champion: "Aurelion Sol",
        joker: false,
      },
      name: "Shanedata",
      teamImageUrl: null,
    } as unknown as typeof card;
    const { container } = render(<PlayerCard3D card={champCard} />);

    expect((container.firstChild as HTMLElement).style.width).toBe("20rem");
    expect(container.textContent).toContain("FACELESS");
    expect(container.textContent).toContain("Shanedata");
    expect(container.textContent).toContain("Aurelion Sol · most played");
    // The real splash rides behind the felt.
    expect(container.querySelector("img")?.getAttribute("src")).toContain("AurelionSol");
    // No team logo on file -> the spade pip holds the center.
    expect(container.querySelector(".champ-pipwrap")).toBeTruthy();
  });

  it("seats the team's logo above the wordmark when one exists", () => {
    const champCard = {
      ...card,
      champWin: {
        rank: "K",
        setIndex: 1,
        setSize: 5,
        team: "Faceless",
        seasonWon: "S4",
        champion: "Cho'Gath",
        joker: false,
      },
      name: "king of spades",
      teamImageUrl: "https://cdn.example/faceless.png",
      // A rolled alternate print — the relic must wear it, not base splash.
      artSkin: 3,
    } as unknown as typeof card;
    const { container } = render(<PlayerCard3D card={champCard} />);

    expect(container.querySelector(".champ-logo")?.getAttribute("src")).toBe("https://cdn.example/faceless.png");
    const splashes = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "");
    expect(splashes.some((src) => src.endsWith("Chogath_3.jpg"))).toBe(true);
    // The logo replaces the pip, never stacks on it.
    expect(container.querySelector(".champ-pipwrap")).toBeNull();
    // The ember layer rides every champions card, logo or not.
    expect(container.querySelector('[data-testid="champ-embers"]')).not.toBeNull();
  });

  it("wraps itself in the player card's exact 20rem shell", () => {
    // The plate alone is width-less: in a content-sized flex cell it took
    // its width from its caption, and in a fractional grid column it
    // overfilled. The fixed shell is what makes moments and player cards
    // agree in EVERY container, not per-callsite.
    const moment = render(<PlayerCard3D card={momentCard} />);
    const player = render(<PlayerCard3D card={card} />);

    expect((moment.container.firstChild as HTMLElement).style.width).toBe("20rem");
    expect((player.container.firstChild as HTMLElement).style.width).toBe("20rem");
  });
});

describe("gyroscope tilt", () => {
  /** Fires a deviceorientation event the way a phone being tilted would. */
  function tiltPhone(beta = 70, gamma = 20) {
    const event = new Event("deviceorientation") as Event & { beta: number; gamma: number };
    event.beta = beta;
    event.gamma = gamma;
    fireEvent(window, event);
  }

  it("ignores the gyroscope unless a surface opts in", () => {
    // A 50-card grid must not have 50 cards listening to one global event:
    // every card tilted at once, and the whole gallery wobbled in unison.
    render(<PlayerCard3D card={card} />);
    const frame = screen.getByRole("button");
    const before = frame.style.transform;

    tiltPhone();

    expect(frame.style.transform).toBe(before);
  });

  it("tilts to the phone's angle when a single-card surface opts in", () => {
    render(<PlayerCard3D card={card} gyro />);
    const frame = screen.getByRole("button");
    const before = frame.style.transform;

    tiltPhone();

    expect(frame.style.transform).not.toBe(before);
    expect(frame.style.transform).toMatch(/rotate[XY]\(/);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = render(<PlayerCard3D card={card} gyro />);
    unmount();
    // Nothing to assert on the detached node beyond not throwing: the guard
    // is that a stale listener writing to a removed card would crash here.
    expect(() => tiltPhone()).not.toThrow();
  });
});

describe("iOS motion permission", () => {
  const OriginalDOE = window.DeviceOrientationEvent;

  afterEach(() => {
    window.DeviceOrientationEvent = OriginalDOE;
  });

  /** Stands in for iOS's DeviceOrientationEvent, which carries a STATIC
   *  requestPermission and rejects being called detached from it. */
  function stubIOS(outcome: "granted" | "denied" = "granted") {
    const calls: { boundCorrectly: boolean }[] = [];
    function FakeDOE() {}
    FakeDOE.requestPermission = function requestPermission(this: unknown) {
      // Apple's implementation throws when `this` isn't the constructor.
      calls.push({ boundCorrectly: this === FakeDOE });
      if (this !== FakeDOE) throw new TypeError("Illegal invocation");
      return Promise.resolve(outcome);
    };
    // @ts-expect-error swapping the jsdom global for the iOS-shaped one
    window.DeviceOrientationEvent = FakeDOE;
    return calls;
  }

  it("asks iOS for motion access without losing `this`", async () => {
    // The bug: requestPermission was pulled off the constructor and called
    // bare, which throws Illegal invocation on a real iPhone — and the
    // rejection was swallowed, so no prompt ever appeared and nothing said why.
    const calls = stubIOS("granted");
    render(<PlayerCard3D card={card} gyro />);

    fireEvent.click(screen.getByRole("button"));
    await Promise.resolve();

    expect(calls).toHaveLength(1);
    expect(calls[0].boundCorrectly).toBe(true);
  });

  it("asks only once, however many times the card is tapped", async () => {
    const calls = stubIOS("granted");
    render(<PlayerCard3D card={card} gyro />);
    const frame = screen.getByRole("button");

    fireEvent.click(frame);
    fireEvent.click(frame);
    fireEvent.click(frame);
    await Promise.resolve();

    expect(calls).toHaveLength(1);
  });
});

describe("the Patron Flame on a card", () => {
  it("never sits inside a clipping layer — a ring outside the clip box vanishes", () => {
    // The regression that shipped: the flame orbits 6px OUTSIDE the card,
    // and its first home was inside a face styled overflow-hidden — which
    // clipped the entire ring into nonexistence while every existence
    // check here stayed green.
    const { container } = render(<PlayerCard3D card={card} flame="ember" />);

    let node = container.querySelector("[data-testid='patron-flame']")?.parentElement ?? null;
    while (node && node !== container) {
      expect(node.className).not.toContain("overflow-hidden");
      node = node.parentElement;
    }
  });

  it("burns on a copy whose owner is a patron", () => {
    const { container } = render(<PlayerCard3D card={card} flame="frostfire" />);

    const layer = container.querySelector("[data-testid='patron-flame']") as HTMLElement;
    expect(layer).toBeTruthy();
    // Three sparks lapping the ring, plus the dashed ring itself.
    expect(layer.querySelectorAll(".patron-flame-spark")).toHaveLength(3);
    expect(layer.style.getPropertyValue("--flame-core")).toBe("#35b5ff");
  });

  it("does not burn without a flame — shared surfaces pass nothing", () => {
    const { container } = render(<PlayerCard3D card={card} />);

    expect(container.querySelector("[data-testid='patron-flame']")).toBeNull();
  });

  it("leaves the tier frame untouched underneath", () => {
    // A layer, never a frame swap: the card's own aria still names its tier,
    // and the flame element carries no tier styling of its own.
    render(<PlayerCard3D card={card} flame="ember" />);

    expect(screen.getByRole("button", { name: /platinum/i })).toBeTruthy();
  });

  it("burns on a moment copy too — the flame marks the owner", () => {
    const momentCard = {
      ...card,
      moment: {
        id: 7, weekStart: "2026-08-24", playerSlug: "x", summonerName: "X",
        teamName: null, champion: null, title: "The Steal", headline: "h",
      },
    } as unknown as typeof card;
    const { container } = render(<PlayerCard3D card={momentCard} flame="royal" />);

    expect(container.querySelector("[data-testid='patron-flame']")).toBeTruthy();
  });
});

describe("provenance stamps", () => {
  it("marks a copy opened during a Live Drops window", () => {
    const liveCard = { ...card, live: { label: "Week 3 broadcast" } } as typeof card;
    const { container } = render(<PlayerCard3D card={liveCard} />);

    const stamp = container.querySelector("[data-testid='live-stamp']");
    expect(stamp?.getAttribute("title")).toContain("Week 3 broadcast");
  });

  it("marks the copy that took the week's chase", () => {
    const chaseCard = { ...card, chase: { title: "Any foil Naafiri" } } as typeof card;
    const { container } = render(<PlayerCard3D card={chaseCard} />);

    expect(container.querySelector("[data-testid='chase-stamp']")).toBeTruthy();
  });

  it("stamps nothing on an ordinary copy", () => {
    const { container } = render(<PlayerCard3D card={card} />);

    expect(container.querySelector("[data-testid='live-stamp']")).toBeNull();
    expect(container.querySelector("[data-testid='chase-stamp']")).toBeNull();
  });

  it("draws an expedition mutation over the front only when asked", () => {
    const { unmount } = render(<PlayerCard3D card={card} interactive={false} />);
    expect(screen.queryByTestId("mutation")).toBeNull();
    unmount();

    render(
      <PlayerCard3D
        card={card}
        interactive={false}
        mutation={{ label: "Irradiated", className: "card-mut-irradiated", accent: "#8cff3c" }}
      />,
    );
    const layer = screen.getByTestId("mutation");
    expect(layer.querySelector(".card-mut-irradiated")).toBeTruthy();
    expect(layer.textContent).toContain("Irradiated");
  });

  it("draws the mutation a minted copy wears, over any preview prop", () => {
    render(
      <PlayerCard3D
        card={{ ...card, mutation: { key: "cursed", date: "2026-09-01", run: 12 } }}
        interactive={false}
        mutation={{ label: "Irradiated", className: "card-mut-irradiated", accent: "#8cff3c" }}
      />,
    );
    const layer = screen.getByTestId("mutation");
    expect(layer.querySelector(".card-mut-cursed")).toBeTruthy();
    expect(layer.querySelector(".card-mut-cursed-sigil")).toBeTruthy();
    expect(layer.querySelector(".card-mut-irradiated")).toBeNull();
    expect(layer.textContent).toContain("Cursed");
  });

  it("wears a wounded chip while benched, and not after", () => {
    const { unmount } = render(
      <PlayerCard3D card={{ ...card, wounded: { until: new Date(Date.now() + 3_600_000).toISOString(), run: 1 } }} interactive={false} />,
    );
    expect(screen.getByTestId("wounded").textContent).toBe("Wounded");
    unmount();

    render(<PlayerCard3D card={{ ...card, wounded: { until: "2020-01-01T00:00:00.000Z", run: 1 } }} interactive={false} />);
    expect(screen.queryByTestId("wounded")).toBeNull();
  });
});
