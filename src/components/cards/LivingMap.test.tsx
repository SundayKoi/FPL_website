import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ROADS, MAP_FIXTURE_KEYS, mapFixture } from "@/lib/expeditions/mapFixtures";
import LivingMap from "./LivingMap";
import { FRAMES, SIZES, layoutMap, overlap, pinBox, squadFraction, type MapLayout } from "./mapLayout";
import { geometryFor } from "./mapTerrain";

const LAYOUTS: MapLayout[] = ["wide", "phone"];

function draw(state: Parameters<typeof mapFixture>[0], tier: Parameters<typeof mapFixture>[1], layout: MapLayout = "wide", extra: { reducedMotion?: boolean } = {}) {
  const fixture = mapFixture(state, tier);
  const result = render(<LivingMap view={fixture.view} progress={fixture.progress} convoy={fixture.convoy} goal={fixture.goal} layout={layout} {...extra} />);
  return { ...result, fixture, map: within(result.container).getByTestId("living-map") };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LivingMap: what the squad knows", () => {
  it("draws a known place as its glyph and an unknown one as a question mark", () => {
    const { map } = draw("fog", "legend");
    const chapel = within(map).getByTestId("map-place-0");
    expect(chapel.getAttribute("data-known")).toBe("true");
    expect(chapel.getAttribute("data-glyph-name")).toBe("chapel");
    for (const index of [1, 2]) {
      const place = within(map).getByTestId(`map-place-${index}`);
      expect(place.getAttribute("data-known")).toBe("false");
      expect(place.getAttribute("data-glyph-name")).toBe("unknown");
      // A dashed ring: an unknown place is never drawn as a known one.
      expect(place.querySelector("circle[stroke-dasharray]")).not.toBeNull();
    }
    expect(within(map).getByTestId("map-label-0").textContent).toContain("The drowned chapel");
  });

  it("marks the dread on a place the squad fears, known or not, and on no other", () => {
    const { map } = draw("fog", "legend");
    expect(within(map).getByTestId("map-place-2").getAttribute("data-warned")).toBe("true");
    expect(within(map).getByTestId("map-dread-2")).toBeTruthy();
    expect(within(map).queryByTestId("map-dread-1")).toBeNull();
    expect(within(map).queryByTestId("map-dread-0")).toBeNull();
    expect(within(map).getByTestId("map-label-2").textContent).toContain("A bad feeling");

    // On a phone the unknown place's name is not printed, but its dread is
    // still drawn.
    const phone = draw("fog", "legend", "phone");
    expect(within(phone.map).getByTestId("map-dread-2")).toBeTruthy();
  });

  it("prints no title for a place the squad does not know, on either frame or from the server", () => {
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      const fixture = mapFixture(state, tier);
      const hidden = fixture.view.road.filter((place) => !place.known).map((place) => FIXTURE_ROADS[tier][place.index].title);
      for (const layout of LAYOUTS) {
        const { container, unmount } = render(<LivingMap view={fixture.view} progress={fixture.progress} layout={layout} />);
        for (const title of hidden) expect(container.textContent?.toLowerCase(), `${state} ${tier} ${layout}`).not.toContain(title.toLowerCase());
        // No hover titles at all: a phone cannot hover, and a <title> is
        // exactly how the old map leaked the road.
        expect(container.querySelector("title")).toBeNull();
        unmount();
      }
      const html = renderToString(<LivingMap view={fixture.view} progress={null} />);
      for (const title of hidden) expect(html.toLowerCase()).not.toContain(title.toLowerCase());
    }
  });
});

