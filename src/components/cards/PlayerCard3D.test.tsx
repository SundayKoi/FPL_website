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

    rerender(<PlayerCard3D card={card} forceFoil />);
    expect(container.querySelector(".card-foil-holo")).toBeTruthy();
    // Exactly one moving layer: the earlier stack of grating + glitter +
    // sweep all animating at once read as noise rather than shine.
    expect(container.querySelectorAll('[data-testid="foil"] > *')).toHaveLength(1);
  });

  it("leaves the artwork still — the foil moves, the splash does not", () => {
    // The art used to breathe in and out under every foil; the zoom read as
    // drift rather than shine and fought the frame it sat in.
    const { container } = render(<PlayerCard3D card={card} forceFoil />);
    expect(container.querySelector(".card-art-live")).toBeNull();
  });

  it("drives the foil off the pointer, then settles it back at rest", () => {
    const { container } = render(<PlayerCard3D card={card} forceFoil />);
    const frame = screen.getByRole("button");
    const holo = container.querySelector<HTMLElement>(".card-foil-holo")!;

    fireEvent.pointerEnter(frame);
    fireEvent.pointerMove(frame, { clientX: 40, clientY: 90 });
    // jsdom reports a zero-size rect, so the rAF write is skipped there; what
    // this pins is the release path — the ambient animation must come back.
    fireEvent.pointerLeave(frame);
    expect(holo.style.backgroundPosition).toBe("");
    // …and the sheen settles back to its resting strength rather than
    // staying lit at whatever the pointer left it on.
    const foil = container.querySelector<HTMLElement>('[data-testid="foil"]')!;
    expect(Number(foil.style.opacity)).toBeLessThan(0.5);
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
