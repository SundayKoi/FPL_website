import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// views.ts is server-only (it holds the road); the tests derive a real
// view with it, the way the page does.
vi.mock("server-only", () => ({}));

import type { CardCopy } from "@/lib/expeditions/config";
import type { ConvoyView, ExpeditionRun } from "@/lib/expeditions/queries";
import { forksFor } from "@/lib/expeditions/routes";
import { runViewFor, type KnownPlaceView, type PlaceView, type RunView, type UnknownPlaceView } from "@/lib/expeditions/views";
import RunCard from "./RunCard";

const HOUR = 3_600_000;

const squad = [1, 2, 3].map((id) => ({ id, playerName: `Card ${id}`, role: "Mid", signed: false, foil: false, card: { archetype: "Jack of All Trades", teamName: null } }) as unknown as CardCopy);

/** A Deep Raid nine hours into twenty-four, on a drawn road: the first
 *  checkpoint open, the second ahead and unknown. */
function raid(now = Date.now()): ExpeditionRun {
  return {
    id: 301,
    tier: "raid",
    squad: [1, 2, 3],
    shine: 12,
    startedAt: new Date(now - 9 * HOUR).toISOString(),
    resolvesAt: new Date(now + 15 * HOUR).toISOString(),
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
}

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

function derived(run: ExpeditionRun, reveals: Parameters<typeof runViewFor>[0]["reveals"] = null, fragments?: number): RunView {
  return runViewFor({ run, copies: squad, now: new Date(), reveals, fragments });
}

function draw(props: Partial<Parameters<typeof RunCard>[0]> & { view: RunView | null }) {
  const onReveal = vi.fn(async () => null);
  const result = render(<RunCard run={raid()} byId={new Map()} onReveal={onReveal} {...props} />);
  return { ...result, onReveal, card: screen.getByTestId("run-301") };
}

describe("RunCard: the living map across the card", () => {
  it("draws the run's road as the living map, the latest journal line as its caption and the rest folded", () => {
    const view = derived(raid());
    const { card } = draw({ view });
    const map = within(card).getByTestId("living-map");
    expect(map.getAttribute("data-tier")).toBe("raid");
    const latest = view.journal.at(-1)!;
    expect(within(map).getByTestId("map-caption").textContent).toContain(latest.text);
    // The latest line is printed once outside the fold: in the caption.
    const fold = within(card).getByTestId("journal-301");
    const outside = [...card.querySelectorAll("p")].filter((node) => !fold.contains(node) && node.textContent?.includes(latest.text));
    expect(outside).toHaveLength(1);
    expect(within(fold).getAllByRole("listitem")).toHaveLength(view.journal.length);
    expect(fold.textContent).toContain(`Read the journal (${view.journal.length})`);
  });

  it("walks the squad to the board's clock, and rides a convoy partner and the league goal on the map", () => {
    const view = derived(raid());
    const convoy: ConvoyView = { code: "ABCD", host: true, partner: { discordId: "9", username: "Kai", runId: 900, choices: [] } };
    const { card } = draw({ view, convoy, goal: { kind: "boss", title: "The Colossus", done: 5, target: 24, unit: "pushes" } });
    const map = within(card).getByTestId("living-map");
    // The squad waits at the open fork, a third of the way along the raid.
    expect(Number(within(map).getByTestId("map-squad").getAttribute("data-fraction"))).toBeCloseTo(1 / 3, 2);
    expect(within(map).getByTestId("map-convoy")).toBeTruthy();
    expect(within(map).getByTestId("map-goal").getAttribute("data-kind")).toBe("boss");
    expect(within(card).getByTestId("convoy-301").textContent).toContain("Convoy with Kai");
  });

  it("says the squad has just set out, once, when nothing is written yet", () => {
    const view = { ...derived(raid()), journal: [] };
    const { card } = draw({ view });
    expect(within(card).getAllByText(/The squad has just set out/)).toHaveLength(1);
    expect(within(card).queryByTestId("journal-301")).toBeNull();
  });
});

describe("RunCard: the road ahead", () => {
  it("keeps the reveal in the map's corner and its words under the map", () => {
    const view = derived(raid(), { paid: false, partner: false }, 2);
    const { card, onReveal } = draw({ view, fragments: 2 });
    const corner = within(card).getByTestId("reveal-301");
    // The corner sits in the map's frame, beside the chart: globals.css
    // lays it over the chart's bottom-right where there is room.
    expect(corner.classList.contains("map-corner")).toBe(true);
    expect(corner.parentElement?.classList.contains("map-frame")).toBe(true);
    expect(corner.parentElement?.querySelector("[data-testid='living-map']")).not.toBeNull();
    // The map keeps that corner clear: no compass rose under the button.
    const rose = within(card).getByTestId("living-map").querySelector(".map-furniture")!;
    expect(rose.querySelectorAll("g")).toHaveLength(0);
    const note = within(card).getByTestId("reveal-note-301");
    // The Term's definition sits in the note too, hidden until asked for.
    expect(note.textContent).toMatch(/^Spend 1 map fragment.* to see every checkpoint left on this road\. You hold 2\.$/);
    expect(within(note).getByRole("button", { name: "map fragment" })).toBeTruthy();
    fireEvent.click(within(corner).getByRole("button", { name: "See the road ahead · 1 map fragment" }));
    expect(onReveal).toHaveBeenCalledWith(301);
  });

  it("says why the road can't be revealed, in words a disabled button points at", () => {
    const view = derived(raid(), { paid: false, partner: false }, 0);
    const { card } = draw({ view, fragments: 0 });
    const button = within(within(card).getByTestId("reveal-301")).getByRole("button", { name: /See the road ahead/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby")!)!;
    expect(reason.hasAttribute("data-reason")).toBe(true);
    expect(reason.textContent).toBe("Takes 1 map fragment — you have none to spend.");
  });

  it("offers nothing, and keeps the compass rose, when the squad already knows the road", () => {
    const view: RunView = { ...derived(raid()), reveal: { state: "known", fragments: 1, available: false, reason: "The squad already knows the rest of the road." } };
    const { card } = draw({ view });
    expect(within(card).queryByTestId("reveal-301")).toBeNull();
    expect(within(card).queryByTestId("reveal-note-301")).toBeNull();
    expect(within(card).getByTestId("living-map").querySelector(".map-furniture g")).not.toBeNull();
  });

  it("says in words what the marks ahead mean — the unseen, the dread, the Warden's reading — and nothing about the road behind", () => {
    const road: PlaceView[] = [
      known(0, "The threshold", { pushed: true, warned: true }),
      unknown(1, { warned: true }),
      unknown(2, { dark: true, toll: true }),
      unknown(3, { warned: true, dark: false, toll: false }),
    ];
    const view: RunView = { ...derived(raid()), tier: "legendary", road, openFork: null };
    const { card } = draw({ view });
    expect(within(card).getByTestId("unseen-301").textContent).toContain("3 checkpoints ahead the squad hasn't seen yet.");
    // The threshold is behind the squad: dreaded once, but no longer.
    expect(within(card).getByTestId("dread-301").textContent).toBe("The squad has a bad feeling about the second stop and the fourth stop.");
    expect(within(card).getByTestId("warden-301").textContent).toBe("The Warden's reading: the third stop is dark; the third stop charges a toll.");
    const map = within(card).getByTestId("living-map");
    expect(within(map).queryAllByTestId(/^map-dread-/).map((mark) => mark.getAttribute("data-testid"))).toEqual(["map-dread-1", "map-dread-3"]);
  });

  it("says who reached a known place first, the reader included, with the crest they wear", () => {
    const road: PlaceView[] = [
      known(0, "The flooded works", { landmark: { by: "Ana", mine: false, crest: true } }),
      known(1, "The dog pits", { landmark: { by: "Marlow", mine: true, crest: false } }),
      known(2, "The barricade"),
      unknown(3),
    ];
    const view: RunView = { ...derived(raid()), road, openFork: null };
    const { card } = draw({ view });
    expect(within(card).getByTestId("landmark-301-0").textContent).toBe("The flooded works: first reached by Ana★, wearing their crest");
    expect(within(card).getByTestId("landmark-301-1").textContent).toBe("The dog pits: first reached by you");
    expect(within(card).queryByTestId("landmark-301-2")).toBeNull();
    // The card prints these itself: the map's caption does not repeat them.
    expect(within(card).queryAllByTestId("map-caption-landmark")).toHaveLength(0);
  });
});

describe("RunCard on the server", () => {
  it("names the place the squad has reached in the server HTML, and never the one it has not", () => {
    // The old map's <title> rendered empty on the server under React 19
    // and the board failed to hydrate; the living map has no titles, and
    // the road ahead is not in the markup at all.
    const run = raid();
    const view = derived(run);
    const html = renderToString(<RunCard run={run} byId={new Map()} view={view} onReveal={async () => null} />);
    const [here, next] = forksFor("raid", { runId: 301, rules: 5, forks: 2 });
    expect(html).toContain(here.title);
    expect(html).not.toContain(next.title);
    expect(html).not.toContain("<title");
    // Before the clock is up the squad is not drawn: it would jump.
    expect(html).not.toContain('data-testid="map-squad"');
    expect(html).toContain('data-settled="false"');
  });
});
