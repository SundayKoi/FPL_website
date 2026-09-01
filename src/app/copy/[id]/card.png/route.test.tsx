import { beforeEach, describe, expect, it, vi } from "vitest";

// The route's dependencies use server-only and next/og export conditions
// that Vitest/jsdom cannot load. Keep the route logic real and replace only
// those framework boundaries — plus the art probe, which is a network call.
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

const { maybeSingleMock, eqMock, selectMock, fromMock, serviceClientMock, resolvePrintArtUrlMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  // Typed so the assertions below can read what the route asked for —
  // which table, which columns, which id — rather than trusting that it
  // asked at all.
  const eqMock = vi.fn<(column: string, value: unknown) => { maybeSingle: typeof maybeSingleMock }>(() => ({
    maybeSingle: maybeSingleMock,
  }));
  const selectMock = vi.fn<(columns: string) => { eq: typeof eqMock }>(() => ({ eq: eqMock }));
  const fromMock = vi.fn<(table: string) => { select: typeof selectMock }>(() => ({ select: selectMock }));
  return {
    maybeSingleMock,
    eqMock,
    selectMock,
    fromMock,
    serviceClientMock: vi.fn(() => ({ from: fromMock })),
    resolvePrintArtUrlMock: vi.fn(),
  };
});
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: serviceClientMock }));
vi.mock("@/lib/packs/skins", () => ({ resolvePrintArtUrl: resolvePrintArtUrlMock }));

import { GET, runtime } from "./route";
import type { PlayerCardData } from "@/lib/cards/build";

const INK = "data:image/png;base64,aGVsbG8=";

function frozenCard(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: "doug-na1",
    name: "Doug",
    tag: "NA1",
    teamName: "The Faceless",
    teamImageUrl: null,
    role: "Mid",
    overall: 87,
    tier: { key: "gold", label: "Gold" },
    archetype: "Carry",
    signature: { champion: "Ahri", games: 12 },
    artSkin: 4,
    motto: null,
    serial: 3,
    collectionSize: 40,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 12,
    losses: 3,
    winratePct: 80,
    level: 15,
    pentas: 0,
    season: "2026",
    ...overrides,
  } as PlayerCardData;
}

function copyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 4211,
    card: frozenCard(),
    foil: true,
    foil_type: "ice",
    signed: false,
    edition_week: "2026-08-24",
    season: "2026",
    ...overrides,
  };
}

/** What the render was actually handed. */
function renderedInput() {
  const [element] = ImageResponseMock.mock.calls[0];
  return element;
}

function printedText(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) printedText(child, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  printedText((node as { props?: { children?: unknown } }).props?.children, out);
  return out;
}

describe("/copy/[id]/card.png", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvePrintArtUrlMock.mockResolvedValue("https://cdn.example/ahri-4.jpg");
  });

  it("renders on the Node runtime, like its sibling", () => {
    expect(runtime).toBe("nodejs");
  });

  it.each([["0"], ["-1"], ["1e9"], ["abc"], ["07"], [" 1"], ["1;drop"]])(
    "refuses %s without going near the database",
    async (id) => {
      const response = await GET(new Request("http://x"), { params: Promise.resolve({ id }) });

      expect(serviceClientMock).not.toHaveBeenCalled();
      expect(ImageResponseMock).toHaveBeenCalledTimes(1);
      expect(printedText(renderedInput()).join(" ")).toContain("Copy not found");
      expect(response).toBe(ImageResponseMock.mock.results[0].value);
    },
  );

  it("serves the placeholder image rather than a 404 for a dusted copy", async () => {
    // The url outlives the copy in whatever message posted it, and a 404
    // there is a broken-image icon in the middle of that message.
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(printedText(renderedInput()).join(" ")).toContain("Copy not found");
  });

  it("survives a database error the same way", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(printedText(renderedInput()).join(" ")).toContain("Copy not found");
  });

  it("reads the copy through the service client, by id", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: copyRow(), error: null });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(fromMock).toHaveBeenCalledWith("card_inventory");
    expect(eqMock).toHaveBeenCalledWith("id", 4211);
    const columns = selectMock.mock.calls[0][0];
    for (const column of ["id", "card", "foil", "foil_type", "signed", "edition_week", "season"]) {
      expect(columns).toContain(column);
    }
  });

  it("pictures the copy's own cosmetics and edition", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: copyRow(), error: null });

    const response = await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    const printed = printedText(renderedInput()).join(" | ");
    expect(printed).toContain("Cracked Ice");
    expect(printed).toContain("WK Aug 24 edition · Season 2026");
    const [, options] = ImageResponseMock.mock.calls[0];
    expect(options).toMatchObject({ width: 1200, height: 630 });
    expect(response).toBe(ImageResponseMock.mock.results[0].value);
  });

  it("prints the ink a signed copy was frozen with", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: copyRow({ signed: true, card: frozenCard({ autograph: INK }) }),
      error: null,
    });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(printedText(renderedInput()).join(" | ")).toContain("SIGNED");
  });

  it("resolves the art the copy froze, not the skin its player has since chosen", async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: copyRow(), error: null });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(resolvePrintArtUrlMock).toHaveBeenCalledWith("Ahri", 4);
  });

  it("falls back to base centered art when the frozen print no longer resolves", async () => {
    // satori has no onError: an unresolved url would fail the whole image.
    resolvePrintArtUrlMock.mockResolvedValueOnce(null);
    maybeSingleMock.mockResolvedValueOnce({ data: copyRow(), error: null });

    await GET(new Request("http://x"), { params: Promise.resolve({ id: "4211" }) });

    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
  });
});
