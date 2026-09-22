import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { measureStandardSignatureReference } from "./calibration";

function card(slug: string): PlayerCardData {
  return { slug, name: slug, tag: "NA1", tier: { key: "bronze", label: "Bronze" } } as unknown as PlayerCardData;
}

describe("Season's End signature calibration", () => {
  it("measures the ordinary standard pipeline deterministically", () => {
    const cards = [card("a"), card("b"), card("c"), card("d"), card("e")];
    const signatures = new Map(cards.map((entry) => [`${entry.name.toLowerCase()}#${entry.tag.toLowerCase()}`, "ink"]));
    const first = measureStandardSignatureReference({ cards, signaturesByPlayerKey: signatures, samples: 250, seed: 7 });
    const second = measureStandardSignatureReference({ cards, signaturesByPlayerKey: signatures, samples: 250, seed: 7 });
    expect(first).toEqual(second);
    expect(first.packs).toBe(250);
    expect(first.signedCopies).toBeGreaterThanOrEqual(first.signedPacks);
    expect(first.signingCoverage).toBe(1);
    expect(first.branch).toBe("ordinary-standard-excluding-god-pack");
    expect(first.signatureScope).toBe("cross-season");
    expect(first.pool.kind).toBe("current-week");
  });

  it("counts ordinary last-slot substitutions as removing signed copies", () => {
    const cards = [card("a"), card("b"), card("c"), card("d"), card("e")];
    const signatures = new Map(cards.map((entry) => [`${entry.name.toLowerCase()}#${entry.tag.toLowerCase()}`, "ink"]));
    const withoutSubstitution = measureStandardSignatureReference({ cards, signaturesByPlayerKey: signatures, samples: 100_000, seed: 7 });
    const withMomentSubstitution = measureStandardSignatureReference({
      cards,
      signaturesByPlayerKey: signatures,
      samples: 100_000,
      seed: 7,
      pool: { kind: "edition", editionWeek: "2026-09-14" },
      substitutions: { editionWeek: "2026-09-14", momentPoolSize: 1, teamPoolSize: 0, momentChance: 1, teamChance: 0 },
    });
    expect(withMomentSubstitution.substitutions.momentPoolSize).toBe(1);
    expect(withMomentSubstitution.signedCopies).toBeLessThan(withoutSubstitution.signedCopies);
  });
});
