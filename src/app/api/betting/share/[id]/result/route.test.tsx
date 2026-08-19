import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { dynamic, GET } from "./route";

const teamA = { id: 1, name: "Alpha FC", short_code: "ALP", color: "#111", logo_url: null };
const teamB = { id: 2, name: "Bravo United", short_code: "BRA", color: "#222", logo_url: null };

describe("share/[id]/result route", () => {
  // Each test's `ImageResponseMock.mock.calls[0]` assertion assumes it's the
  // only call ImageResponseMock has seen — clear both mocks' call history
  // between tests (not their implementations, which the vi.mock factories
  // above set once) so an earlier test's render doesn't leak into a later
  // assertion.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses dynamic rendering for the route handler", () => {
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

  it("caches a RESOLVED market's card forever — its content can never change again", async () => {
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

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "7" }) });

    const [, opts] = ImageResponseMock.mock.calls[0] as [unknown, { headers?: Record<string, string> }];
    expect(opts.headers).toEqual({ "Cache-Control": "public, max-age=31536000, immutable" });
  });

  it("caches a CANCELLED market's card forever too", async () => {
    shareModelMock.mockResolvedValueOnce({
      id: 8,
      title: "Matchday 2",
      status: "CANCELLED",
      team_a: teamA,
      team_b: teamB,
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      draw_enabled: false,
      resolve: null,
    });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "8" }) });

    const [, opts] = ImageResponseMock.mock.calls[0] as [unknown, { headers?: Record<string, string> }];
    expect(opts.headers).toEqual({ "Cache-Control": "public, max-age=31536000, immutable" });
  });

  it("does not cache a still-open market's card", async () => {
    shareModelMock.mockResolvedValueOnce({
      id: 9,
      title: "Matchday 3",
      status: "OPEN",
      team_a: teamA,
      team_b: teamB,
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      draw_enabled: false,
      resolve: null,
    });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "9" }) });

    const [, opts] = ImageResponseMock.mock.calls[0] as [unknown, { headers?: Record<string, string> }];
    expect(opts.headers).toEqual({ "Cache-Control": "no-store" });
  });
});
