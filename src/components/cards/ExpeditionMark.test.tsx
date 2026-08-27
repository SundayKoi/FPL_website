import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import ExpeditionMark from "./ExpeditionMark";
import PlayerCard3D from "./PlayerCard3D";

afterEach(cleanup);

/** A plain player card, nothing stamped on it — the control for the
 *  integration cases below (same shape DrawLaurel.test.tsx uses). */
const card: PlayerCardData = {
  slug: "7gen-na1",
  name: "7gen",
  tag: "NA1",
  teamName: "Gamblers",
  teamImageUrl: null,
  role: "Bot",
  overall: 74,
  tier: { key: "platinum", label: "Platinum" },
  archetype: "Glass Cannon",
  signature: { champion: "Jhin", games: 4 },
  artSkin: 0,
  motto: null,
  serial: 4,
  collectionSize: 48,
  topChampions: [{ champion: "Jhin", games: 4, wins: 3 }],
  form: [true, true, false, true, true],
  subStats: [{ key: "combat", label: "Combat", value: 82 }],
  highlights: [],
  badges: [],
  standout: false,
  wins: 7,
  losses: 9,
  winratePct: 43.8,
  level: 16,
  pentas: 1,
  season: "S5",
};

const markOf = () => screen.queryByLabelText(/expedition/i);

describe("ExpeditionMark", () => {
  it.each(["trail", "sigil", "legend"] as const)("renders the %s mark with provenance", (mark) => {
    render(<ExpeditionMark mark={mark} date="2026-09-01" />);
    const el = screen.getByLabelText(/expedition/i);
    expect(el).toBeTruthy();
    expect(el.getAttribute("title")).toContain("2026-09-01");
  });

  it("names the grade in the label, so the three read apart to a screen reader", () => {
    render(<ExpeditionMark mark="sigil" date="2026-09-01" />);
    expect(screen.getByLabelText(/expedition/i).getAttribute("aria-label")).toMatch(/sigil/i);
  });

  it("legend renders the gilded ember frame layer", () => {
    const { container } = render(<ExpeditionMark mark="legend" date="2026-09-01" />);
    expect(container.querySelector(".legend-embers")).not.toBeNull();
  });

  it("keeps the ember frame off the two lesser grades", () => {
    const trail = render(<ExpeditionMark mark="trail" date="2026-09-01" />);
    expect(trail.container.querySelector(".legend-embers")).toBeNull();
    cleanup();
    const sigil = render(<ExpeditionMark mark="sigil" date="2026-09-01" />);
    expect(sigil.container.querySelector(".legend-embers")).toBeNull();
  });

  it("gives sigil and legend the weathered corner accents, and trail none", () => {
    const trail = render(<ExpeditionMark mark="trail" date="2026-09-01" />);
    expect(trail.container.querySelectorAll("[data-testid='expedition-accent']").length).toBe(0);
    cleanup();
    const legend = render(<ExpeditionMark mark="legend" date="2026-09-01" />);
    expect(legend.container.querySelectorAll("[data-testid='expedition-accent']").length).toBe(2);
  });

  it("takes its placement from the caller, so each renderer can clear its own furniture", () => {
    render(<ExpeditionMark mark="trail" date="2026-09-01" position="top-[10%] left-[6%]" />);
    expect(screen.getByLabelText(/expedition/i).className).toContain("top-[10%]");
  });
});

describe("the mark on a stamped copy", () => {
  it("marks a player card that came back from an expedition", () => {
    render(<PlayerCard3D card={{ ...card, expedition: { mark: "sigil", tier: "raid", date: "2026-09-01" } }} />);
    expect(markOf()?.getAttribute("title")).toContain("2026-09-01");
  });

  it("marks a champions relic that came back from an expedition", () => {
    const champCard: PlayerCardData = {
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
      expedition: { mark: "legend", tier: "legend", date: "2026-09-01" },
    };
    const { container } = render(<PlayerCard3D card={champCard} />);
    expect(markOf()?.getAttribute("title")).toContain("2026-09-01");
    expect(container.querySelector(".legend-embers")).not.toBeNull();
  });

  it("marks a moment that came back from an expedition", () => {
    const momentCard: PlayerCardData = {
      ...card,
      moment: {
        id: 7,
        weekStart: "2026-08-17",
        playerSlug: "x",
        summonerName: "X80HDgraphicsX",
        teamName: null,
        champion: null,
        title: "The Steal",
        headline: "1 objective stolen · 4/0/9",
      },
      // The expedition's date is the copy's own provenance, not the moment's week.
      expedition: { mark: "trail", tier: "scout", date: "2026-09-01" },
    };
    render(<PlayerCard3D card={momentCard} />);
    expect(markOf()?.getAttribute("title")).toContain("2026-09-01");
  });

  it("coexists with a Weekly Draw laurel on one copy — both stamps, neither dropped", () => {
    render(
      <PlayerCard3D
        card={{
          ...card,
          drawWin: { weekStart: "2026-08-24" },
          expedition: { mark: "legend", tier: "legend", date: "2026-09-01" },
        }}
      />,
    );
    expect(screen.getByLabelText(/weekly draw winner/i)).toBeTruthy();
    expect(markOf()).toBeTruthy();
  });

  it("stays off every card that never went out", () => {
    render(<PlayerCard3D card={card} />);
    expect(markOf()).toBeNull();
  });
});
