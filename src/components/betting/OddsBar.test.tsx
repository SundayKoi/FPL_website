import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OddsBar } from "./OddsBar";

afterEach(() => {
  cleanup();
});

const team = { id: 1, name: "New Origins", short_code: "NOA", color: "#3b82f6", logo_url: null };

describe("OddsBar", () => {
  it("shows the team name, percentage and volume", () => {
    render(<OddsBar team={team} percent={0.62} volume={4970} />);
    expect(screen.getByText("New Origins")).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.getByText(/4,970/)).toBeTruthy();
  });

  it("flashes an up arrow when the percentage rises", () => {
    const { rerender } = render(<OddsBar team={team} percent={0.5} volume={100} />);
    expect(screen.queryByText("▲")).toBeNull(); // no movement on first render
    rerender(<OddsBar team={team} percent={0.7} volume={100} />);
    expect(screen.getByText("▲")).toBeTruthy();
  });

  it("flashes a down arrow when the percentage falls", () => {
    const { rerender } = render(<OddsBar team={team} percent={0.7} volume={100} />);
    rerender(<OddsBar team={team} percent={0.4} volume={100} />);
    expect(screen.getByText("▼")).toBeTruthy();
  });

  it("renders the moneyline odds string when provided", () => {
    render(<OddsBar team={team} percent={0.62} volume={4970} odds="-163" />);
    expect(screen.getByText("-163")).toBeTruthy();
  });
});
