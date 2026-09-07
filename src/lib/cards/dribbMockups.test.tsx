import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { PACK_SIZE } from "@/lib/packs/config";
import { AETHER_VARIANTS, DRIBB_COPIES, DRIBB_LOOKS, DRIBB_RATES, dribbPacksPerPull } from "./dribbMockups";

const ALL_LOOKS = [...DRIBB_LOOKS, ...AETHER_VARIANTS];
import { sampleCard } from "./samples";

afterEach(cleanup);

describe("the Dribb card mockups", () => {
  it("are four distinct looks, each stamped 1 of 5", () => {
    expect(DRIBB_LOOKS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ALL_LOOKS.map((look) => look.key)).size).toBe(ALL_LOOKS.length);
    for (const look of ALL_LOOKS) {
      expect(look.blurb.length).toBeGreaterThan(20);
      expect(look.chip).toContain(`1 OF ${DRIBB_COPIES}`);
    }
  });

  it("only name CSS layers that globals.css defines", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const look of ALL_LOOKS) {
      for (const cls of [...look.front, ...(look.artEcho ? [look.artEcho] : [])]) {
        expect(css.includes(`@utility ${cls} `) || css.includes(`@utility ${cls}\n`) || css.includes(`@utility ${cls}{`), cls).toBe(true);
      }
    }
  });

  it.each(ALL_LOOKS.map((look) => look.key))("renders the %s look on Dribb", (key) => {
    const look = ALL_LOOKS.find((entry) => entry.key === key)!;
    render(<PlayerCard3D card={{ ...sampleCard(), collectionSize: DRIBB_COPIES }} overlay={look} interactive />);
    expect(screen.getByTestId("overlay")).toBeTruthy();
    expect(screen.getAllByText(/Dribb/).length).toBeGreaterThan(0);
  });

  it("prices the odds in packs", () => {
    expect(DRIBB_RATES).toEqual([1 / 5000, 1 / 10000]);
    expect(dribbPacksPerPull(1 / 5000)).toBe(Math.round(5000 / PACK_SIZE));
    expect(dribbPacksPerPull(1 / 10000)).toBe(Math.round(10000 / PACK_SIZE));
  });
});
