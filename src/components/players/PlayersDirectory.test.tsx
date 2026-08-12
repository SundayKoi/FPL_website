import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayersDirectory from "./PlayersDirectory";
import { PLAYER_SEASONS } from "@/lib/players/seasonData";
import type { FreeAgencyCaptain } from "@/lib/players/freeAgencyData";

afterEach(cleanup);

const freeAgencyCaptains: FreeAgencyCaptain[] = [
  {
    name: "Captain One",
    players: [{ name: "Canny#rip", avgBid: 25 }],
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
    expect(screen.getAllByText("Min")).toHaveLength(6);
    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Captain: Winter" }).getAttribute("href")).toBe(
      "https://op.gg/lol/summoners/na/Winter-Ashtn",
    );
    expect(screen.getByRole("link", { name: "Canny#rip" }).closest("li")?.dataset.available).toBe("true");
  });

  it("shows the blank Season 4 state and restores Season 5", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    const selector = screen.getByLabelText("Season");
    fireEvent.change(selector, { target: { value: "season-4" } });
    expect(screen.getByText("No player data is available for this season.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Top" })).toBeNull();
    fireEvent.change(selector, { target: { value: "season-5" } });
    expect(screen.getByRole("heading", { name: "Top" })).toBeTruthy();
  });

  it("shows a season-specific unavailable message when provided", () => {
    render(
      <PlayersDirectory
        seasons={{ "season-5": [], "season-4": [] }}
        freeAgencyCaptains={freeAgencyCaptains}
        emptyStateMessages={{
          "season-5": "Player List data is unavailable for Season 5 right now.",
        }}
      />,
    );

    expect(screen.getByText("Player List data is unavailable for Season 5 right now.")).toBeTruthy();
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
    expect(screen.getAllByText("Avg Bid")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Captain: Winter" }).closest("li")?.dataset.available).toBe(
      "true",
    );
    expect(
      screen.getByRole("link", { name: "Captain: Bleedinwolves" }).closest("li")?.dataset.available,
    ).toBe("true");
    expect(screen.getAllByText("25").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Bid Board" })).toBeTruthy();
    expect(screen.getAllByText("Pinei nessa poha").length).toBeGreaterThan(0);
  });

  it("sorts Free Agency players by descending average bid within each role", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    const topSection = screen.getByRole("heading", { name: "Top" }).closest("section");
    const names = Array.from(topSection?.querySelectorAll("li a") ?? []).map((link) => link.textContent);
    expect(names.slice(0, 3)).toEqual(["Canny#rip", "Killer Python#NA1", "Walt#0001"]);
  });

  it("sorts both sections by the selected field", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    const sortSelect = screen.getByLabelText("Sort by") as HTMLSelectElement;
    expect(sortSelect.value).toBe("value");

    fireEvent.change(sortSelect, { target: { value: "name" } });
    const topSection = screen.getByRole("heading", { name: "Top" }).closest("section");
    const names = Array.from(topSection?.querySelectorAll("li a") ?? []).map((link) => link.textContent);
    expect(names.slice(0, 3)).toEqual(["all gucci#gamer", "Canny#rip", "Captain: Bleedinwolves"]);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "value" } });
    const freeAgencyTop = screen.getByRole("heading", { name: "Top" }).closest("section");
    const freeAgencyNames = Array.from(freeAgencyTop?.querySelectorAll("li a") ?? []).map((link) => link.textContent);
    expect(freeAgencyNames.slice(0, 2)).toEqual(["Canny#rip", "Killer Python#NA1"]);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "player-list" } });
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "rank" } });
    const rankNames = Array.from(screen.getByRole("heading", { name: "Top" }).closest("section")?.querySelectorAll("li a") ?? []).map((link) => link.textContent);
    expect(rankNames.slice(0, 3)).toEqual(["Canny#rip", "Captain: Winter", "Walt#0001"]);
  });

  it("shows editable Avg Bid inputs for admins", () => {
    render(
      <PlayersDirectory
        seasons={PLAYER_SEASONS}
        freeAgencyCaptains={freeAgencyCaptains}
        isAdmin
        initialAvgBids={{ "Canny#rip": 44 }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    expect(screen.queryByLabelText("Avg Bid for Canny#rip")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Avg Bids" }));
    expect((screen.getByLabelText("Avg Bid for Canny#rip") as HTMLInputElement).value).toBe("44");
    expect(screen.getByRole("button", { name: "Done Editing" })).toBeTruthy();
  });

  it("highlights every matching bid-board name when selected", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });

    const matchingBids = screen.getAllByRole("button", { name: "Canny" });
    expect(matchingBids.length).toBeGreaterThan(1);
    fireEvent.click(matchingBids[0]);

    for (const bid of screen.getAllByRole("button", { name: "Canny" })) {
      expect(bid.getAttribute("aria-pressed")).toBe("true");
      expect(bid.className).toContain("font-extrabold");
    }

    fireEvent.click(matchingBids[0]);
    expect(screen.getAllByRole("button", { name: "Canny" }).every((bid) => bid.getAttribute("aria-pressed") === "false")).toBe(true);
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

    const matchingRow = screen.getByRole("link", { name: "Canny#rip" }).closest("li");
    const nonMatchingRow = screen.getByRole("link", { name: "Captain: Bleedinwolves" }).closest("li");

    expect(matchingRow?.dataset.available).toBe("true");
    expect(nonMatchingRow?.dataset.available).toBe("false");
    expect(nonMatchingRow?.className).toContain("opacity-50");
    expect(screen.getAllByText("25").length).toBeGreaterThan(0);
  });

  it("resets captain selection when leaving Free Agency and keeps the Season 4 empty state working", () => {
    render(<PlayersDirectory seasons={PLAYER_SEASONS} freeAgencyCaptains={freeAgencyCaptains} />);

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Captain"), { target: { value: "Captain One" } });
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "season-4" } });

    expect(screen.getByText("No player data is available for this season.")).toBeTruthy();
    expect(screen.getByLabelText("Captain")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "player-list" } });
    fireEvent.change(screen.getByLabelText("Section"), { target: { value: "free-agency" } });
    fireEvent.change(screen.getByLabelText("Season"), { target: { value: "season-5" } });

    expect((screen.getByLabelText("Captain") as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("link", { name: "Canny#rip" }).closest("li")?.dataset.available).toBe("true");
  });
});
