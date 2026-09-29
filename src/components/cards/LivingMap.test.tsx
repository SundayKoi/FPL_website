import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_ROADS, MAP_FIXTURE_KEYS, mapFixture } from "@/lib/expeditions/mapFixtures";
import LivingMap from "./LivingMap";

describe("LivingMap privacy", () => {
  it("does not render names for places the squad has not reached", () => {
    for (const { state, tier } of MAP_FIXTURE_KEYS) {
      const fixture = mapFixture(state, tier);
      const hidden = fixture.view.road
        .filter((place) => !place.known)
        .map((place) => FIXTURE_ROADS[tier][place.index].title);

      for (const layout of ["wide", "phone"] as const) {
        const { container, unmount } = render(
          <LivingMap view={fixture.view} progress={fixture.progress} layout={layout} />,
        );
        for (const title of hidden) {
          expect(container.textContent?.toLowerCase()).not.toContain(title.toLowerCase());
        }
        expect(container.querySelector("title")).toBeNull();
        unmount();
      }

      const html = renderToString(<LivingMap view={fixture.view} progress={null} />);
      for (const title of hidden) expect(html.toLowerCase()).not.toContain(title.toLowerCase());
    }
  });
});
