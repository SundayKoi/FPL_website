import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { DRIBB_CHANCE, DRIBB_COPIES, DRIBB_LOOK, DRIBB_SLUG, DRIBB_TIER, dribbCard, dribbLabel, dribbLook, rollDribb } from "./dribb";
import { canDust, dustValueOf, PACK_SIZE } from "@/lib/packs/config";

afterEach(cleanup);

describe("the Dribb card", () => {
  it("is one in ten thousand packs, five ever, filed under its own tier", () => {
    expect(DRIBB_CHANCE).toBe(1 / 10000);
    expect(DRIBB_COPIES).toBe(5);
    expect(DRIBB_TIER).toBe("dribb");
    // Once per PACK, not per card: ten thousand packs, not two thousand.
    expect(Math.round(1 / DRIBB_CHANCE)).toBe(10000 * PACK_SIZE / PACK_SIZE);
  });

  it("rolls off one rand, and only lands under the gate", () => {
    expect(rollDribb(() => DRIBB_CHANCE / 2)).toBe(true);
    expect(rollDribb(() => DRIBB_CHANCE)).toBe(false);
    expect(rollDribb(() => 0.5)).toBe(false);
  });

  it("freezes Dribb, all 99s, on Bard, numbered and in the pack's season", () => {
    const card = dribbCard(3, "S5");
    expect(card.slug).toBe(DRIBB_SLUG);
    expect(card.name).toBe("Dribb");
    expect(card.overall).toBe(99);
    expect(card.subStats.every((stat) => stat.value === 99)).toBe(true);
    expect(card.signature?.champion).toBe("Bard");
    expect(card.teamName).toBeNull();
    expect(card.season).toBe("S5");
    expect(card.serial).toBe(3);
    expect(card.collectionSize).toBe(DRIBB_COPIES);
    expect(card.dribb).toEqual({ number: 3, of: DRIBB_COPIES });
    expect(dribbLabel(card.dribb!)).toBe("3 of 5");
  });

  it("never dusts, from the flag or from the tier", () => {
    expect(canDust({ foilType: null, dribb: true })).toBe(false);
    expect(canDust({ foilType: null, tier: DRIBB_TIER })).toBe(false);
    expect(canDust({ foilType: null, tier: "challenger" })).toBe(true);
    expect(dustValueOf({ tier: DRIBB_TIER, foil: false, signed: false })).toBe(0);
    expect(dustValueOf({ tier: "challenger", foil: false, signed: false, dribb: true })).toBe(0);
  });

  it("wears the Aether Rift off its own stamp, with a coin and the serial line", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const cls of [...DRIBB_LOOK.front, DRIBB_LOOK.artEcho!]) {
      expect(css.includes(`@utility ${cls} `) || css.includes(`@utility ${cls}\n`) || css.includes(`@utility ${cls}{`), cls).toBe(true);
    }
    render(<PlayerCard3D card={dribbCard(1, "S5")} />);
    expect(screen.getByTestId("overlay")).toBeTruthy();
    expect(screen.getByTestId("dribb-stamp")).toBeTruthy();
    expect(screen.getByText(`DRIBB · 1 OF ${DRIBB_COPIES}`)).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("the Dribb card 1 of 5");
  });

  it("stamps each copy with ITS number, not the specimen's", () => {
    // The shipped bug: every minted copy wore the specimen's chip, so the
    // fourth Dribb in the world introduced itself as "1 OF 5" — a lie on
    // the one card whose entire point is which of the five it is. The coin
    // and the aria label were right all along; only the chip was frozen.
    render(<PlayerCard3D card={dribbCard(4, "S5")} />);
    expect(screen.getByText(`DRIBB · 4 OF ${DRIBB_COPIES}`)).toBeTruthy();
    expect(screen.queryByText(`DRIBB · 1 OF ${DRIBB_COPIES}`)).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("the Dribb card 4 of 5");
    expect(dribbLook({ number: 4, of: DRIBB_COPIES })).toMatchObject({
      chip: `DRIBB · 4 OF ${DRIBB_COPIES}`,
      front: DRIBB_LOOK.front,
      artEcho: DRIBB_LOOK.artEcho,
    });
  });

  it("leaves an ordinary card alone", () => {
    const card = { ...dribbCard(1, "S5"), dribb: null, slug: "someone", name: "Someone" };
    render(<PlayerCard3D card={card} />);
    expect(screen.queryByTestId("overlay")).toBeNull();
    expect(screen.queryByTestId("dribb-stamp")).toBeNull();
  });
});
