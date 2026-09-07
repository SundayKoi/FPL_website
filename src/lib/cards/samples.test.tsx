import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { rarityGuide } from "./rarityGuide";
import { sampleCard, sampleFor } from "./samples";

afterEach(cleanup);

describe("rarity samples", () => {
  const entries = rarityGuide("S5").flatMap((section) => section.entries);

  it("is Dribb, all 99s, on Bard, on no team", () => {
    const card = sampleCard();
    expect(card.name).toBe("Dribb");
    expect(card.overall).toBe(99);
    expect(card.signature?.champion).toBe("Bard");
    expect(card.teamName).toBeNull();
    expect(card.teamImageUrl).toBeNull();
    expect(card.subStats.every((stat) => stat.value === 99)).toBe(true);
  });

  it("has a specimen for every entry in the guide", () => {
    for (const entry of entries) {
      expect(sampleFor(entry.key), entry.key).not.toBeNull();
    }
    expect(sampleFor("nope")).toBeNull();
  });

  it.each(entries.map((entry) => entry.key))("renders the %s specimen", (key) => {
    const sample = sampleFor(key)!;
    render(<PlayerCard3D card={sample.card} forceFoil={sample.foil} foilType={sample.foilType} interactive />);
    expect(screen.getAllByText(/Dribb/).length).toBeGreaterThan(0);
  });

  it("wears exactly the rarity asked for", () => {
    expect(sampleFor("shiny")!.card.shiny).toBe(true);
    expect(sampleFor("shiny")!.card.secret).toBeUndefined();
    expect(sampleFor("secret")!.card.secret).toEqual({ number: 100, of: 99 });
    expect(sampleFor("ice")).toMatchObject({ foil: true, foilType: "ice" });
    expect(sampleFor("eclipse")!.card.standout).toBe(true);
    expect(sampleFor("common")!.card.tier.key).toBe("gold");
    expect(sampleFor("slab")!.card.slab?.wear).toBe(2);
    expect(sampleFor("plate")!.card.team?.imageUrl).toBeNull();
  });
});
