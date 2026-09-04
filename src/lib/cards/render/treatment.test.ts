import { describe, expect, it } from "vitest";
import {
  cardTreatment,
  DEFAULT_TINT,
  ECLIPSE_GOLD,
  ECLIPSE_HALLMARK,
  GROUND,
  PANEL,
  SIGNED_RIBBON,
  TIER_COLORS,
} from "./treatment";
import { FOIL_TYPE_LABELS } from "@/lib/packs/config";

const INK = "data:image/png;base64,aGVsbG8=";

function base(overrides: Partial<Parameters<typeof cardTreatment>[0]> = {}) {
  return cardTreatment({ tierKey: "gold", foil: false, foilType: null, signed: false, autograph: null, ...overrides });
}

describe("cardTreatment", () => {
  it("leaves a plain card exactly as the share render always drew it", () => {
    const plain = base();
    expect(plain).toMatchObject({
      parallel: null,
      eclipse: false,
      tint: TIER_COLORS.gold,
      border: TIER_COLORS.gold,
      panel: PANEL,
      ground: GROUND,
      badge: null,
      hallmark: null,
      ribbon: null,
      ink: null,
    });
  });

  it("falls back to a neutral tint for a tier the ladder doesn't hold", () => {
    // A roster plate's tier key is "team" and never was a rating tier.
    // Reading TIER_COLORS straight would paint `6px solid undefined`.
    expect(base({ tierKey: "team" }).tint).toBe(DEFAULT_TINT);
    expect(base({ tierKey: null }).tint).toBe(DEFAULT_TINT);
    expect(base({ tierKey: undefined }).tint).toBe(DEFAULT_TINT);
  });

  it("names every parallel except the base one", () => {
    expect(base({ foil: true, foilType: "ice" }).badge).toBe(FOIL_TYPE_LABELS.ice);
    expect(base({ foil: true, foilType: "aurora" }).badge).toBe(FOIL_TYPE_LABELS.aurora);
    expect(base({ foil: true, foilType: "refractor" }).badge).toBe(FOIL_TYPE_LABELS.refractor);
    // Prisma is what every foil minted before parallels existed IS —
    // badging it would make an ordinary foil read as a new thing.
    expect(base({ foil: true, foilType: "prisma" }).badge).toBeNull();
  });

  it("names and colours a season's foils as that season's skin line, Standard included", () => {
    // Season 5 is Battlecast (SEASON_LINES): the ladder is stored, the line
    // is shown. The base rung is badged too — the line's name is the
    // season's mark — where a plain Prisma wears nothing.
    expect(base({ foil: true, foilType: "prisma", season: "S5" }).badge).toBe("Battlecast");
    expect(base({ foil: true, foilType: "ice", season: "S5" }).badge).toBe("Battlecast Ultimate");
    expect(base({ foil: true, foilType: "ice", season: "S5" }).accent).toBe("#ff2a2a");
    // Eclipse is not a tier of anything.
    expect(base({ foil: true, foilType: "eclipse", season: "S5" }).badge).toBeNull();
    expect(base({ foil: true, foilType: "eclipse", season: "S5" }).hallmark).toBe("1 OF 1");
    // A season without a line draws the ladder as itself.
    expect(base({ foil: true, foilType: "ice", season: "S4" }).badge).toBe(FOIL_TYPE_LABELS.ice);
  });

  it("treats an unrecognised foil type as the base foil rather than failing", () => {
    const odd = base({ foil: true, foilType: "chartreuse" });
    expect(odd.parallel).toBe("prisma");
    expect(odd.badge).toBeNull();
  });

  it("wears nothing on a matte card, whatever foil_type happens to hold", () => {
    const matte = base({ foil: false, foilType: "eclipse" });
    expect(matte.parallel).toBeNull();
    expect(matte.eclipse).toBe(false);
    expect(matte.badge).toBeNull();
    expect(matte.hallmark).toBeNull();
    expect(matte.border).toBe(TIER_COLORS.gold);
  });

  it("gives an Eclipse its serial instead of a name badge, on its own ground", () => {
    const eclipse = base({ foil: true, foilType: "eclipse" });
    expect(eclipse.eclipse).toBe(true);
    expect(eclipse.hallmark).toBe(ECLIPSE_HALLMARK);
    expect(eclipse.badge).toBeNull();
    expect(eclipse.border).toBe(ECLIPSE_GOLD);
    expect(eclipse.panel).not.toBe(PANEL);
    expect(eclipse.ground).not.toBe(GROUND);
  });

  it("prints the ribbon on a signed copy and the ink when it is really ink", () => {
    const signed = base({ signed: true, autograph: INK });
    expect(signed.ribbon).toBe(SIGNED_RIBBON);
    expect(signed.ink).toBe(INK);
  });

  it("still says SIGNED when the ink is missing — the column is the fact", () => {
    const signed = base({ signed: true, autograph: null });
    expect(signed.ribbon).toBe(SIGNED_RIBBON);
    expect(signed.ink).toBeNull();
  });

  it("refuses anything that is not a png data url near the renderer", () => {
    // satori fetches an <img src> itself with no fallback: a url that is
    // slow, gone, or not an image fails the WHOLE picture, not just the
    // signature.
    for (const junk of ["https://evil.example/x.png", "/signatures/7.png", "data:text/html,<script>", ""]) {
      expect(base({ autograph: junk }).ink).toBeNull();
    }
    expect(base({ autograph: INK }).ink).toBe(INK);
  });

  it("marks a copy as signed off the ink alone when the flag is stale", () => {
    expect(base({ signed: false, autograph: INK }).ribbon).toBe(SIGNED_RIBBON);
  });
});
