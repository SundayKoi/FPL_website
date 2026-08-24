import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ClaimFinder, { toClaimFinderCards, type ClaimFinderCard } from "./ClaimFinder";

const cards: ClaimFinderCard[] = [
  { slug: "chaseworthy-na1", name: "Chaseworthy", role: "Mid", teamName: "Storm" },
  { slug: "chasedown-na1", name: "Chasedown", role: "Top", teamName: null },
  { slug: "commonly-na1", name: "Commonly", role: "Support", teamName: "Storm" },
];

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Find your card"), { target: { value } });
}

afterEach(cleanup);

describe("ClaimFinder", () => {
  it("lists nothing until something is typed", () => {
    render(<ClaimFinder cards={cards} />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("filters by name and links each hit at its claim", () => {
    render(<ClaimFinder cards={cards} />);
    type("chase");

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["ChaseworthyMid · Storm", "ChasedownTop"]);
    // ?claim=1 is what rings the claim control on the far side.
    expect(links[0].getAttribute("href")).toBe("/card/chaseworthy-na1?claim=1");
    expect(links[1].getAttribute("href")).toBe("/card/chasedown-na1?claim=1");
  });

  it("matches case-insensitively and mid-name", () => {
    render(<ClaimFinder cards={cards} />);
    type("MONLY");

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/card/commonly-na1?claim=1");
  });

  it("caps the list at six so the banner stays a banner", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      slug: `player-${index}`,
      name: `Player ${index}`,
      role: "Mid",
      teamName: null,
    }));
    render(<ClaimFinder cards={many} />);
    type("player");

    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("says so when nothing matches", () => {
    render(<ClaimFinder cards={cards} />);
    type("nobody");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/No player matches that/)).toBeTruthy();
  });

  it("projects a full card down to the four fields it needs", () => {
    const projected = toClaimFinderCards([
      {
        slug: "chaseworthy-na1",
        name: "Chaseworthy",
        role: "Mid",
        teamName: "Storm",
        // Everything else on a PlayerCardData is deliberately dropped — the
        // gallery beside this already ships it.
        overall: 92,
      } as never,
    ]);

    expect(projected).toEqual([{ slug: "chaseworthy-na1", name: "Chaseworthy", role: "Mid", teamName: "Storm" }]);
  });
});
