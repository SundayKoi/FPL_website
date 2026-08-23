import { beforeEach, describe, expect, it, vi } from "vitest";

// The route dependencies use server-only and next/og export conditions that
// Vitest/jsdom cannot load directly. Keep the route logic real and replace
// only those framework boundaries.
vi.mock("server-only", () => ({}));

const { ImageResponseMock } = vi.hoisted(() => ({
  ImageResponseMock: vi.fn(function ImageResponseStub(
    this: { el: unknown; opts: unknown },
    el: unknown,
    opts: unknown,
  ) {
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

import { dynamic as openDynamic, GET as getOpen } from "./open/route";
import { dynamic as resultDynamic, GET as getResult } from "./result/route";

const teamA = { id: 1, name: "Alpha FC", short_code: "ALP", color: "#111", logo_url: null };
const teamB = { id: 2, name: "Bravo United", short_code: "BRA", color: "#222", logo_url: null };

const routeCases = [
  ["open", getOpen, "42"],
  ["result", getResult, "7"],
] as const;

describe("betting share image routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["open", openDynamic],
    ["result", resultDynamic],
  ])("uses dynamic rendering for the %s route", (_name, dynamic) => {
    expect(dynamic).toBe("force-dynamic");
  });

  it.each(routeCases)("404s without loading a market for a non-numeric %s id", async (_name, get) => {
    const response = await get(new Request("http://x"), { params: Promise.resolve({ id: "invalid" }) });

    expect(response.status).toBe(404);
    expect(shareModelMock).not.toHaveBeenCalled();
  });

  it.each(routeCases)("404s when the %s route cannot find its market", async (_name, get, id) => {
    shareModelMock.mockResolvedValueOnce(null);

    const response = await get(new Request("http://x"), { params: Promise.resolve({ id }) });

    expect(shareModelMock).toHaveBeenCalledWith(Number(id));
    expect(response.status).toBe(404);
  });

  it("renders the open-market card at the expected size", async () => {
    shareModelMock.mockResolvedValueOnce({
      id: 42,
      title: "Matchday 1",
      status: "OPEN",
      team_a: teamA,
      team_b: teamB,
      pool_a: 0,
      pool_b: 0,
      pool_draw: 0,
      draw_enabled: false,
      resolve: null,
    });

    const response = await getOpen(new Request("http://x"), { params: Promise.resolve({ id: "42" }) });

    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
    const [, options] = ImageResponseMock.mock.calls[0];
    expect(options).toMatchObject({ width: 1200, height: 630 });
    expect(response).toBe(ImageResponseMock.mock.results[0].value);
  });

  it("renders the resolved-market card at the expected size", async () => {
    shareModelMock.mockResolvedValueOnce(resolvedMarket());

    const response = await getResult(new Request("http://x"), { params: Promise.resolve({ id: "7" }) });

    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
    const [, options] = ImageResponseMock.mock.calls[0];
    expect(options).toMatchObject({ width: 1200, height: 630 });
    expect(response).toBe(ImageResponseMock.mock.results[0].value);
  });

  it.each([
    ["RESOLVED", resolvedMarket(), "public, max-age=31536000, immutable"],
    [
      "CANCELLED",
      { ...resolvedMarket(), id: 8, status: "CANCELLED", resolve: null },
      "public, max-age=31536000, immutable",
    ],
    ["OPEN", { ...resolvedMarket(), id: 9, status: "OPEN", resolve: null }, "no-store"],
  ])("sets the expected cache policy for a %s market", async (_status, market, cacheControl) => {
    shareModelMock.mockResolvedValueOnce(market);

    await getResult(new Request("http://x"), { params: Promise.resolve({ id: String(market.id) }) });

    const [, options] = ImageResponseMock.mock.calls[0] as [
      unknown,
      { headers?: Record<string, string> },
    ];
    expect(options.headers).toEqual({ "Cache-Control": cacheControl });
  });
});

function resolvedMarket() {
  return {
    id: 7,
    title: "Matchday 1",
    status: "RESOLVED",
    team_a: teamA,
    team_b: teamB,
    pool_a: 100,
    pool_b: 40,
    pool_draw: 0,
    draw_enabled: false,
    resolve: {
      drawn: false,
      winner: teamA,
      pool: 140,
      winners: 1,
      topUsername: "TopBettor",
      topProfit: 60,
    },
  };
}
