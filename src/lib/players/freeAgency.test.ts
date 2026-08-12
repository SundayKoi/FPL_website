import { describe, expect, it } from "vitest";

import {
  findFreeAgencyPlayer,
  isPlayerAvailableToCaptain,
  normalizePlayerName,
} from "./freeAgency";
import { FREE_AGENCY_CAPTAINS } from "./freeAgencyData";

const captains = [
  {
    name: "Captain One",
    players: [
      { name: "Player Alpha", avgBid: 25 },
      { name: "Player Beta", avgBid: null },
    ],
  },
  {
    name: "Captain Two",
    players: [
      { name: "Winter", avgBid: 35 },
      { name: "Conguitos0", avgBid: 35 },
      { name: "Pinei Nessa Poha", avgBid: 45.6 },
      { name: "Flying Squirtle", avgBid: 15 },
      { name: "Begfourmercy", avgBid: 31.2 },
      { name: "Chime", avgBid: 17.5 },
    ],
  },
];

const playerSummaries = [
  { name: "Player Beta", avgBid: 0 },
  { name: "QBall", avgBid: 0 },
  { name: "I am ATOMIC", avgBid: 0 },
];

describe("free agency availability", () => {
  it("normalizes season labels by trimming captain prefixes and riot tags", () => {
    expect(normalizePlayerName("  Captain: Winter  ")).toBe("winter");
    expect(normalizePlayerName("Canny#rip")).toBe("canny");
    expect(normalizePlayerName("Pinei nessa poha#00027")).toBe("pinei nessa poha");
  });

  it("treats no captain as all players available", () => {
    expect(isPlayerAvailableToCaptain("Unlisted Player", null, captains)).toBe(true);
  });

  it("matches a selected captain's imported bid list", () => {
    expect(isPlayerAvailableToCaptain("player alpha", "Captain One", captains)).toBe(true);
    expect(isPlayerAvailableToCaptain("Player Gamma", "Captain One", captains)).toBe(false);
  });

  it("returns false for an unknown captain", () => {
    expect(isPlayerAvailableToCaptain("Player Alpha", "Missing Captain", captains)).toBe(false);
  });

  it("keeps captain rows unavailable to every selected captain", () => {
    expect(isPlayerAvailableToCaptain("Captain: Winter", "Captain One", [
      { name: "Captain One", players: [{ name: "Winter", avgBid: 50 }] },
    ])).toBe(false);
  });

  it("imports the expected bid count for each of the twelve captains", () => {
    expect(FREE_AGENCY_CAPTAINS).toHaveLength(12);
    // Every captain placed 12 bids; Sycoghost's AcidStep bid was voided
    // when AcidStep was removed from the league mid-split, leaving 11.
    for (const captain of FREE_AGENCY_CAPTAINS) {
      expect(captain.players.length, captain.name).toBe(captain.name === "Sycoghost" ? 11 : 12);
    }
  });

  it("matches real season labels against imported free-agency labels", () => {
    expect(isPlayerAvailableToCaptain("Captain: Winter", "Captain Two", captains)).toBe(false);
    expect(isPlayerAvailableToCaptain("Conguitos#01203", "Captain Two", captains)).toBe(true);
    expect(isPlayerAvailableToCaptain("Pinei nessa poha#00027", "Captain Two", captains)).toBe(true);
    expect(isPlayerAvailableToCaptain("Captain: Flying Squirtle", "Captain Two", captains)).toBe(false);
    expect(isPlayerAvailableToCaptain("Beg#DU1", "Captain Two", captains)).toBe(true);
    expect(isPlayerAvailableToCaptain("08 Mitsu Eclipse#Chime", "Captain Two", captains)).toBe(true);
  });

  it("finds a player across flattened captain bid lists with real aliases", () => {
    expect(findFreeAgencyPlayer(" player beta ", captains, playerSummaries)).toEqual({
      name: "Player Beta",
      avgBid: 0,
    });
    expect(findFreeAgencyPlayer("Conguitos#01203", captains, playerSummaries)).toEqual({
      name: "Conguitos0",
      avgBid: 35,
    });
    expect(findFreeAgencyPlayer("Captain: Flying Squirtle", captains, playerSummaries)).toEqual({
      name: "Flying Squirtle",
      avgBid: 15,
    });
    expect(findFreeAgencyPlayer("Beg#DU1", captains, playerSummaries)).toEqual({
      name: "Begfourmercy",
      avgBid: 31.2,
    });
    expect(findFreeAgencyPlayer("08 Mitsu Eclipse#Chime", captains, playerSummaries)).toEqual({
      name: "Chime",
      avgBid: 17.5,
    });
    expect(findFreeAgencyPlayer("Missing Player", captains, playerSummaries)).toBeUndefined();
  });

  it("uses summary-only players and zero-bid values for lookup", () => {
    expect(findFreeAgencyPlayer("Qball#1032", captains, playerSummaries)).toEqual({
      name: "QBall",
      avgBid: 0,
    });
    expect(findFreeAgencyPlayer("I am atomic#idk", captains, playerSummaries)).toEqual({
      name: "I am ATOMIC",
      avgBid: 0,
    });
  });

  it("uses summary values before reconstructed captain-list values", () => {
    expect(findFreeAgencyPlayer("Player Beta", captains, playerSummaries)).toEqual({
      name: "Player Beta",
      avgBid: 0,
    });
  });
});
