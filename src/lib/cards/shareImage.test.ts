import { describe, expect, it } from "vitest";
import { cardImageUrl } from "./shareImage";

describe("cardImageUrl", () => {
  it("asks for a specific archived print when the pull came from one", () => {
    expect(cardImageUrl("https://fpl.example", "doug-na1", "2026-08-24")).toBe(
      "https://fpl.example/card/doug-na1/card.png?w=2026-08-24",
    );
  });

  it("falls back to a weekly cache key for a live card", () => {
    // Wednesday 26 August 2026 sits in the week of Monday the 24th.
    expect(cardImageUrl("https://fpl.example", "doug-na1", null, new Date("2026-08-26T15:00:00Z"))).toBe(
      "https://fpl.example/card/doug-na1/card.png?v=2026-08-24",
    );
  });

  it("turns the url over every Monday, which is the whole point", () => {
    const a = cardImageUrl("", "doug-na1", null, new Date("2026-08-26T15:00:00Z"));
    const b = cardImageUrl("", "doug-na1", null, new Date("2026-09-02T15:00:00Z"));
    expect(a).not.toBe(b);
  });

  it("never returns a bare url — an unkeyed url is the bug", () => {
    for (const week of ["2026-08-24", null]) {
      expect(cardImageUrl("", "doug-na1", week)).toContain("?");
    }
  });

  it("takes an empty site for a same-origin path", () => {
    expect(cardImageUrl("", "doug-na1", "2026-08-24")).toBe("/card/doug-na1/card.png?w=2026-08-24");
  });

  it("escapes the week rather than pasting it in raw", () => {
    expect(cardImageUrl("", "doug-na1", "a b")).toContain("w=a%20b");
  });
});
