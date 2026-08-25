import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardSubStat, PlayerCardData } from "@/lib/cards/build";
import CompareClient from "./CompareClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function makeCard(name: string, role: string, subStats: CardSubStat[]): PlayerCardData {
  return {
    slug: `${name.toLowerCase()}-na1`,
    name,
    tag: "NA1",
    teamName: "Storm",
    teamImageUrl: null,
    teamAbbr: null,
    role,
    overall: 80,
    tier: { key: "diamond", label: "Diamond" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    motto: null,
    serial: 1,
    collectionSize: 2,
    topChampions: [],
    form: [],
    subStats,
    highlights: [],
    badges: [],
    standout: false,
    wins: 5,
    losses: 5,
    winratePct: 50,
    level: 10,
    pentas: 0,
    season: "S5",
  };
}

// Two roles, two different bar sets — exactly what measures.ts hands out.
const jungler = makeCard("Junglin", "Jungle", [
  { key: "combat", label: "Combat", value: 70 },
  { key: "objectives", label: "Objectives", value: 91 },
  { key: "impact", label: "Impact", value: 60 },
]);
const adc = makeCard("Botlaner", "Bot", [
  { key: "combat", label: "Combat", value: 64 },
  { key: "damage", label: "Damage", value: 88 },
  { key: "impact", label: "Impact", value: 77 },
]);

/** One row of the comparison table, scoped to the table itself — the two
 *  PlayerCard3Ds beside it print the same bar labels. */
function statRow(label: string): HTMLElement {
  const table = screen.getByRole("table", { name: "Stat comparison" });
  const row = within(table).getByText(label).closest("tr");
  if (!row) throw new Error(`no row for ${label}`);
  return row as HTMLElement;
}

/** The [left value, label, right value] of one row of the stat table. */
function rowCells(label: string): string[] {
  return within(statRow(label)).getAllByRole("cell").map((td) => td.textContent ?? "");
}

afterEach(cleanup);

describe("CompareClient", () => {
  it("matches stat rows by key when the two cards play different roles", () => {
    render(<CompareClient cards={[jungler, adc]} initialA={jungler.slug} initialB={adc.slug} />);

    // The bug this guards: zipping subStats by index paired the jungler's
    // "Objectives" label with the ADC's Damage value (88) — a row of
    // confidently wrong data on a live page.
    expect(rowCells("Combat")).toEqual(["70", "Combat", "64"]);
    expect(rowCells("Impact")).toEqual(["60", "Impact", "77"]);
    expect(rowCells("Objectives")).toEqual(["91", "Objectives", "—"]);
    expect(rowCells("Damage")).toEqual(["—", "Damage", "88"]);
  });

  it("never awards a win on a bar only one card carries", () => {
    render(<CompareClient cards={[jungler, adc]} initialA={jungler.slug} initialB={adc.slug} />);

    // A missing bar is unknown, not zero: neither side gets the highlight.
    for (const cell of within(statRow("Objectives")).getAllByRole("cell")) {
      expect(cell.className).not.toContain("text-mint");
    }
    // A bar they share still highlights the better number.
    const combat = within(statRow("Combat")).getAllByRole("cell");
    expect(combat[0].className).toContain("text-mint");
    expect(combat[2].className).not.toContain("text-mint");
  });

  it("keeps overall and win rate around the stat rows", () => {
    render(<CompareClient cards={[jungler, adc]} initialA={jungler.slug} initialB={adc.slug} />);

    expect(rowCells("Overall")).toEqual(["80", "Overall", "80"]);
    expect(rowCells("Win rate")).toEqual(["50", "Win rate", "50"]);
  });
});
