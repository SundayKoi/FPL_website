import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { atlasFor, type AtlasLandmark, type AtlasRun, type AtlasStamp } from "@/lib/expeditions/atlas";
import type { ExpeditionTierKey } from "@/lib/expeditions/config";
import { ROADS } from "@/lib/expeditions/routes";
import AtlasPanel from "./AtlasPanel";

const LEGEND = ROADS.legend.flat();
let nextId = 1;

function run(tier: ExpeditionTierKey, places: string[], day = nextId): AtlasRun {
  const stamp: AtlasStamp = { places, encounters: [], ghosts: [] };
  return {
    id: nextId++,
    tier,
    startedAt: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    resolvesAt: `2026-09-${String(day + 1).padStart(2, "0")}T12:00:00.000Z`,
    claimedAt: `2026-09-${String(day + 1).padStart(2, "0")}T13:00:00.000Z`,
    forks: places.length,
    rules: 6,
    convoy: null,
    road: null,
    stamp,
  };
}

const landmark = (place: string, discordId: string, username: string, runId: number): AtlasLandmark => ({
  season: "S5",
  place,
  discordId,
  username,
  runId,
  reachedAt: "2026-09-10T15:00:00.000Z",
});

describe("AtlasPanel privacy", () => {
  it("does not reveal names of places the viewer has not reached", () => {
    const seen = LEGEND.slice(0, 2);
    const unseen = LEGEND.slice(2);
    const mine = run("legend", seen.map((place) => place.key));
    const atlas = atlasFor(
      [mine],
      LEGEND.map((place, index) => landmark(place.key, "77", "Bo", 900 + index)),
      { viewer: "42" },
    );
    const { container } = render(<AtlasPanel atlas={atlas} />);
    const road = screen.getByTestId("atlas-road-legend");
    expect(within(road).getAllByTestId("atlas-unknown-legend")).toHaveLength(unseen.length);
    for (const place of unseen) {
      expect(container.textContent).not.toContain(place.title);
      expect(container.innerHTML).not.toContain(place.key);
    }
    for (const place of seen) expect(within(road).getByTestId(`atlas-place-${place.key}`).textContent).toContain(place.title);
  });
});
