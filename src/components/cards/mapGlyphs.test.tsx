import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ROADS } from "@/lib/expeditions/routes";
import { GLYPH_PATHS, MapGlyph, PLACE_GLYPHS, glyphFor, type MapGlyphName } from "./mapGlyphs";

// Every place a road can draw, from the road table itself: a place added to
// ROADS without a glyph fails here instead of quietly drawing a waypoint.
const placeKeys = [...new Set(Object.values(ROADS).flatMap((slots) => slots.flatMap((slot) => slot.map((place) => place.key))))];

describe("the map's glyph set", () => {
  it("maps every place key on every road to a glyph", () => {
    expect(placeKeys.length).toBeGreaterThan(40);
    const unmapped = placeKeys.filter((key) => !Object.hasOwn(PLACE_GLYPHS, key));
    expect(unmapped).toEqual([]);
    for (const key of placeKeys) {
      expect(glyphFor(key)).not.toBe("waypoint");
      expect(GLYPH_PATHS[glyphFor(key)]).toBeTruthy();
    }
  });

  it("names no place that is not on a road", () => {
    // A stale key would be harmless, but it would also hide a rename.
    expect(Object.keys(PLACE_GLYPHS).filter((key) => !placeKeys.includes(key))).toEqual([]);
  });

  it("draws the question mark for a place with no key, the waypoint for a key with no family", () => {
    expect(glyphFor(null)).toBe("unknown");
    expect(glyphFor(undefined)).toBe("unknown");
    expect(glyphFor("")).toBe("unknown");
    expect(glyphFor("somewhere-new")).toBe("waypoint");
    // Only the table's own keys count, not what an object inherits.
    expect(glyphFor("toString")).toBe("waypoint");
  });

  it("keeps every glyph to drawable path data inside its 18-unit box", () => {
    for (const [name, d] of Object.entries(GLYPH_PATHS) as [MapGlyphName, string][]) {
      expect(d, name).toMatch(/^M/);
      const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
      expect(numbers.every((n) => Number.isFinite(n) && Math.abs(n) <= 20), name).toBe(true);
    }
  });

  it("centres a glyph on its point and holds the stroke at any size", () => {
    const { container } = render(
      <svg>
        <MapGlyph name="bridge" x={100} y={50} size={9} stroke={1.5} />
      </svg>,
    );
    const path = container.querySelector("path")!;
    expect(path.getAttribute("data-glyph")).toBe("bridge");
    expect(path.getAttribute("transform")).toBe("translate(95.5 45.5) scale(0.5)");
    // 1.5 units on the chart, drawn inside a box scaled by a half.
    expect(path.getAttribute("stroke-width")).toBe("3");
    expect(path.getAttribute("stroke")).toBe("currentColor");
  });
});
