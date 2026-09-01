import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Framework boundaries only. The handler's own logic — the ranking, the
// chips, the refusals — stays real; `after()` is captured so the deferred
// work can be run on demand, and the reads are mocked because this file is
// about what /flex decides, not about PostgREST.
vi.mock("server-only", () => ({}));

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMock }));

// `rpc` is here for ensureUser's signup-bonus grant, which every
// wallet-touching handler runs first and none of these tests care about.
const { serviceClientMock } = vi.hoisted(() => ({
  serviceClientMock: vi.fn(() => ({ rpc: vi.fn(async () => ({ data: null, error: null })) })),
}));
vi.mock("../service-client", () => ({ createBettingServiceClient: serviceClientMock }));

// rip.ts is imported for `resolveRipWeek`, and it drags the pack opener in
// with it; nothing here opens a pack.
vi.mock("@/lib/packs/open", () => ({ openPackFor: vi.fn() }));

const { fetchInventoryMock, fetchPrintRunsMock } = vi.hoisted(() => ({
  fetchInventoryMock: vi.fn(),
  fetchPrintRunsMock: vi.fn(),
}));
vi.mock("@/lib/packs/queries", () => ({
  fetchInventory: fetchInventoryMock,
  fetchPrintRuns: fetchPrintRunsMock,
}));

const { fetchCardSeasonMock, fetchCardEditionWeeksMock } = vi.hoisted(() => ({
  fetchCardSeasonMock: vi.fn(),
  fetchCardEditionWeeksMock: vi.fn(),
}));
vi.mock("@/lib/cards/queries", () => ({
  fetchCardSeason: fetchCardSeasonMock,
  fetchCardEditionWeeks: fetchCardEditionWeeksMock,
}));

const { bestCopy, flexEmbed, matchPlayer } = await import("./flex");
import { commandHandlers, type DiscordInteraction } from "./registry";
import { printRunKey } from "@/lib/packs/printRuns";
import type { InventoryRow } from "@/lib/packs/queries";

type CopyOverrides = Partial<InventoryRow> & { artSkin?: number; mark?: "trail" | "sigil" | "legend" };

let nextId = 1;

/** A copy, with only the facts the ranking and the chips read. */
function copy(overrides: CopyOverrides = {}): InventoryRow {
  const { artSkin, mark, ...row } = overrides;
  return {
    id: nextId++,
    season: "2026",
    slug: "doug-na1",
    playerName: "Doug",
    role: "Mid",
    editionWeek: "2026-08-24",
    overall: 80,
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    packOpenId: null,
    acquiredAt: "2026-08-25T00:00:00Z",
    printNumber: null,
    card: {
      slug: "doug-na1",
      name: "Doug",
      tier: { key: "gold", label: "Gold" },
      artSkin: artSkin ?? 0,
      ...(mark ? { expedition: { mark, tier: "raid", date: "2026-08-30" } } : {}),
    },
    ...row,
  } as unknown as InventoryRow;
}

describe("bestCopy", () => {
  it("has nothing to show for an empty collection", () => {
    expect(bestCopy([])).toBeNull();
  });

  it("puts the one-of-one above everything, ink included", () => {
    const eclipse = copy({ foil: true, foilType: "eclipse", overall: 60 });
    const signedIce = copy({ foil: true, foilType: "ice", signed: true, overall: 99 });
    expect(bestCopy([signedIce, eclipse])).toBe(eclipse);
  });

  it("takes the ink when no Eclipse is in the pile", () => {
    // Signed sits above every parallel: the roll is 1-in-100, rarer than
    // anything below Cracked Ice.
    const signed = copy({ signed: true, overall: 70 });
    const ice = copy({ foil: true, foilType: "ice", overall: 99 });
    expect(bestCopy([ice, signed])).toBe(signed);
  });

  it("ranks parallels by the ladder FOIL_TYPES already sets", () => {
    const matte = copy();
    const prisma = copy({ foil: true, foilType: "prisma" });
    const aurora = copy({ foil: true, foilType: "aurora" });
    const refractor = copy({ foil: true, foilType: "refractor" });
    const ice = copy({ foil: true, foilType: "ice" });
    expect(bestCopy([matte, prisma, aurora, refractor, ice])).toBe(ice);
    expect(bestCopy([matte, prisma, aurora, refractor])).toBe(refractor);
    expect(bestCopy([matte, prisma, aurora])).toBe(aurora);
    expect(bestCopy([matte, prisma])).toBe(prisma);
    // An unrecognised parallel reads as the base foil, not as a crash —
    // and still beats matte.
    expect(bestCopy([matte, copy({ foil: true, foilType: "kryptonite" })])?.foil).toBe(true);
  });

  it("only reads the rating once the print matches", () => {
    const better = copy({ foil: true, foilType: "ice", overall: 91 });
    const worse = copy({ foil: true, foilType: "ice", overall: 74 });
    expect(bestCopy([worse, better])).toBe(better);
    // ...and a higher rating does not rescue a worse parallel.
    const auroraStar = copy({ foil: true, foilType: "aurora", overall: 99 });
    expect(bestCopy([auroraStar, worse])).toBe(worse);
  });

  it("breaks a dead tie with the newest pull", () => {
    const older = copy({ acquiredAt: "2026-08-01T00:00:00Z" });
    const newer = copy({ acquiredAt: "2026-09-01T00:00:00Z" });
    expect(bestCopy([newer, older])).toBe(newer);
    expect(bestCopy([older, newer])).toBe(newer);
  });

  it("still picks the same copy twice for two out of one pack", () => {
    // Same instant, same everything: without the id tiebreak the flex
    // would show a different card every time it was run.
    const a = copy({ id: 10, acquiredAt: "2026-08-25T00:00:00Z" });
    const b = copy({ id: 11, acquiredAt: "2026-08-25T00:00:00Z" });
    expect(bestCopy([a, b])).toBe(b);
    expect(bestCopy([b, a])).toBe(b);
  });
});