describe("LivingMap: the journal on the road", () => {
  it("drops one pin per surfaced line, at the line's own fraction, in order along the road", () => {
    const { map, fixture } = draw("mid", "legend");
    const pins = within(map).getAllByTestId(/^map-pin-/);
    expect(pins).toHaveLength(fixture.view.journal.length);
    pins.forEach((pin, index) => {
      expect(Number(pin.getAttribute("data-fraction"))).toBeCloseTo(fixture.view.journal[index].fraction, 3);
    });
    // The Legend Hunt runs left to right: pins further along stand further right.
    const lefts = pins.map((pin) => parseFloat(pin.style.left));
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
    // Encounters gold, the trail steel, arrivals white.
    const tones = fixture.view.journal.map((line) => ({ encounter: "gold", trail: "steel", arrive: "white", home: "white" })[line.kind]);
    expect(pins.map((pin) => pin.getAttribute("data-tone"))).toEqual(tones);
    // Numbered on a wide chart.
    expect(pins[0].textContent).toBe("1");
  });

  it("stands an arrival's pin on its medallion, and never writes ahead of the squad", () => {
    const fixture = mapFixture("fork", "mythic");
    const g = geometryFor("mythic", "wide");
    const model = layoutMap(fixture.view, g.route, "wide", fixture.progress);
    const open = model.places.find((spot) => spot.open)!;
    const arrival = model.pins.find((pin) => pin.kind === "arrive" && pin.fraction === open.place.at)!;
    expect(arrival.x).toBeCloseTo(open.x, 5);
    expect(arrival.y).toBeCloseTo(open.y, 5);
    const squad = model.squad!;
    for (const pin of model.pins.filter((entry) => entry.onMark === null)) {
      const along = g.route.points.findIndex((p) => Math.hypot(p.x - pin.x, p.y - pin.y) < 1.5);
      const at = g.route.points.findIndex((p) => Math.hypot(p.x - squad.x, p.y - squad.y) < 1.5);
      expect(along).toBeLessThanOrEqual(at);
    }
  });

  it("prints the latest line under the chart, and a tapped pin's line in its place", () => {
    const { map, fixture } = draw("mid", "legend", "phone");
    const caption = within(map).getByTestId("map-caption");
    const last = fixture.view.journal.at(-1)!;
    expect(caption.textContent).toContain(last.text);

    // Tap the first pin: the box is measured, so give it the phone's size.
    const box = map.querySelector<HTMLElement>(".map-box")!;
    const width = 326;
    const height = (width * FRAMES.phone.height) / FRAMES.phone.width;
    box.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) });
    const model = layoutMap(fixture.view, geometryFor("legend", "phone").route, "phone", fixture.progress);
    const pin = model.pins[2];
    const sx = width / FRAMES.phone.width;
    const sy = height / FRAMES.phone.height;
    fireEvent.click(box, { clientX: pin.x * sx, clientY: (pin.y - pin.lift) * sy - SIZES.phone.pinPx * 0.95 });
    expect(caption.textContent).toContain(fixture.view.journal[2].text);
    expect(within(map).getByTestId("map-pin-2").getAttribute("data-active")).toBe("true");
    // Unnumbered on a phone.
    expect(within(map).getByTestId("map-pin-2").textContent).toBe("");

    // A tap on open ground reads nothing new.
    fireEvent.click(box, { clientX: 2, clientY: height - 2 });
    expect(caption.textContent).toContain(fixture.view.journal[2].text);
  });

  it("steps through the journal from the caption, for fingers and keyboards alike", () => {
    const { map, fixture } = draw("finished", "legend");
    const caption = within(map).getByTestId("map-caption");
    const earlier = within(caption).getByRole("button", { name: /Earlier journal line/ });
    const later = within(caption).getByRole("button", { name: /Later journal line/ });
    expect((later as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(earlier);
    expect(caption.textContent).toContain(fixture.view.journal.at(-2)!.text);
    fireEvent.click(later);
    expect(caption.textContent).toContain(fixture.view.journal.at(-1)!.text);
  });

  it("says the squad has just set out when nothing is written yet", () => {
    const fixture = mapFixture("fresh", "raid");
    render(<LivingMap view={{ ...fixture.view, journal: [] }} progress={0.01} layout="wide" />);
    expect(screen.getByTestId("map-caption").textContent).toContain("just set out");
    expect(screen.queryAllByTestId(/^map-pin-/)).toHaveLength(0);
  });
});

describe("LivingMap: names on the chart", () => {
  it("names only the open fork and the next known place on a phone", () => {
    const { map } = draw("fork", "legend", "phone");
    const labels = within(map).getAllByTestId(/^map-label-/);
    expect(labels.map((label) => label.getAttribute("data-testid"))).toEqual(["map-label-1"]);
    expect(labels[0].getAttribute("data-open")).toBe("true");
    expect(labels[0].textContent).toContain("The bell tower");
    expect(labels[0].textContent).toContain("Waiting on you");

    const mid = draw("mid", "legend", "phone");
    expect(within(mid.map).getAllByTestId(/^map-label-/).map((label) => label.getAttribute("data-testid"))).toEqual(["map-label-1"]);
  });

  it("names every checkpoint on a wide chart, the unknown ones as uncharted", () => {
    const { map } = draw("fresh", "legend");
    expect(within(map).getAllByTestId(/^map-label-/)).toHaveLength(3);
    expect(within(map).getByTestId("map-label-2").textContent).toContain("Uncharted");
  });

  it("never lets a pin stand on the open fork's name, and keeps every name on the chart", () => {
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      const fixture = mapFixture(state, tier);
      for (const layout of LAYOUTS) {
        const model = layoutMap(fixture.view, geometryFor(tier, layout).route, layout, fixture.progress, { goal: fixture.goal !== null });
        for (const spot of model.places.filter((entry) => entry.labelled)) {
          const box = spot.label.box!;
          expect(box.x0, `${state} ${tier} ${layout}`).toBeGreaterThanOrEqual(0);
          expect(box.y0).toBeGreaterThanOrEqual(0);
          expect(box.x1).toBeLessThanOrEqual(FRAMES[layout].width);
          expect(box.y1).toBeLessThanOrEqual(FRAMES[layout].height);
          if (!spot.open) continue;
          for (const pin of model.pins) expect(overlap(box, pinBox(pin, layout)), `${state} ${tier} ${layout} pin ${pin.line}`).toBe(0);
        }
      }
    }
  });
});

