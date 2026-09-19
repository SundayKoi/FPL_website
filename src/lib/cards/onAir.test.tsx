import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { canDust, dustValueOf } from "@/lib/packs/config";
import {
  ON_AIR_ACCENT,
  ON_AIR_CHANCE,
  ON_AIR_COPIES,
  ON_AIR_LOOK,
  ON_AIR_SPECIMEN,
  ON_AIR_TIER,
  onAirCard,
  onAirLabel,
  onAirLook,
  onAirSlug,
  pickOnAirCaster,
  rollOnAir,
  type OnAirCaster,
} from "./onAir";

afterEach(cleanup);

const caster = (over: Partial<OnAirCaster> = {}): OnAirCaster => ({
  profileId: "caster-a",
  name: "Static",
  champion: "Bard",
  skin: 3,
  roleLabel: "Play-by-play",
  tagline: "Chimes on the three.",
  ...over,
});

describe("the On Air card", () => {
  it("is one pack in fifteen while the stream is live, twenty-five a caster a season, under its own tier", () => {
    expect(ON_AIR_CHANCE).toBe(1 / 15);
    expect(ON_AIR_COPIES).toBe(25);
    expect(ON_AIR_TIER).toBe("onair");
  });

  it("rolls off one rand, and only lands under the gate", () => {
    expect(rollOnAir(() => ON_AIR_CHANCE / 2)).toBe(true);
    expect(rollOnAir(() => ON_AIR_CHANCE)).toBe(false);
    expect(rollOnAir(() => 0.5)).toBe(false);
  });

  it("slugs a caster under its own prefix, never a player's", () => {
    expect(onAirSlug({ name: "Static" })).toBe("on-air-static");
    expect(onAirSlug({ name: "The Mix Down" })).toBe("on-air-the-mix-down");
  });

  it("reads a copy's number as '3 of 25'", () => {
    expect(onAirLabel({ number: 3, of: ON_AIR_COPIES })).toBe("3 of 25");
  });

  it("freezes the caster, all 100s, numbered, in the pack's season and window", () => {
    const card = onAirCard(caster(), 3, "S5", "Match night rip");
    expect(card.slug).toBe("on-air-static");
    expect(card.name).toBe("Static");
    expect(card.tag).toBe("ON AIR");
    expect(card.teamName).toBeNull();
    expect(card.role).toBe("Play-by-play");
    expect(card.overall).toBe(100);
    expect(card.tier).toEqual({ key: "challenger", label: "Challenger" });
    expect(card.archetype).toBe("On Air");
    expect(card.signature).toEqual({ champion: "Bard", games: 100 });
    expect(card.artSkin).toBe(3);
    expect(card.motto).toBe("Chimes on the three.");
    expect(card.serial).toBe(3);
    expect(card.collectionSize).toBe(ON_AIR_COPIES);
    expect(card.subStats.map((stat) => stat.key)).toEqual(["mic", "hype", "reads", "calls", "signal"]);
    expect(card.subStats.map((stat) => stat.label)).toEqual(["Mic", "Hype", "Reads", "Calls", "Signal"]);
    expect(card.subStats.every((stat) => stat.value === 100)).toBe(true);
    expect(card.highlights).toEqual([{ label: "On the desk", value: "Match night rip", detail: "Printed while the stream was live" }]);
    expect(card.badges).toEqual([{ key: "onair", label: "On Air", detail: "Only prints while a Live Drops window is open" }]);
    expect(card.standout).toBe(false);
    expect(card).toMatchObject({ wins: 100, losses: 0, winratePct: 100, level: 100, pentas: 100, season: "S5" });
    expect(card.topChampions).toEqual([{ champion: "Bard", games: 100, wins: 100 }]);
    expect(card.form).toEqual([true, true, true, true, true]);
    // The slot is REPLACED after the roller stamps the rest of the pack, so
    // the LIVE mark has to be set here or this copy would be the one card
    // opened in the window that does not say so.
    expect(card.live).toEqual({ label: "Match night rip" });
    expect(card.onAir).toEqual({ profileId: "caster-a", name: "Static", number: 3, of: 25, window: "Match night rip" });
  });

  it("prints no signal — and the house line — for a caster who set no champion", () => {
    const card = onAirCard(caster({ champion: null, tagline: null }), 1, "S5", "Week 3 broadcast");
    expect(card.signature).toBeNull();
    expect(card.topChampions).toEqual([]);
    expect(card.motto).toBe("We'll be right back after these messages.");
  });

  it("prints the caster with the fewest copies this season", () => {
    const a = caster({ profileId: "a", name: "A" });
    const b = caster({ profileId: "b", name: "B" });
    expect(pickOnAirCaster([a, b], { a: 4, b: 2 }, () => 0)?.profileId).toBe("b");
    expect(pickOnAirCaster([a, b], { a: 1, b: 9 }, () => 0)?.profileId).toBe("a");
    // A caster with no row in the tally has printed nothing at all.
    expect(pickOnAirCaster([a, b], { a: 3 }, () => 0)?.profileId).toBe("b");
  });

  it("breaks a tie with rand, and spends nothing when there is nothing to break", () => {
    const a = caster({ profileId: "a", name: "A" });
    const b = caster({ profileId: "b", name: "B" });
    expect(pickOnAirCaster([a, b], { a: 2, b: 2 }, () => 0.1)?.profileId).toBe("a");
    expect(pickOnAirCaster([a, b], { a: 2, b: 2 }, () => 0.9)?.profileId).toBe("b");
    // rand() of exactly 1 must not index past the end.
    expect(pickOnAirCaster([a, b], { a: 2, b: 2 }, () => 1)?.profileId).toBe("b");
    const rand = vi.fn(() => 0.5);
    expect(pickOnAirCaster([a, b], { a: 1, b: 7 }, rand)?.profileId).toBe("a");
    expect(rand).not.toHaveBeenCalled();
  });

  it("skips a caster at the cap, and prints nobody when every caster is", () => {
    const a = caster({ profileId: "a", name: "A" });
    const b = caster({ profileId: "b", name: "B" });
    expect(pickOnAirCaster([a, b], { a: ON_AIR_COPIES, b: 20 }, () => 0)?.profileId).toBe("b");
    expect(pickOnAirCaster([a, b], { a: ON_AIR_COPIES, b: ON_AIR_COPIES }, () => 0)).toBeNull();
    expect(pickOnAirCaster([], {}, () => 0)).toBeNull();
  });

  it("never dusts, from the flag or from the tier", () => {
    expect(canDust({ foilType: null, onAir: true })).toBe(false);
    expect(canDust({ foilType: null, tier: ON_AIR_TIER })).toBe(false);
    expect(canDust({ foilType: null, tier: "challenger" })).toBe(true);
    expect(dustValueOf({ tier: ON_AIR_TIER, foil: false, signed: false })).toBe(0);
    expect(dustValueOf({ tier: "challenger", foil: false, signed: false, onAir: true })).toBe(0);
  });
});