describe("matchPlayer", () => {
  it("matches on part of a name, case-insensitively", () => {
    const doug = copy({ playerName: "Doug" });
    expect(matchPlayer([doug], "DOU")).toEqual({ rows: [doug] });
  });

  it("answers an ambiguous match with the names rather than a guess", () => {
    const ash = copy({ playerName: "Ashley" });
    const asher = copy({ playerName: "Asher" });
    expect(matchPlayer([ash, asher], "ash")).toEqual({ names: ["Ashley", "Asher"] });
  });

  it("lets an exact name win outright", () => {
    // Otherwise a collection holding both leaves the shorter name unflexable.
    const ash = copy({ playerName: "Ash" });
    const ashley = copy({ playerName: "Ashley" });
    expect(matchPlayer([ash, ashley], "Ash")).toEqual({ rows: [ash] });
  });

  it("finds nothing when nothing matches", () => {
    expect(matchPlayer([copy()], "spies")).toEqual({ rows: [] });
  });
});

describe("flexEmbed", () => {
  const ctx = { username: "Doug", site: "https://fpl.example", printRun: 43 };

  it("reads the copy out in chips", () => {
    const embed = flexEmbed(
      copy({ foil: true, foilType: "ice", signed: true, printNumber: 7, overall: 88, artSkin: 3 }),
      ctx,
    ) as { title: string; description: string };
    expect(embed.title).toBe("Doug flexes Doug");
    expect(embed.description).toContain("WK Aug 24 edition");
    expect(embed.description).toContain("Cracked Ice");
    expect(embed.description).toContain("Signed");
    expect(embed.description).toContain("#7 of 43");
    expect(embed.description).toContain("Alt art");
    expect(embed.description).toContain("Gold · 88 OVR");
  });

  it("says Matte rather than saying nothing", () => {
    const embed = flexEmbed(copy(), ctx) as { description: string };
    expect(embed.description).toContain("Matte");
    expect(embed.description).not.toContain("Signed");
    expect(embed.description).not.toContain("Alt art");
    expect(embed.description).not.toContain("#");
  });

  it("prints the bare stamp when the run size is unknown", () => {
    const embed = flexEmbed(copy({ printNumber: 7 }), { ...ctx, printRun: null }) as { description: string };
    expect(embed.description).toContain("#7");
    expect(embed.description).not.toContain("of ");
  });

  it("shows what an expedition brought home", () => {
    const embed = flexEmbed(copy({ mark: "legend" }), ctx) as { description: string };
    expect(embed.description).toContain("Legend mark");
  });

  it("pictures the copy, with the cache key that makes the url move", () => {
    const plain = flexEmbed(copy({ id: 4211 }), ctx) as { image: { url: string } };
    expect(plain.image.url).toBe("https://fpl.example/copy/4211/card.png?m=none");
    // A copy that came home marked is a different picture under the same
    // id, so the key has to change with it.
    const marked = flexEmbed(copy({ id: 4211, mark: "sigil" }), ctx) as { image: { url: string } };
    expect(marked.image.url).toBe("https://fpl.example/copy/4211/card.png?m=sigil");
    expect(marked.image.url).not.toBe(plain.image.url);
  });

  it("draws no picture when nothing knows where the site lives", () => {
    expect(flexEmbed(copy(), { ...ctx, site: "" })).not.toHaveProperty("image");
  });

  it("wears the tier's stripe", () => {
    const gold = flexEmbed(copy(), ctx) as { color: number };
    expect(gold.color).toBe(0xe8c14b);
    const unknown = flexEmbed(
      copy({ tier: "mythic", card: { tier: { key: "mythic", label: "Mythic" } } as unknown as InventoryRow["card"] }),
      ctx,
    ) as { color: number };
    expect(unknown.color).toBe(0x0e3050);
  });
});

