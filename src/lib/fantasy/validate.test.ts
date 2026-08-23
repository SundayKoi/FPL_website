import { describe, expect, it } from "vitest";
import { FANTASY_ROLES, SALARY_CAP, type FantasyRole } from "./config";
import { validateLineup, type LineupSlotInput } from "./validate";

let nextId = 1;

function card(playerName: string, role: string, overall: number, slug = playerName.toLowerCase()) {
  return { id: nextId++, slug, playerName, role, overall };
}

/** A legal five, 70 OVR each — 350, comfortably under the 360 cap. */
function lineup(overrides: Partial<Record<FantasyRole, LineupSlotInput["inventory"]>> = {}): LineupSlotInput[] {
  return FANTASY_ROLES.map((role) => ({
    role,
    inventory: overrides[role] ?? card(`${role}Player`, role, 70),
  }));
}

describe("validateLineup", () => {
  it("accepts a legal five and returns the total OVR", () => {
    expect(validateLineup(lineup())).toEqual({ ok: true, totalOverall: 350 });
  });

  it("accepts a lineup sitting exactly on the cap", () => {
    const slots = lineup({ Top: card("Rutledge", "Top", 80) });
    expect(validateLineup(slots)).toEqual({ ok: true, totalOverall: SALARY_CAP });
  });

  it("rejects a lineup missing a role", () => {
    const slots = lineup().filter((slot) => slot.role !== "Support");
    expect(validateLineup(slots)).toEqual({
      ok: false,
      error: "Fantasy lineups need one card in every role.",
    });
  });

  it("rejects an empty lineup", () => {
    expect(validateLineup([])).toEqual({ ok: false, error: "Fantasy lineups need one card in every role." });
  });

  it("rejects two cards handed in for the same slot", () => {
    const slots = [...lineup(), { role: "Mid" as const, inventory: card("Extra", "Mid", 60) }];
    expect(validateLineup(slots)).toEqual({
      ok: false,
      error: "Fantasy lineups need one card in every role.",
    });
  });

  it("rejects a card played out of position", () => {
    const slots = lineup({ Mid: card("Bandit", "Support", 70) });
    expect(validateLineup(slots)).toEqual({
      ok: false,
      error: "Bandit is a Support card — it can't play Mid.",
    });
  });

  it("rejects two editions of the same player", () => {
    const slots = lineup({
      Top: card("Rutledge", "Top", 70, "rutledge-na1"),
      // same human, different copy: different id, same slug
      Jungle: card("Rutledge", "Jungle", 70, "rutledge-na1"),
    });
    expect(validateLineup(slots)).toEqual({ ok: false, error: "You can't field two copies of Rutledge." });
  });

  it("rejects a lineup over the salary cap, quoting the total", () => {
    const slots = lineup({ Top: card("Rutledge", "Top", 92) });
    expect(validateLineup(slots)).toEqual({ ok: false, error: "Lineup is over the salary cap: 372/360." });
  });

  it("honors a caller-supplied cap", () => {
    expect(validateLineup(lineup(), { salaryCap: 300 })).toEqual({
      ok: false,
      error: "Lineup is over the salary cap: 350/300.",
    });
  });

  it("reports the missing role before the cap", () => {
    const slots = lineup({ Top: card("Rutledge", "Top", 99) }).filter((slot) => slot.role !== "Bot");
    expect(validateLineup(slots)).toEqual({
      ok: false,
      error: "Fantasy lineups need one card in every role.",
    });
  });
});
