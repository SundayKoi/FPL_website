import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AwardsDesk from "./AwardsDesk";
import type { HomepageAwardsData } from "@/lib/home/awards";

const award = (title: string, name: string | null, teamName: string | null, value: string) => ({
  title,
  name,
  tag: name ? "FPL" : null,
  teamName,
  detail: "Season 5 metric",
  value,
});

const awards: HomepageAwardsData = {
  season: "S5",
  periodLabel: "Week of Apr 27",
  playerOfWeek: award("Player of the Week", "Ace", "MetaShift League", "91"),
  teamOfWeek: award("Team of the Week", null, "MetaShift League", "2–0"),
  individualAwards: [
    award("Champion of the Week", "Viego", null, "80%"),
    award("Best Value Pick", "Aura", "Wildcats", "7.4×"),
    award("Biggest Riser", "Ace", "MetaShift League", "+14.2"),
    award("Playmaker", "Aura", "Wildcats", "78%"),
  ],
  teamAwards: [
    award("Best Overall", null, "MetaShift League", "80%"),
    award("Most Improved", null, "Faceless", "+25"),
    award("Most Reliable", null, "Wildcats", "50%"),
    award("Team of the Week", null, "MetaShift League", "100%"),
  ],
};

afterEach(() => cleanup());

describe("AwardsDesk", () => {
  it("renders the featured awards and the four team honors", () => {
    render(<AwardsDesk awards={awards} />);

    expect(screen.getByRole("region", { name: /awards desk/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The Awards Desk" })).toBeTruthy();
    expect(screen.getByText("Player of the Week")).toBeTruthy();
    expect(screen.getAllByText("Team of the Week").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Best Overall")).toBeTruthy();
    expect(screen.getByText("Most Improved")).toBeTruthy();
    expect(screen.getByText("Most Reliable")).toBeTruthy();
  });

  it("explains unavailable awards without rendering an empty winner", () => {
    render(
      <AwardsDesk
        awards={{
          ...awards,
          individualAwards: [
            award("Champion of the Week", null, null, "—"),
            ...awards.individualAwards.slice(1),
          ],
        }}
      />,
    );

    expect(screen.getAllByText(/season 5 metric/i).length).toBeGreaterThan(1);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