describe("LivingMap: weather, company and the squad", () => {
  it("wears the week's weather as a class, and fog as a drifting hatch over the whole chart", () => {
    const { map } = draw("fog", "legend");
    expect(map.className).toContain("map-weather-fog");
    expect(map.getAttribute("data-weather")).toBe("fog");
    const fog = map.querySelector("[data-fog]")!;
    expect(fog.getAttribute("data-fog")).toBe("weather");
    expect(fog.querySelector(".map-drift")).not.toBeNull();
  });

  it("hatches only the unknown places when the week is clear", () => {
    const { map } = draw("fresh", "legend");
    expect(map.className).toContain("map-weather-clear");
    expect(map.querySelector("[data-fog]")!.getAttribute("data-fog")).toBe("unknowns");
    expect(map.querySelector(".map-drift")).toBeNull();
  });

  it("draws a storm's cloud and rain, the Watch's eye, and the rivals it met", () => {
    const { map } = draw("storm", "legend");
    expect(map.className).toContain("map-weather-watch");
    expect(within(map).getByTestId("map-storm-0")).toBeTruthy();
    expect(map.querySelector(".map-rain")).not.toBeNull();
    expect(map.querySelector("[data-weather-layer='watch']")).not.toBeNull();
    expect(within(map).getByTestId("map-rival-0").getAttribute("data-won")).toBe("true");
    expect(within(map).getByTestId("map-rival-1").getAttribute("data-won")).toBe("false");
    expect(within(map).getByTestId("map-goal").getAttribute("data-kind")).toBe("boss");
  });

  it("blurs a ghost with the map's one filter, and rides a convoy partner on the squad's marker", () => {
    const fork = draw("fork", "legend");
    expect(within(fork.map).getByTestId("map-ghost-0")).toBeTruthy();
    expect(fork.map.querySelectorAll("feGaussianBlur")).toHaveLength(1);
    fork.unmount();
    const mid = draw("mid", "legend");
    expect(within(mid.map).getByTestId("map-convoy")).toBeTruthy();
  });

  it("walks the squad to the clock, holds it at an open fork, and draws no squad before the clock is up", () => {
    const { map, fixture } = draw("mid", "legend");
    expect(Number(within(map).getByTestId("map-squad").getAttribute("data-fraction"))).toBeCloseTo(fixture.progress, 3);
    expect(within(map).getByTestId("map-road-walked").getAttribute("stroke-dashoffset")).toBe(String(Math.round((1 - fixture.progress) * 1000) / 1000));

    const fork = mapFixture("fork", "legend");
    const open = fork.view.road.find((place) => place.status === "open")!;
    expect(squadFraction(fork.view, 0.9)).toBe(open.at);
    expect(squadFraction(fork.view, null)).toBeNull();

    const before = render(<LivingMap view={fork.view} progress={null} layout="wide" />);
    expect(within(before.container).queryByTestId("map-squad")).toBeNull();
    expect(within(before.container).queryByTestId("map-road-walked")).toBeNull();
  });
});

describe("LivingMap: motion and weight", () => {
  it("holds still when told to, or when the reader asks for less motion", () => {
    expect(draw("storm", "legend", "wide", { reducedMotion: true }).map.getAttribute("data-reduced-motion")).toBe("true");
    const still = vi.fn((query: string) => ({ matches: query.includes("reduced-motion"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("matchMedia", still);
    const { container } = render(<LivingMap view={mapFixture("fork", "legend").view} progress={0.5} layout="wide" />);
    expect(container.querySelector("[data-testid='living-map']")!.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("moves to the phone's frame on a narrow screen", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const fixture = mapFixture("mid", "mythic");
    const { container } = render(<LivingMap view={fixture.view} progress={fixture.progress} />);
    const map = container.querySelector("[data-testid='living-map']")!;
    expect(map.getAttribute("data-layout")).toBe("phone");
    expect(map.querySelector("svg")!.getAttribute("viewBox")).toBe(`0 0 ${FRAMES.phone.width} ${FRAMES.phone.height}`);
  });

  it("keeps even the busiest chart to one SVG of at most 250 nodes", () => {
    let busiest = { nodes: 0, key: "" };
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      for (const layout of LAYOUTS) {
        const { map, unmount } = draw(state, tier, layout);
        expect(map.querySelectorAll("svg")).toHaveLength(1);
        // Every element of the map — the chart and the words over it.
        const nodes = map.querySelectorAll("*").length;
        if (nodes > busiest.nodes) busiest = { nodes, key: `${state} ${tier} ${layout}` };
        expect(map.querySelectorAll("feGaussianBlur").length).toBeLessThanOrEqual(1);
        unmount();
      }
    }
    expect(busiest.nodes, busiest.key).toBeLessThanOrEqual(250);
    expect(busiest.key).toContain("mythic");
  });
});
