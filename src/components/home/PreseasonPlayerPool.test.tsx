import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PreseasonPlayerPool from "./PreseasonPlayerPool";

describe("PreseasonPlayerPool", () => {
  it("keeps captains first and sorts the remaining players by rank without blur", () => {
    render(
      <PreseasonPlayerPool
        players={[
          { id: "available-d2", displayName: "Diamond Player", role: "top", rank: "D2", opggUrl: "#", price: null, available: true, lockLabel: null },
          { id: "captain", displayName: "Captain Player", role: "top", rank: "E1", opggUrl: "#", price: 0, available: false, lockLabel: "Captain" },
          { id: "available-m10", displayName: "Master Player", role: "top", rank: "M10", opggUrl: "#", price: null, available: true, lockLabel: null },
        ]}
      />,
    );

    const topHeading = screen.getByRole("heading", { name: "Top" });
    const topList = topHeading.parentElement?.querySelector("ul");
    const players = within(topList as HTMLElement).getAllByRole("listitem");

    expect(players.map((player) => player.textContent)).toEqual([
      expect.stringContaining("Captain Player"),
      expect.stringContaining("Master Player"),
      expect.stringContaining("Diamond Player"),
    ]);
    expect(screen.getByText("Captain Player").className).not.toContain("blur");
    expect(players[0].className).toContain("opacity-55");
    expect(players[0].textContent).toContain("E1");
    expect(players[1].textContent).toContain("M10");
    expect(players[2].textContent).toContain("D2");
  });
});
