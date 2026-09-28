import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SearchSection from "./SearchSection";

describe("SearchSection", () => {
  it("lists the most searched queries and, apart, the ones that found nothing", () => {
    render(
      <SearchSection
        summary={{
          days: 30,
          total: 12,
          top: [
            { query: "standings", searches: 7, found: true },
            { query: "duels", searches: 3, found: false },
          ],
          unfound: [{ query: "duels", searches: 3 }],
        }}
      />,
    );
    expect(screen.getByText(/12 searches in the last 30 days/)).toBeTruthy();
    const unfound = screen.getByRole("list", { name: "Searches that found nothing" });
    expect(within(unfound).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["duels3"]);
    expect(screen.getByText("standings")).toBeTruthy();
  });

  it("says so when there is nothing yet, or the log is not readable", () => {
    const { rerender } = render(<SearchSection summary={{ days: 30, total: 0, top: [], unfound: [] }} />);
    expect(screen.getByText(/no searches in the last 30 days/i)).toBeTruthy();
    rerender(<SearchSection summary={null} />);
    expect(screen.getByText(/isn.t readable yet/i)).toBeTruthy();
  });
});
