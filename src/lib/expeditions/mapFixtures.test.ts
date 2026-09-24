import { describe, expect, it } from "vitest";
import { EXPEDITION_TIERS } from "./config";
import { FIXTURE_ROADS, MAP_FIXTURE_KEYS, MAP_FULL_TIERS, MAP_STATES, MAP_TIERS, isMapState, isMapTier, mapFixture } from "./mapFixtures";
import { ROADS } from "./routes";

describe("the living map's fixtures", () => {
  it("walk real places: each stop is an entry of its slot on the road", () => {
    for (const tier of MAP_TIERS) {
      const road = FIXTURE_ROADS[tier];
      expect(road.length, tier).toBe(EXPEDITION_TIERS[tier].forks);
      road.forEach((place, index) => {
        const entry = ROADS[tier][index]?.find((candidate) => candidate.key === place.key);
        expect(entry, `${tier} ${index} ${place.key}`).toBeTruthy();
        expect(place.title).toBe(entry!.title);
        expect(place.warned).toBe(entry!.warned);
      });
    }
  });

  it("draw every moment on the Legend Hunt and the Mythic route, and a fresh run on every other route", () => {
    expect(MAP_FIXTURE_KEYS).toHaveLength(MAP_FULL_TIERS.length * MAP_STATES.length + MAP_TIERS.length - MAP_FULL_TIERS.length);
    for (const tier of MAP_TIERS) expect(MAP_FIXTURE_KEYS.some((key) => key.tier === tier && key.state === "fresh"), tier).toBe(true);
    expect(isMapState("fog")).toBe(true);
    expect(isMapState("sunny")).toBe(false);
    expect(isMapTier("mythic")).toBe(true);
    expect(isMapTier("lost")).toBe(false);
  });

  it("carry nothing about an unknown place but its mark and its danger", () => {
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      for (const place of mapFixture(state, tier).view.road) {
        if (place.known) continue;
        expect(Object.keys(place).sort()).toEqual(["at", "closesAt", "dark", "index", "known", "mark", "opensAt", "pushed", "status", "toll", "warned"]);
        expect(place.mark).toBe("?");
      }
    }
  });

  it("show the moments the spec names", () => {
    const fog = mapFixture("fog", "legend").view;
    expect(fog.weather).toBe("fog");
    expect(fog.road.filter((place) => !place.known)).toHaveLength(2);
    expect(fog.road.filter((place) => !place.known && place.warned)).toHaveLength(1);

    const fork = mapFixture("fork", "legend").view;
    expect(fork.openFork?.index).toBe(1);
    expect(fork.road[1].status).toBe("open");

    const mid = mapFixture("mid", "mythic");
    expect(mid.view.company.rivals).toHaveLength(1);
    expect(mid.view.journal.length).toBeGreaterThan(4);
    expect(mid.convoy).not.toBeNull();

    const storm = mapFixture("storm", "legend").view;
    expect(storm.weather).toBe("watch");
    expect(storm.storms).toHaveLength(1);

    const finished = mapFixture("finished", "mythic");
    expect(finished.progress).toBe(1);
    expect(finished.view.road.every((place) => place.known)).toBe(true);
    expect(finished.view.road.some((place) => place.known && place.landmark)).toBe(true);
    expect(finished.view.journal.at(-1)?.kind).toBe("home");
  });

  it("keep every line on the clock, in order, and serialisable", () => {
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      const fixture = mapFixture(state, tier);
      const fractions = fixture.view.journal.map((line) => line.fraction);
      expect(fractions.every((f) => f >= 0 && f <= 1), `${state} ${tier}`).toBe(true);
      expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
      // Nothing written after the clock, unless the run is home.
      if (fixture.progress < 1) expect(fractions.every((f) => f <= fixture.progress), `${state} ${tier}`).toBe(true);
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
    }
  });
});
