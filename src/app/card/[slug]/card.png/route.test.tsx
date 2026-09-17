import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { ImageResponseMock } = vi.hoisted(() => ({
  ImageResponseMock: vi.fn(function ImageResponseStub(this: { element: unknown; options: unknown }, element: unknown, options: unknown) {
    this.element = element;
    this.options = options;
  }),
}));
const { fetchAllCardSeasonsMock, fetchCardBySlugMock, resolvePrintArtUrlMock, createClientMock } = vi.hoisted(() => ({
  fetchAllCardSeasonsMock: vi.fn(),
  fetchCardBySlugMock: vi.fn(),
  resolvePrintArtUrlMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("next/og", () => ({ ImageResponse: ImageResponseMock }));
vi.mock("@/lib/cards/queries", () => ({
  fetchAllCardSeasons: fetchAllCardSeasonsMock,
  fetchCardBySlug: fetchCardBySlugMock,
}));
vi.mock("@/lib/packs/skins", () => ({ resolvePrintArtUrl: resolvePrintArtUrlMock }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { GET } from "./route";
import type { PlayerCardData } from "@/lib/cards/build";

const card = {
  slug: "alice-na1",
  name: "Alice",
  tag: "NA1",
  signature: { champion: "Jhin", games: 5 },
  artChampion: "Lux",
  artSkin: 64,
  tier: { key: "gold", label: "Gold" },
  role: "Mid",
  overall: 80,
  teamName: null,
  archetype: "Carry",
  motto: null,
  season: "S5",
  topChampions: [],
  form: [],
  subStats: [],
  highlights: [],
  badges: [],
  standout: false,
  wins: 4,
  losses: 1,
  winratePct: 80,
  level: 5,
  pentas: 0,
} as unknown as PlayerCardData;

describe("/card/[slug]/card.png", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
    fetchAllCardSeasonsMock.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardBySlugMock.mockResolvedValue(card);
    resolvePrintArtUrlMock.mockResolvedValue("https://cdn.example/lux-64.jpg");
  });

  it("resolves generated share art from the explicit cosmetic champion", async () => {
    await GET(new Request("http://fpl.test/card/alice-na1/card.png"), { params: Promise.resolve({ slug: "alice-na1" }) });

    expect(resolvePrintArtUrlMock).toHaveBeenCalledWith("Lux", 64);
    expect(resolvePrintArtUrlMock).not.toHaveBeenCalledWith("Jhin", 64);
    expect(ImageResponseMock).toHaveBeenCalledTimes(1);
  });
});
