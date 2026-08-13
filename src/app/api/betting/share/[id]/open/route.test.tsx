import { describe, expect, it, vi } from "vitest";

// share.ts (imported transitively) is `import "server-only"`.
vi.mock("server-only", () => ({}));

// ImageResponse rendering (Satori/Resvg via next/og) needs Next's own
// bundler-resolved "react-server"/edge export condition — it can't be
// exercised under vitest/jsdom (confirmed: even a bare Node ESM import of
// "next/og" outside Next's build fails to resolve). So this is a wiring
// smoke test only, per the task brief: assert the route calls shareModel
// with the right id, 404s on a miss, and hands ImageResponse the expected
// element/size on a hit — not that a PNG actually comes out the other end.
const { ImageResponseMock } = vi.hoisted(() => ({
  ImageResponseMock: vi.fn(function ImageResponseStub(this: { el: unknown; opts: unknown }, el: unknown, opts: unknown) {
    this.el = el;
    this.opts = opts;
  }),
}));
vi.mock("next/og", () => ({ ImageResponse: ImageResponseMock }));

const { shareModelMock } = vi.hoisted(() => ({ shareModelMock: vi.fn() }));
vi.mock("@/lib/betting/share", () => ({ shareModel: shareModelMock }));

import { alt, size, contentType, dynamic, GET } from "./route";

const teamA = { id: 1, name: "Alpha FC", short_code: "ALP", color: "#111", logo_url: null };
const teamB = { id: 2, name: "Bravo United", short_code: "BRA", color: "#222", logo_url: null };

describe("share/[id]/open route", () => {
  it("exports the opengraph-image metadata Next expects", () => {
    expect(alt).toBeTruthy();
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(dynamic).toBe("force-dynamic");
  });

  it("404s without calling shareModel for a non-numeric id", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(404);
    expect(shareModelMock).not.toHaveBeenCalled();
  });

  it("404s when shareModel finds no market", async () => {
    shareModelMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "42" }) });
    expect(shareModelMock).toHaveBeenCalledWith(42);
    expect(res.status).toBe(404);
  });

  it("renders an ImageResponse sized to the card when the market exists", async () => {
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

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "42" }) });

    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
    const [, opts] = ImageResponseMock.mock.calls[0];
    expect(opts).toMatchObject({ width: 1200, height: 630 });
    expect(res).toBe(ImageResponseMock.mock.results[0].value);
  });
});