describe("the On Air look", () => {
  /** Every @utility the look names has to exist, or the card ships a class
   *  Tailwind never emitted and the layer simply does not draw. */
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const declared = (cls: string) =>
    css.includes(`@utility ${cls} `) || css.includes(`@utility ${cls}\n`) || css.includes(`@utility ${cls}{`);

  it("declares every layer it names in globals.css", () => {
    const layers = [...ON_AIR_LOOK.front, "card-ov-onair-nosignal"];
    for (const cls of layers) expect(declared(cls), cls).toBe(true);
  });

  it("is the bars, the lamp, the waveform and the REC dot, in the accent", () => {
    expect(ON_AIR_LOOK.front).toEqual([
      "card-ov-onair-bars",
      "card-ov-onair-lamp",
      "card-ov-onair-wave",
      "card-ov-onair-rec",
    ]);
    expect(ON_AIR_LOOK.accent).toBe(ON_AIR_ACCENT);
    expect(ON_AIR_LOOK.chip).toBe("ON AIR");
  });

  it("stamps each copy with its caster and its own number", () => {
    const mark = { profileId: "a", name: "Static", number: 3, of: ON_AIR_COPIES, window: "Match night rip" };
    expect(onAirLook(mark, true)).toMatchObject({
      front: ON_AIR_LOOK.front,
      chip: "ON AIR · STATIC · 3 OF 25",
      accent: ON_AIR_ACCENT,
    });
  });

  it("puts the test pattern under the rest only when there is no art", () => {
    const mark = { profileId: "a", name: "Static", number: 3, of: ON_AIR_COPIES, window: "Match night rip" };
    expect(onAirLook(mark, false).front[0]).toBe("card-ov-onair-nosignal");
    expect(onAirLook(mark, false).front).toHaveLength(ON_AIR_LOOK.front.length + 1);
    expect(onAirLook(mark, true).front).not.toContain("card-ov-onair-nosignal");
  });

  it("wears the broadcast layers, the chip and its own stamp", () => {
    render(<PlayerCard3D card={onAirCard(ON_AIR_SPECIMEN, 3, "S5", "Match night rip")} />);
    const overlay = screen.getByTestId("overlay");
    for (const cls of ON_AIR_LOOK.front) expect(overlay.querySelector(`.${cls}`), cls).not.toBeNull();
    expect(overlay.querySelector(".card-ov-onair-nosignal")).toBeNull();
    expect(screen.getByText("ON AIR · DRIBB · 3 OF 25")).toBeTruthy();
    expect(screen.getByTestId("onair-stamp")).toBeTruthy();
    expect(screen.getByTestId("onair-stamp").getAttribute("title")).toContain("On Air — Dribb, printed live during Match night rip. 3 of 25 this season.");
    expect(screen.getByRole("button").getAttribute("aria-label")).toContain("the On Air card 3 of 25");
  });

  it("draws the test pattern for a caster with no champion", () => {
    const card = onAirCard({ ...ON_AIR_SPECIMEN, champion: null }, 12, "S5", "Week 3 broadcast");
    render(<PlayerCard3D card={card} />);
    expect(screen.getByTestId("overlay").querySelector(".card-ov-onair-nosignal")).not.toBeNull();
  });

  it("leaves an ordinary card alone", () => {
    const card = { ...onAirCard(ON_AIR_SPECIMEN, 1, "S5", "Match night rip"), onAir: null, live: null };
    render(<PlayerCard3D card={card} />);
    expect(screen.queryByTestId("overlay")).toBeNull();
    expect(screen.queryByTestId("onair-stamp")).toBeNull();
  });
});
