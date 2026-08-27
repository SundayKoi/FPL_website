import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import DrawLaurel from "./DrawLaurel";
import PlayerCard3D from "./PlayerCard3D";

afterEach(cleanup);

/** A plain player card, no draw win — the control for every case below. */
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

const laurel = () => screen.queryByLabelText(/weekly draw winner/i);

describe("DrawLaurel", () => {
  it("renders the laurel with the week in its label", () => {
    render(<DrawLaurel weekStart="2026-08-24" />);
    const mark = screen.getByLabelText(/weekly draw winner/i);
    expect(mark).toBeTruthy();
    expect(mark.getAttribute("title")).toContain("2026-08-24");
  });

  it("takes its placement from the caller, so each renderer can clear its own furniture", () => {
    render(<DrawLaurel weekStart="2026-08-24" position="top-[10%] left-[6%]" />);
    expect(screen.getByLabelText(/weekly draw winner/i).className).toContain("top-[10%]");
  });
});

describe("the laurel on a stamped copy", () => {
  it("marks a player card that won the draw", () => {
    render(<PlayerCard3D card={{ ...card, drawWin: { weekStart: "2026-08-24" } }} />);
    expect(laurel()?.getAttribute("title")).toContain("2026-08-24");
  });

  it("marks a champions relic that won the draw", () => {
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
      drawWin: { weekStart: "2026-08-24" },
    };
    render(<PlayerCard3D card={champCard} />);
    expect(laurel()?.getAttribute("title")).toContain("2026-08-24");
  });

  it("marks a moment that won the draw", () => {
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
      // The drawn week is the copy's own provenance, not the moment's week.
      drawWin: { weekStart: "2026-08-24" },
    };
    render(<PlayerCard3D card={momentCard} />);
    expect(laurel()?.getAttribute("title")).toContain("2026-08-24");
  });

  it("stays off every card that did not win", () => {
    render(<PlayerCard3D card={card} />);
    expect(laurel()).toBeNull();
  });
});
