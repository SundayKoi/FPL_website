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

const { bestCopy, copyChoices, copyLabel, flexEmbed, matchPlayer, pickCopy, playerChoices, rankCopies } =
  await import("./flex");
import { autocompleteHandlers, commandHandlers, type DiscordInteraction } from "./registry";
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

describe("the picker's pure parts", () => {
  it("names a copy by what tells it apart from the others", () => {
    const row = copy({
      editionWeek: "2026-08-24",
      foil: true,
      foilType: "ice",
      signed: true,
      printNumber: 7,
      artSkin: 2,
      overall: 87,
      mark: "sigil",
    });
    expect(copyLabel(row)).toBe("WK Aug 24 · Cracked Ice · Signed · #7 · Alt art · Gold 87 · Sigil mark");
    expect(copyLabel(copy({ overall: 80 }))).toBe("WK Aug 24 · Matte · Gold 80");
  });

  it("lists copies best first, the same ladder bestCopy climbs", () => {
    const matte = copy({ id: 1 });
    const eclipse = copy({ id: 2, foil: true, foilType: "eclipse" });
    const signed = copy({ id: 3, signed: true });
    expect(rankCopies([matte, signed, eclipse]).map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it("offers one entry per owned player, best copy first, slug as the value", () => {
    const rows = [
      copy({ slug: "spies-na1", playerName: "Spies", overall: 99 }),
      copy({ slug: "doug-na1", playerName: "Doug", overall: 60 }),
      copy({ slug: "doug-na1", playerName: "Doug", foil: true, foilType: "eclipse", overall: 61 }),
    ];
    const choices = playerChoices(rows, "");
    expect(choices.map((choice) => choice.value)).toEqual(["doug-na1", "spies-na1"]);
    expect(choices[0].name).toBe("Doug — WK Aug 24 · Eclipse · Gold 61");
  });

  it("narrows the player list to what has been typed, any case, any part", () => {
    const rows = [copy({ slug: "doug-na1", playerName: "Doug" }), copy({ slug: "spies-na1", playerName: "Spies" })];
    expect(playerChoices(rows, "OU").map((choice) => choice.value)).toEqual(["doug-na1"]);
    expect(playerChoices(rows, "zzz")).toEqual([]);
  });

  it("offers every copy, best first, id as the value, and narrows on the label", () => {
    const rows = [
      copy({ id: 10, printNumber: 3 }),
      copy({ id: 11, foil: true, foilType: "ice", printNumber: 8 }),
      copy({ id: 12, signed: true, printNumber: 1 }),
    ];
    expect(copyChoices(rows, "").map((choice) => choice.value)).toEqual(["12", "11", "10"]);
    expect(copyChoices(rows, "").map((choice) => choice.name)[1]).toBe("Doug · WK Aug 24 · Cracked Ice · #8 · Gold 80");
    expect(copyChoices(rows, "ice").map((choice) => choice.value)).toEqual(["11"]);
    expect(copyChoices(rows, "#1").map((choice) => choice.value)).toEqual(["12"]);
  });

  it("never sends Discord more choices than it will show", () => {
    const rows = Array.from({ length: 40 }, (_, i) => copy({ id: 100 + i, slug: `p${i}`, playerName: `Player ${i}` }));
    expect(playerChoices(rows, "")).toHaveLength(25);
    expect(copyChoices(rows, "")).toHaveLength(25);
  });

  it("takes a picked id as is, and a typed label only when it fits exactly one copy", () => {
    const rows = [copy({ id: 10 }), copy({ id: 11, foil: true, foilType: "ice" }), copy({ id: 12, foil: true, foilType: "aurora" })];
    expect(pickCopy(rows, "11")).toBe(rows[1]);
    expect(pickCopy(rows, "99")).toBeNull();
    expect(pickCopy(rows, "cracked")).toBe(rows[1]);
    expect(pickCopy(rows, "wk aug 24")).toBe("ambiguous");
    expect(pickCopy(rows, "eclipse")).toBeNull();
  });

  it("lets a slug picked from the list match without a second guess", () => {
    const rows = [copy({ slug: "ash-na1", playerName: "Ash" }), copy({ slug: "ashley-na1", playerName: "Ashley" })];
    const match = matchPlayer(rows, "ashley-na1");
    expect("rows" in match && match.rows.map((row) => row.playerName)).toEqual(["Ashley"]);
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

  it("flexes the copy you picked instead of the best one", async () => {
    fetchInventoryMock.mockResolvedValue([
      copy({ id: 1, playerName: "Doug", overall: 70 }),
      copy({ id: 2, playerName: "Doug", foil: true, foilType: "ice", overall: 65 }),
    ]);

    const body = (await run([
      { name: "player", value: "doug-na1" },
      { name: "copy", value: "1" },
    ])) as { embeds: { description: string; image: { url: string } }[] };

    expect(body.embeds[0].description).toContain("Matte");
    expect(body.embeds[0].image.url).toContain("/copy/1/card.png");
  });

  it("refuses a copy pick that is no longer one of yours, rather than showing another", async () => {
    fetchInventoryMock.mockResolvedValue([copy({ id: 1, playerName: "Doug" }), copy({ id: 3, playerName: "Spies" })]);

    // 3 exists, but it is a Spies — a stale or forged id must not cross
    // players.
    const body = (await run([
      { name: "player", value: "doug" },
      { name: "copy", value: "3" },
    ])) as { content: string; flags: number };

    expect(body.flags).toBe(64);
    expect(body.content).toContain("pick again from the list");
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


describe("the /flex picker", () => {
  function typing(
    focused: { name: string; value: string },
    others: { name: string; value: unknown }[] = [],
  ): DiscordInteraction {
    return {
      id: "1",
      application_id: "app",
      type: 4,
      token: "tok",
      data: { name: "flex", options: [{ ...focused, focused: true }, ...others] },
      member: { user: { id: "u1", username: "doug", global_name: "Doug" }, roles: [] },
    } as DiscordInteraction;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fetchCardSeasonMock.mockResolvedValue("2026");
    fetchCardEditionWeeksMock.mockResolvedValue(["2026-08-24", "2026-08-17"]);
    fetchInventoryMock.mockResolvedValue([
      copy({ id: 1, slug: "doug-na1", playerName: "Doug", editionWeek: "2026-08-17" }),
      copy({ id: 2, slug: "doug-na1", playerName: "Doug", foil: true, foilType: "ice" }),
      copy({ id: 3, slug: "spies-na1", playerName: "Spies", signed: true }),
    ]);
  });

  it("registers itself beside the command", () => {
    expect(autocompleteHandlers.flex).toBeTypeOf("function");
  });

  it("offers the players you own while you type the name", async () => {
    const res = (await autocompleteHandlers.flex(typing({ name: "player", value: "d" }))) as {
      type: number;
      data: { choices: { name: string; value: string }[] };
    };
    expect(res.type).toBe(8);
    expect(res.data.choices.map((choice) => choice.value)).toEqual(["doug-na1"]);
    // The picker is the caller's own shelf, nobody else's.
    expect(fetchInventoryMock).toHaveBeenCalledWith(expect.anything(), "u1", "2026");
  });

  it("offers only the chosen player's copies, best first, narrowed by week", async () => {
    const all = (await autocompleteHandlers.flex(
      typing({ name: "copy", value: "" }, [{ name: "player", value: "doug-na1" }]),
    )) as { data: { choices: { value: string }[] } };
    expect(all.data.choices.map((choice) => choice.value)).toEqual(["2", "1"]);

    const week = (await autocompleteHandlers.flex(
      typing({ name: "copy", value: "" }, [
        { name: "player", value: "doug-na1" },
        { name: "week", value: "2026-08-17" },
      ]),
    )) as { data: { choices: { value: string }[] } };
    expect(week.data.choices.map((choice) => choice.value)).toEqual(["1"]);
  });

  it("offers everything you own when no player has been chosen yet", async () => {
    const res = (await autocompleteHandlers.flex(typing({ name: "copy", value: "signed" }))) as {
      data: { choices: { value: string }[] };
    };
    expect(res.data.choices.map((choice) => choice.value)).toEqual(["3"]);
  });

  it("answers with no choices — never a message — from a DM or a broken read", async () => {
    const dm = (await autocompleteHandlers.flex({
      id: "1",
      application_id: "app",
      type: 4,
      token: "tok",
      data: { name: "flex", options: [{ name: "player", value: "", focused: true }] },
    } as DiscordInteraction)) as { type: number; data: { choices: unknown[] } };
    expect(dm).toEqual({ type: 8, data: { choices: [] } });

    fetchInventoryMock.mockRejectedValue(new Error("down"));
    const broken = await autocompleteHandlers.flex(typing({ name: "player", value: "d" }));
    expect(broken).toEqual({ type: 8, data: { choices: [] } });
  });
});
