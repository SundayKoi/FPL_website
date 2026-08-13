import { describe, expect, it, vi } from "vitest";

// share.ts (imported transitively) is `import "server-only"`.
vi.mock("server-only", () => ({}));

// See src/app/api/betting/share/[id]/open/route.test.tsx's header comment:
// ImageResponse can't actually be rendered under vitest/jsdom, so this is a
// wiring smoke test — shareModel gets the right id, a miss 404s (same
// null->404 contract as the /open and /result routes), and a hit hands
// ImageResponse a card-sized element.
const { ImageResponseMock } = vi.hoisted(() => ({
  ImageResponseMock: vi.fn(function ImageResponseStub(this: { el: unknown; opts: unknown }, el: unknown, opts: unknown) {
    this.el = el;
    this.opts = opts;
  }),
}));
vi.mock("next/og", () => ({ ImageResponse: ImageResponseMock }));

const { shareModelMock } = vi.hoisted(() => ({ shareModelMock: vi.fn() }));
vi.mock("@/lib/betting/share", async () => {
  const actual = await vi.importActual<typeof import("@/lib/betting/share")>("@/lib/betting/share");
  return { ...actual, shareModel: shareModelMock };
});

import { alt, size, contentType, dynamic } from "./opengraph-image";
import Image from "./opengraph-image";

const teamA = { id: 1, name: "Alpha FC", short_code: "ALP", color: "#111", logo_url: null };
const teamB = { id: 2, name: "Bravo United", short_code: "BRA", color: "#222", logo_url: null };

describe("betting/market/[id] opengraph-image", () => {
  it("exports the opengraph-image metadata Next expects", () => {
    expect(alt).toBeTruthy();
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(dynamic).toBe("force-dynamic");
  });

  it("404s when shareModel finds no market", async () => {
    shareModelMock.mockResolvedValueOnce(null);
    const res = await Image({ params: Promise.resolve({ id: "99" }) });
    expect(shareModelMock).toHaveBeenCalledWith(99);
    expect(res.status).toBe(404);
    expect(ImageResponseMock).not.toHaveBeenCalled();
  });

  it("renders an OPEN market's odds bar into the card", async () => {
    shareModelMock.mockResolvedValueOnce({
      id: 5,
      title: "Matchday 1",
      status: "OPEN",
      team_a: teamA,
      team_b: teamB,
      pool_a: 60,
      pool_b: 40,
      pool_draw: 0,
      draw_enabled: false,
      resolve: null,
    });

    await Image({ params: Promise.resolve({ id: "5" }) });

    const [, opts] = ImageResponseMock.mock.calls[0];
    expect(opts).toMatchObject({ width: 1200, height: 630 });
  });
});
