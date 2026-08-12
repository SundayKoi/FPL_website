import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayersDirectory from "./PlayersDirectory";
import { PLAYER_SEASONS } from "@/lib/players/seasonData";
import type { FreeAgencyCaptain } from "@/lib/players/freeAgencyData";

afterEach(cleanup);

const freeAgencyCaptains: FreeAgencyCaptain[] = [
  {
    name: "Captain One",
    players: [{ name: "Captain: Winter", avgBid: 25 }],
  },
  {
    name: "Captain Two",
    players: [{ name: "Captain: Bleedinwolves", avgBid: 18 }],
  },
];

describe("PlayersDirectory", () => {
  it("renders Player List mode by default with five role sections", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    expect((screen.getByLabelText("Season") as HTMLSelectElement).value).toBe("season-5");
    expect((screen.getByLabelText("Section") as HTMLSelectElement).value).toBe("player-list");
    expect(screen.queryByLabelText("Captain")).toBeNull();
    expect(screen.getAllByText("Min")).toHaveLength(5);
    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Captain: Winter" }).getAttribute("href")).toBe(
      "https://op.gg/lol/summoners/na/Winter-Ashtn",
    );
    expect(screen.getByRole("link", { name: "Captain: Winter" }).closest("li")?.dataset.available).toBe(
      "true",
    );
  });

  it("shows the blank Season 4 state and restores Season 5", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    const selector = screen.getByLabelText("Season");
    fireEvent.change(selector, { target: { value: "season-4" } });
    expect(screen.getByText("Season 4 player data has not been added yet.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Top" })).toBeNull();
    fireEvent.change(selector, { target: { value: "season-5" } });
    expect(screen.getByRole("heading", { name: "Top" })).toBeTruthy();
  });

  it("uses new-tab security attributes for player links", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    const link = screen.getByRole("link", { name: "Captain: Winter" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows Free Agency mode with Avg Bid, no captain selected, and all rows available", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });

    expect((screen.getByLabelText("Section") as HTMLSelectElement).value).toBe("free-agency");
    expect((screen.getByLabelText("Captain") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByText("Min")).toBeNull();
    expect(screen.getAllByText("Avg Bid")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Captain: Winter" }).closest("li")?.dataset.available).toBe(
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Captain: Bleedinwolves" }).closest("li")?.dataset.available,
    ).toBe("true");
    expect(screen.getByText("25")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders captain options from the supplied snapshot in stable order", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });

    const captainSelect = screen.getByLabelText("Captain") as HTMLSelectElement;
    expect(Array.from(captainSelect.options).map((option) => [option.text, option.value])).toEqual([
      ["No captain", ""],
      ["Captain One", "Captain One"],
      ["Captain Two", "Captain Two"],
    ]);
  });

  it("matches real season labels to a selected captain and fades nonmatching rows", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Captain"), { target: { value: "Captain One" } });

    const matchingRow = screen.getByRole("link", { name: "Captain: Winter" }).closest("li");
    const nonMatchingRow = screen.getByRole("link", { name: "Captain: Bleedinwolves" }).closest("li");

    expect(matchingRow?.dataset.available).toBe("true");
    expect(nonMatchingRow?.dataset.available).toBe("false");
    expect(nonMatchingRow?.className).toContain("opacity-50");
    expect(screen.getByText("25")).toBeTruthy();
  });

  it("resets captain selection when leaving Free Agency and keeps the Season 4 empty state working", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Captain"), { target: { value: "Captain One" } });
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "season-4" } });

    expect(screen.getByText("Season 4 player data has not been added yet.")).toBeTruthy();
    expect(screen.getByLabelText("Captain")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "player-list" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "season-5" } });

    expect((screen.getByLabelText("Captain") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("link", { name: "Captain: Winter" }).closest("li")?.dataset.available).toBe(
      "true",
    );
  });
});
