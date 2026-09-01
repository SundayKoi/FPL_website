import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../service-client", () => ({ createBettingServiceClient: vi.fn() }));
vi.mock("@/lib/packs/open", () => ({ openPackFor: vi.fn() }));

const { ripFollowup, resolveRipWeek } = await import("./rip");
import type { OpenPackResult } from "@/lib/packs/open";

function pull(name: string, overall: number, extra: Partial<{ foil: boolean; foilType: string | null; signed: boolean; moment: boolean }> = {}) {
  return {
    card: {
      slug: name.toLowerCase(),
      name,
      overall,
      tier: { key: "gold", label: "Gold" },
      moment: extra.moment ? { id: 1 } : undefined,
    },
    foil: extra.foil ?? false,
    foilType: extra.foilType ?? null,
    signed: extra.signed ?? false,
    inventoryId: 1,
  } as unknown as Extract<OpenPackResult, { ok: true }>["cards"][number];
}

const ok = (cards: ReturnType<typeof pull>[], extra: Partial<Extract<OpenPackResult, { ok: true }>> = {}): OpenPackResult =>
  ({ ok: true, cards, balance: 500, editionWeek: "2026-08-24", ...extra });

describe("ripFollowup", () => {
  it("turns a failed rip into a plain error message", () => {
    expect(ripFollowup({ ok: false, error: "You've already ripped today — come back tomorrow." }, "Doug")).toEqual({
      content: "❌ You've already ripped today — come back tomorrow.",
    });
  });

  it("gives every pull its own embed under a named header", () => {
    const body = ripFollowup(ok([pull("Doug", 82), pull("Spies", 61)]), "Doug") as { embeds: Record<string, unknown>[] };
    expect(body.embeds[0].title).toBe("Doug's Daily Rip");
    expect(body.embeds).toHaveLength(3);
    expect(body.embeds[1].description).toContain("**Doug** 82 OVR");
    expect(body.embeds[2].description).toContain("**Spies** 61 OVR");
  });

  it("shouts the pulls worth shouting about", () => {
    const body = ripFollowup(
      ok([pull("Doug", 82, { foil: true, foilType: "ice" }), pull("Spies", 61, { signed: true })]),
      "Doug",
    ) as { embeds: Record<string, unknown>[] };
    expect(body.embeds[1].description).toContain("Cracked Ice");
    expect(body.embeds[2].description).toContain("SIGNED");
  });

  it("shows each card's picture with its tier's color", () => {
    process.env.SITE_URL = "https://fpl.example";
    const body = ripFollowup(ok([pull("Doug", 82), pull("Spies", 61)]), "Doug") as {
      embeds: { image?: { url: string }; color: number }[];
    };
    // The week rides the url so the picture is the print that was pulled,
    // and so Discord cannot serve last week's render for it.
    expect(body.embeds[1].image?.url).toBe("https://fpl.example/card/doug/card.png?w=2026-08-24");
    expect(body.embeds[2].image?.url).toBe("https://fpl.example/card/spies/card.png?w=2026-08-24");
    // Both test pulls are gold; the stripes should say so.
    expect(body.embeds[1].color).toBe(0xe8c14b);
    delete process.env.SITE_URL;
  });

  it("mentions the streak only once it is a streak", () => {
    const single = ripFollowup(ok([pull("Doug", 82)], { streak: 1 }), "Doug") as { embeds: { footer: { text: string } }[] };
    const run = ripFollowup(ok([pull("Doug", 82)], { streak: 5 }), "Doug") as { embeds: { footer: { text: string } }[] };
    expect(single.embeds[0].footer.text).not.toContain("streak");
    expect(run.embeds[0].footer.text).toContain("5-day streak");
  });

  it("announces the streak bonus when one paid", () => {
    const body = ripFollowup(ok([pull("Doug", 82)], { streak: 7, streakBonus: 100 }), "Doug") as {
      embeds: { description: string }[];
    };
    expect(body.embeds[0].description).toContain("Streak bonus");
  });

  it("resolves week numbers, dates, and misses against the archive", () => {
    const weeks = ["2026-08-24", "2026-08-17"]; // newest first, as fetchCardEditionWeeks returns
    // Numbers count up from the season's first archive, like the shop picker.
    expect(resolveRipWeek("1", weeks)).toEqual({ week: "2026-08-17" });
    expect(resolveRipWeek("2", weeks)).toEqual({ week: "2026-08-24" });
    expect(resolveRipWeek("2026-08-17", weeks)).toEqual({ week: "2026-08-17" });
    // A miss answers with the menu, not a shrug.
    const miss = resolveRipWeek("9", weeks) as { error: string };
    expect(miss.error).toContain("1 (WK Aug 17)");
    expect(miss.error).toContain("2 (WK Aug 24)");
    expect(resolveRipWeek("1", [])).toHaveProperty("error");
  });

  it("never gives a moment an image — moments have no card page", () => {
    process.env.SITE_URL = "https://fpl.example";
    const body = ripFollowup(ok([pull("TheSteal", 99, { moment: true }), pull("Doug", 82)]), "Doug") as {
      embeds: { image?: { url: string }; description?: string }[];
    };
    expect(body.embeds[1].image).toBeUndefined();
    expect(body.embeds[1].description).toContain("MOMENT");
    expect(body.embeds[2].image?.url).toBe("https://fpl.example/card/doug/card.png?w=2026-08-24");
    delete process.env.SITE_URL;
  });
});


describe("the picture is the print that was pulled", () => {
  // pullEmbed only draws a picture when it knows where the site lives.
  beforeEach(() => { process.env.SITE_URL = "https://fpl.example"; });
  afterEach(() => { delete process.env.SITE_URL; });

  // Two bugs, one URL. The image is the card as it stood TODAY rather than
  // in the week the pack minted from — and because Discord's proxy caches by
  // URL, /card/doug-na1/card.png being the same string every week meant the
  // first render Discord ever saw was the one it kept serving. Last week's
  // picture under this week's text, reported exactly that way.
  it("stamps the edition week on every card picture", () => {
    const followup = ripFollowup(ok([pull("Doug", 90)], { editionWeek: "2026-08-24" }), "Doug");
    const embeds = (followup as { embeds: { image?: { url: string } }[] }).embeds;
    const picture = embeds.find((embed) => embed.image)?.image?.url;
    expect(picture).toContain("/card/doug/card.png?w=2026-08-24");
  });

  it("still keys the url when the pack fell back to the live cards", () => {
    // No archived week to ask for, but a bare url is the bug — it would be
    // cached forever. Falls back to the weekly `v` token instead.
    const followup = ripFollowup(ok([pull("Doug", 90)], { editionWeek: null }), "Doug");
    const embeds = (followup as { embeds: { image?: { url: string } }[] }).embeds;
    const picture = embeds.find((embed) => embed.image)?.image?.url;
    expect(picture).toContain("/card/doug/card.png?v=");
    expect(picture).not.toContain("?w=");
  });

  it("gives two different weeks two different urls, which is what breaks the cache", () => {
    const urlFor = (week: string) => {
      const followup = ripFollowup(ok([pull("Doug", 90)], { editionWeek: week }), "Doug");
      const embeds = (followup as { embeds: { image?: { url: string } }[] }).embeds;
      return embeds.find((embed) => embed.image)?.image?.url;
    };
    expect(urlFor("2026-08-24")).not.toBe(urlFor("2026-08-31"));
  });
});
