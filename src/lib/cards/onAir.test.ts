import { describe, expect, it, vi } from "vitest";
import { canDust, dustValueOf, ON_AIR_TIER } from "@/lib/packs/config";
import {
  ON_AIR_CHANCE,
  ON_AIR_COPIES,
  onAirCard,
  onAirSlug,
  pickOnAirCaster,
  rollOnAir,
  type OnAirCaster,
} from "./onAir";

const caster = (over: Partial<OnAirCaster> = {}): OnAirCaster => ({
  profileId: "caster-a",
  name: "Static",
  champion: "Bard",
  skin: 3,
  roleLabel: "Play-by-play",
  tagline: "Chimes on the three.",
  ...over,
});

describe("On Air issuance rules", () => {
  it("keeps the live-window chance and per-caster seasonal cap", () => {
    expect(ON_AIR_CHANCE).toBe(1 / 15);
    expect(ON_AIR_COPIES).toBe(25);
  });

  it("rolls below the chance boundary and rejects the boundary itself", () => {
    expect(rollOnAir(() => ON_AIR_CHANCE / 2)).toBe(true);
    expect(rollOnAir(() => ON_AIR_CHANCE)).toBe(false);
    expect(rollOnAir(() => 0.5)).toBe(false);
  });

  it("keeps caster slugs under a namespace separate from player slugs", () => {
    expect(onAirSlug({ name: "Static" })).toBe("on-air-static");
    expect(onAirSlug({ name: "The Mix Down" })).toBe("on-air-the-mix-down");
  });

  it("freezes caster identity, serial, season, and live window into a print", () => {
    const card = onAirCard(caster(), 3, "S5", "Match night rip");

    expect(card).toMatchObject({
      slug: "on-air-static",
      name: "Static",
      role: "Play-by-play",
      season: "S5",
      serial: 3,
      collectionSize: ON_AIR_COPIES,
      onAir: { profileId: "caster-a", name: "Static", number: 3, of: 25, window: "Match night rip" },
      live: { label: "Match night rip" },
    });
  });

  it("handles a no-signal caster without creating champion data", () => {
    const card = onAirCard(caster({ champion: null, tagline: null }), 1, "S5", "Week 3 broadcast");

    expect(card.signature).toBeNull();
    expect(card.topChampions).toEqual([]);
  });

  it("chooses the least-issued eligible caster and draws only when tied", () => {
    const a = caster({ profileId: "a", name: "A" });
    const b = caster({ profileId: "b", name: "B" });
    const rand = vi.fn(() => 0.5);

    expect(pickOnAirCaster([a, b], { a: 4, b: 2 }, rand)?.profileId).toBe("b");
    expect(rand).not.toHaveBeenCalled();
    expect(pickOnAirCaster([a, b], { a: 2, b: 2 }, () => 0)?.profileId).toBe("a");
    expect(pickOnAirCaster([a, b], { a: 2, b: 2 }, () => 1)?.profileId).toBe("b");
  });

  it("skips capped casters and returns no candidate when the cap is exhausted", () => {
    const a = caster({ profileId: "a", name: "A" });
    const b = caster({ profileId: "b", name: "B" });

    expect(pickOnAirCaster([a, b], { a: ON_AIR_COPIES, b: 20 }, () => 0)?.profileId).toBe("b");
    expect(pickOnAirCaster([a, b], { a: ON_AIR_COPIES, b: ON_AIR_COPIES }, () => 0)).toBeNull();
    expect(pickOnAirCaster([], {}, () => 0)).toBeNull();
  });

  it("cannot dust an On Air copy, even if its payload flag is missing", () => {
    expect(canDust({ foilType: null, tier: ON_AIR_TIER })).toBe(false);
    expect(canDust({ foilType: null, onAir: true })).toBe(false);
    expect(dustValueOf({ tier: ON_AIR_TIER, foil: false, signed: false })).toBe(0);
    expect(dustValueOf({ tier: "challenger", foil: false, signed: false, onAir: true })).toBe(0);
  });
});
