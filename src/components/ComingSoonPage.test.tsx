import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ComingSoonPage from "./ComingSoonPage";

describe("ComingSoonPage", () => {
  it("renders the supplied future destination", () => {
    render(
      <ComingSoonPage
        eyebrow="LEAGUE DATA"
        title="Stats"
        description="Records and form are on the way."
      />,
    );

    expect(screen.getByRole("heading", { name: "Stats", level: 1 })).toBeTruthy();
    expect(screen.getByText("Records and form are on the way.")).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });
});
