import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OVERLAY_GROUP_TITLES, OVERLAY_MOCKUPS } from "./overlayMockups";

describe("the overlay mockups", () => {
  it("have unique keys, a blurb, a source, and a group with a title", () => {
    expect(new Set(OVERLAY_MOCKUPS.map((entry) => entry.key)).size).toBe(OVERLAY_MOCKUPS.length);
    for (const entry of OVERLAY_MOCKUPS) {
      expect(entry.blurb.length).toBeGreaterThan(20);
      expect(entry.earn.length).toBeGreaterThan(10);
      expect(OVERLAY_GROUP_TITLES[entry.group]).toBeTruthy();
      // A variant set is the whole idea, so an entry with variants has no
      // front of its own to draw twice.
      if (entry.variants) expect(entry.variants.length).toBeGreaterThan(1);
    }
  });

  it("only name CSS layers that globals.css actually defines", () => {
    // A layer class with no utility behind it renders as nothing, and a
    // mockup page that shows nothing looks like a working design that is
    // simply subtle. Every class named here has to exist.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const entry of OVERLAY_MOCKUPS) {
      const layers = [
        ...entry.front,
        ...(entry.back ?? []),
        ...(entry.artEcho ? [entry.artEcho] : []),
        ...(entry.variants ?? []).flatMap((variant) => [...variant.front, ...(variant.artEcho ? [variant.artEcho] : [])]),
      ];
      for (const cls of layers) {
        expect(css.includes(`@utility ${cls} `) || css.includes(`@utility ${cls}\n`) || css.includes(`@utility ${cls}{`), cls).toBe(true);
      }
    }
    if (OVERLAY_MOCKUPS.some((entry) => entry.ink)) expect(css).toContain("@utility card-ov-ink-write");
  });
});