describe("the /flex handler", () => {
  const fetchMock = vi.fn();

  function interaction(options: { name: string; value: unknown }[]): DiscordInteraction {
    return {
      id: "1",
      application_id: "app",
      type: 2,
      token: "tok",
      data: { name: "flex", options },
      member: { user: { id: "u1", username: "doug", global_name: "Doug" }, roles: [] },
    } as DiscordInteraction;
  }

  /** Runs the handler, then the deferred work it queued, and returns what
   *  it posted to the interaction webhook. */
  async function run(options: { name: string; value: unknown }[]): Promise<Record<string, unknown>> {
    const ack = await commandHandlers.flex(interaction(options));
    expect(ack).toEqual({ type: 5 });
    const work = afterMock.mock.calls[0][0] as () => Promise<void>;
    await work();
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://discord.com/api/v10/webhooks/app/tok");
    return JSON.parse(init.body) as Record<string, unknown>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SITE_URL = "https://fpl.example";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
    fetchCardSeasonMock.mockResolvedValue("2026");
    fetchCardEditionWeeksMock.mockResolvedValue(["2026-08-24", "2026-08-17"]);
    fetchPrintRunsMock.mockResolvedValue(new Map([[printRunKey("2026-08-24", "doug-na1"), 43]]));
    fetchInventoryMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SITE_URL;
  });

  it("registers itself into the shared registry", () => {
    expect(commandHandlers.flex).toBeTypeOf("function");
  });

  it("refuses a DM, where there is no member to flex at", async () => {
    const res = (await commandHandlers.flex({ id: "1", application_id: "app", type: 2, token: "tok" } as DiscordInteraction)) as {
      data: { flags: number };
    };
    expect(res.data.flags).toBe(64);
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("shows the best copy, with its print run", async () => {
    fetchInventoryMock.mockResolvedValue([
      copy({ id: 1, playerName: "Doug", overall: 70, printNumber: 4 }),
      copy({ id: 2, playerName: "Doug", foil: true, foilType: "ice", overall: 65, printNumber: 7 }),
      copy({ id: 3, playerName: "Spies" }),
    ]);

    const body = (await run([{ name: "player", value: "doug" }])) as {
      embeds: { title: string; description: string; image: { url: string } }[];
      flags?: number;
    };

    expect(body.flags).toBeUndefined(); // the flex itself is public
    expect(body.embeds[0].title).toBe("Doug flexes Doug");
    expect(body.embeds[0].description).toContain("Cracked Ice");
    expect(body.embeds[0].description).toContain("#7 of 43");
    expect(body.embeds[0].image.url).toContain("/copy/2/card.png");
    // One key, not the whole collection.
    expect(fetchPrintRunsMock).toHaveBeenCalledWith(expect.anything(), "2026", [
      { editionWeek: "2026-08-24", slug: "doug-na1" },
    ]);
  });

  it("tells you privately when you own none of them", async () => {
    fetchInventoryMock.mockResolvedValue([copy({ playerName: "Spies" })]);

    const body = await run([{ name: "player", value: "Doug" }]);

    expect(body.flags).toBe(64);
    expect(body.content).toBe("❌ You don't own a Doug card in Premier.");
  });

  it("names the league it looked in", async () => {
    const body = await run([
      { name: "player", value: "Doug" },
      { name: "league", value: "academy" },
    ]);

    expect(fetchCardSeasonMock).toHaveBeenCalledWith(expect.anything(), "academy");
    expect(body.content).toContain("in Academy");
  });

  it("asks you to be more specific rather than flexing the wrong card", async () => {
    fetchInventoryMock.mockResolvedValue([
      copy({ playerName: "Ashley" }),
      copy({ playerName: "Asher" }),
      copy({ playerName: "Ashwin" }),
    ]);

    const body = await run([{ name: "player", value: "ash" }]);

    expect(body.flags).toBe(64);
    expect(body.content).toContain("Ashley");
    expect(body.content).toContain("Asher");
    expect(body.content).toContain("Ashwin");
    expect(body.content).toContain("be more specific");
  });

  it("says so when there is no archive to pick a week out of", async () => {
    fetchCardEditionWeeksMock.mockResolvedValue([]);

    const body = await run([
      { name: "player", value: "Doug" },
      { name: "week", value: "1" },
    ]);

    expect(body.flags).toBe(64);
    expect(body.content).toContain("No editions are archived yet");
    // No point reading a collection to filter it by a week that isn't there.
    expect(fetchInventoryMock).not.toHaveBeenCalled();
  });

  it("narrows to the week you asked for", async () => {
    fetchInventoryMock.mockResolvedValue([
      copy({ id: 1, editionWeek: "2026-08-24", overall: 90 }),
      copy({ id: 2, editionWeek: "2026-08-17", overall: 60 }),
    ]);

    // "1" is the season's first archived week, as the shop picker counts.
    const body = (await run([
      { name: "player", value: "Doug" },
      { name: "week", value: "1" },
    ])) as { embeds: { image: { url: string } }[] };

    expect(body.embeds[0].image.url).toContain("/copy/2/card.png");
  });

  it("answers even when the read blows up", async () => {
    // The deferral already said "thinking…"; a silent stall sits there
    // forever.
    fetchInventoryMock.mockRejectedValue(new Error("boom"));

    const body = await run([{ name: "player", value: "Doug" }]);

    expect(body.flags).toBe(64);
    expect(body.content).toContain("Something went wrong");
  });
});
