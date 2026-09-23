import { renderToString } from "react-dom/server";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// views.ts is server-only (it holds the road); the test derives a real
// view with it, the way the page does.
vi.mock("server-only", () => ({}));

import type { CardCopy } from "@/lib/expeditions/config";
import type { ExpeditionRun } from "@/lib/expeditions/queries";
import { forksFor } from "@/lib/expeditions/routes";
import { runViewFor, type KnownPlaceView, type PlaceView, type UnknownPlaceView } from "@/lib/expeditions/views";
import RouteMap, { placeLabel } from "./RouteMap";

const HOUR = 3_600_000;
const now = new Date("2026-09-23T18:00:00.000Z");

const squad = [1, 2, 3].map((id) => ({ id, playerName: `Card ${id}`, role: "Mid", signed: false, foil: false, card: { archetype: "Jack of All Trades", teamName: null } }) as unknown as CardCopy);

/** A Deep Raid nine hours into twenty-four, on a drawn road: the first
 *  checkpoint open, the second ahead and unknown. */
const raid: ExpeditionRun = {
  id: 301,
  tier: "raid",
  squad: [1, 2, 3],
  shine: 12,
  startedAt: new Date(now.getTime() - 9 * HOUR).toISOString(),
  resolvesAt: new Date(now.getTime() + 15 * HOUR).toISOString(),
  outcome: null,
  claimedAt: null,
  forks: 2,
  choices: [],
  insured: false,
  target: null,
  fee: 0,
  encounters: [],
  rules: 5,
  convoy: null,
  campaign: null,
  road: null,
};

const base = { opensAt: "", closesAt: "", pushed: false, dark: null, toll: null } as const;
const known = (index: number, title: string, over: Partial<KnownPlaceView> = {}): KnownPlaceView => ({
  ...base,
  index,
  at: (index + 1) / 5,
  status: "decided",
  warned: false,
  known: true,
  key: title.toLowerCase(),
  title,
  choice: "camp",
  revealedBy: "walked",
  landmark: null,
  ...over,
});
const unknown = (index: number, over: Partial<UnknownPlaceView> = {}): UnknownPlaceView => ({
  ...base,
  index,
  at: (index + 1) / 5,
  status: "pending",
  warned: false,
  known: false,
  mark: "?",
  ...over,
});

describe("RouteMap on the server", () => {
  it("titles each known checkpoint in the server HTML, so hydration matches", () => {
    // React 19 renders a <title> with more than one child empty on the
    // server; the browser then rendered the name, and the whole board
    // failed to hydrate on any page with a squad in the field.
    const view = runViewFor({ run: raid, copies: squad, now, reveals: null });
    const html = renderToString(<RouteMap tier="raid" road={view.road} progress={null} />);
    const [here, next] = forksFor("raid", { runId: 301, rules: 5, forks: 2 });
    expect(html).toContain(`<title>${here.title} — open now</title>`);
    expect(html).toContain("<title>An unknown checkpoint — ahead</title>");
    expect(html).not.toContain("<title></title>");
    // The place the squad has not reached is not in the markup at all.
    expect(html).not.toContain(next.title);
  });
});

describe("RouteMap", () => {
  it("draws a `?` for a place the squad does not know, and its title for one it does", () => {
    const road: PlaceView[] = [known(0, "The reactor"), unknown(1), unknown(2)];
    const { getByTestId } = render(<RouteMap tier="legend" road={road} progress={0.5} />);
    const map = getByTestId("route-map");
    expect(map.querySelectorAll('[data-known="true"]')).toHaveLength(1);
    expect(map.querySelectorAll('[data-known="false"] [data-unknown]')).toHaveLength(2);
    expect(map.textContent).toContain("The reactor");
    expect(map.getAttribute("aria-label")).toBe("Legend Hunt route, 50% along; 2 of 3 checkpoints unknown");
  });

  it("marks the dread over a warned place ahead, and the Warden's dark and toll when read", () => {
    const road: PlaceView[] = [
      known(0, "The threshold", { pushed: true }),
      unknown(1, { warned: true }),
      unknown(2, { dark: true, toll: true }),
      unknown(3, { warned: true, dark: false, toll: false }),
    ];
    const { getByTestId } = render(<RouteMap tier="legendary" road={road} progress={0.3} />);
    const map = getByTestId("route-map");
    expect(map.querySelector('[data-stop="1"] [data-dread]')).not.toBeNull();
    expect(map.querySelector('[data-stop="2"] [data-dread]')).toBeNull();
    expect(map.querySelector('[data-stop="2"] [data-dark]')).not.toBeNull();
    expect(map.querySelector('[data-stop="2"] [data-toll]')).not.toBeNull();
    expect(map.querySelector('[data-stop="3"] [data-dark], [data-stop="3"] [data-toll]')).toBeNull();
    expect(placeLabel(road[1])).toBe("An unknown checkpoint — ahead — the squad has a bad feeling about it");
    expect(placeLabel(road[2])).toBe("An unknown checkpoint — ahead — dark — a toll to camp");
  });

  it("stops warning about a place once the squad is past it", () => {
    const road: PlaceView[] = [known(0, "The mirror hall", { warned: true, status: "decided" }), known(1, "The last table", { warned: true, status: "pending", choice: null })];
    const { getByTestId } = render(<RouteMap tier="legendary" road={road} progress={0.4} />);
    const map = getByTestId("route-map");
    expect(map.querySelector('[data-stop="0"] [data-dread]')).toBeNull();
    expect(map.querySelector('[data-stop="1"] [data-dread]')).not.toBeNull();
  });
});
