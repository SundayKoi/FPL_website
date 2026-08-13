import { describe, expect, it, vi } from "vitest";

// share.ts (imported transitively) is `import "server-only"`.
vi.mock("server-only", () => ({}));

// See open/route.test.tsx's header comment: ImageResponse can't actually be
// rendered under vitest/jsdom, so this is a wiring smoke test — shareModel
// gets the right id, a miss 404s, a hit hands ImageResponse a card-sized
// element.
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

import { alt, size, contentType, dynamic, GET } from "./route";

const teamA = { id: 1, name: "Alpha FC", short_code: "ALP", color: "#111", logo_url: null };
const teamB = { id: 2, name: "Bravo United", short_code: "BRA", color: "#222", logo_url: null };

describe("share/[id]/result route", () => {
  it("exports the opengraph-image metadata Next expects", () => {
    expect(alt).toBeTruthy();
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(dynamic).toBe("force-dynamic");
  });

  it("404s without calling shareModel for a non-numeric id", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(shareModelMock).not.toHaveBeenCalled();
  });

  it("404s when shareModel finds no market", async () => {
    shareModelMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "7" }) });
    expect(shareModelMock).toHaveBeenCalledWith(7);
    expect(res.status).toBe(404);
  });

  it("renders a resolved market's winner summary into the ImageResponse", async () => {
    shareModelMock.mockResolvedValueOnce({
      id: 7,
      title: "Matchday 1",
      status: "RESOLVED",
      team_a: teamA,
      team_b: teamB,
      pool_a: 100,
      pool_b: 40,
      pool_draw: 0,
      draw_enabled: false,
      resolve: { drawn: false, winner: teamA, pool: 140, winners: 1, topUsername: "TopBettor", topProfit: 60 },
    });

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "7" }) });

    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
    const [, opts] = ImageResponseMock.mock.calls[0];
    expect(opts).toMatchObject({ width: 1200, height: 630 });
    expect(res).toBe(ImageResponseMock.mock.results[0].value);
  });
});
