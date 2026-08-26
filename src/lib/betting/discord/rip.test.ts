import { describe, expect, it, vi } from "vitest";

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
  ({ ok: true, cards, balance: 500, ...extra });

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
    expect(body.embeds[1].image?.url).toBe("https://fpl.example/card/doug/card.png");
    expect(body.embeds[2].image?.url).toBe("https://fpl.example/card/spies/card.png");
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
    expect(body.embeds[2].image?.url).toBe("https://fpl.example/card/doug/card.png");
    delete process.env.SITE_URL;
  });
});
