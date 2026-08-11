import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayersDirectory from "./PlayersDirectory";
import { PLAYER_SEASONS } from "@/lib/players/seasonData";

afterEach(cleanup);

describe("PlayersDirectory", () => {
  it("renders Season 5 by default with five role sections", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} />);
    expect((screen.getByLabelText("Season") as HTMLSelectElement).value).toBe("season-5");
    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Captain: Winter" }).getAttribute("href")).toBe(
      "https://op.gg/lol/summoners/na/Winter-Ashtn",
    );
  });

  it("shows the blank Season 4 state and restores Season 5", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} />);
    const selector = screen.getByLabelText("Season");
    fireEvent.change(selector, { target: { value: "season-4" } });
    expect(screen.getByText("Season 4 player data has not been added yet.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Top" })).toBeNull();
    fireEvent.change(selector, { target: { value: "season-5" } });
    expect(screen.getByRole("heading", { name: "Top" })).toBeTruthy();
  });

  it("uses new-tab security attributes for player links", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} />);
    const link = screen.getByRole("link", { name: "Captain: Winter" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
