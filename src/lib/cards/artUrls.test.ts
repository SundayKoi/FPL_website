import { describe, expect, it, vi, afterEach } from "vitest";
import { cardArtUrls, preloadArt } from "./artUrls";
import type { PlayerCardData } from "./build";

const card = (over: Partial<PlayerCardData> = {}) =>
  ({ artSkin: 0, signature: { champion: "Jhin", games: 4 }, ...over }) as unknown as PlayerCardData;

afterEach(() => vi.unstubAllGlobals());

describe("cardArtUrls", () => {
  it("takes a player card's champion off its signature, at the print's skin", () => {
    expect(cardArtUrls(card({ artSkin: 3 }))[0]).toContain("Jhin_3");
  });

  it("finds the champion wherever the card type keeps it", () => {
    // The bug this exists to stop repeating: reading only `signature` left
    // every relic and moment rendering as an empty frame.
    expect(cardArtUrls(card({ signature: null, moment: { champion: "Ahri" } } as Partial<PlayerCardData>))[0]).toContain(
      "Ahri",
    );
    expect(
      cardArtUrls(card({ signature: null, champWin: { champion: "Cho'Gath" } } as Partial<PlayerCardData>))[0],
    ).toContain("Chogath");
  });

  it("warms the splash for a relic, not the centered crop it never renders", () => {
    const [url] = cardArtUrls(card({ signature: null, champWin: { champion: "Ahri" } } as Partial<PlayerCardData>));
    expect(url).toContain("/splash/");
    expect(url).not.toContain("/centered/");
  });

  it("returns all five panels of a roster plate", () => {
    const plate = card({
      signature: null,
      team: {
        slots: [
          { champion: "Ornn" },
          { champion: "Lee Sin" },
          { champion: "Ahri" },
          { champion: "Jhin" },
          { champion: "Thresh" },
        ],
      },
    } as Partial<PlayerCardData>);
    expect(cardArtUrls(plate)).toHaveLength(5);
    expect(cardArtUrls(plate)[2]).toContain("Ahri");
  });

  it("says nothing rather than guessing when there is no champion", () => {
    expect(cardArtUrls(card({ signature: null }))).toEqual([]);
    expect(cardArtUrls(null)).toEqual([]);
    // An empty panel on a plate is skipped, not rendered as a broken url.
    expect(
      cardArtUrls(card({ signature: null, team: { slots: [{ champion: null }, { champion: "Ahri" }] } } as Partial<PlayerCardData>)),
    ).toHaveLength(1);
  });
});

describe("preloadArt", () => {
  it("starts a fetch per url without rendering anything", () => {
    const created: string[] = [];
    class FakeImage {
      decoding = "";
      set src(value: string) {
        created.push(value);
      }
      decode() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal("window", { ...globalThis, Image: FakeImage });

    preloadArt(["a.jpg", "b.jpg"]);
    expect(created).toEqual(["a.jpg", "b.jpg"]);
  });

  it("swallows a failure — a warm cache is an optimisation, not a dependency", () => {
    class ExplodingImage {
      constructor() {
        throw new Error("no Image here");
      }
    }
    vi.stubGlobal("window", { ...globalThis, Image: ExplodingImage });

    expect(() => preloadArt(["a.jpg"])).not.toThrow();
  });
});
