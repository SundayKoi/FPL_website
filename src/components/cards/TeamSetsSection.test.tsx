import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TeamSetsSection from "./TeamSetsSection";
import type { PlayerCardData } from "@/lib/cards/build";

function card(slug: string, name: string, teamName: string): PlayerCardData {
  return { slug, name, teamName, overall: 70, teamImageUrl: null, role: "Mid" } as PlayerCardData;
}

describe("TeamSetsSection", () => {
  afterEach(cleanup);

  it("renders nothing when no card has a team", () => {
    const { container } = render(<TeamSetsSection cards={[]} ownedSlugs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows progress and names the players still missing", () => {
    render(
      <TeamSetsSection
        cards={[card("a", "Ari", "Wolves"), card("b", "Bo", "Wolves")]}
        ownedSlugs={["a"]}
      />,
    );

    expect(screen.getByText("1/2 collected")).toBeTruthy();
    const missing = screen.getByRole("link", { name: "Bo" });
    expect(missing.getAttribute("href")).toBe("/card/b");
    // The owned member is not listed as missing.
    expect(screen.queryByRole("link", { name: "Ari" })).toBeNull();
  });

  it("badges a finished set and stops asking for cards", () => {
    render(<TeamSetsSection cards={[card("a", "Ari", "Wolves")]} ownedSlugs={["a"]} />);

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.getByText("1 of 1 complete")).toBeTruthy();
    expect(screen.queryByText(/still need/i)).toBeNull();
  });

  it("exposes the meter to assistive tech with real bounds", () => {
    render(
      <TeamSetsSection
        cards={[card("a", "Ari", "Wolves"), card("b", "Bo", "Wolves")]}
        ownedSlugs={["a"]}
      />,
    );

    const meter = screen.getByRole("progressbar", { name: /wolves set progress/i });
    expect(meter.getAttribute("aria-valuenow")).toBe("1");
    expect(meter.getAttribute("aria-valuemax")).toBe("2");
  });
});
