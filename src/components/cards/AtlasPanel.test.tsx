import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { atlasFor, type AtlasLandmark, type AtlasRun, type AtlasStamp } from "@/lib/expeditions/atlas";
import type { ExpeditionTierKey } from "@/lib/expeditions/config";
import { ROADS } from "@/lib/expeditions/routes";
import AtlasPanel from "./AtlasPanel";

const LEGEND = ROADS.legend.flat();
const LEGENDARY = ROADS.legendary.flat();

let nextId = 1;
function run(tier: ExpeditionTierKey, places: string[], day = nextId): AtlasRun {
  const stamp: AtlasStamp = { places, encounters: ["storm", "storm", "merchant"], ghosts: [] };
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

describe("AtlasPanel", () => {
  it("renders nothing when the atlas could not be read", () => {
    const { container } = render(<AtlasPanel atlas={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("says what will fill it before any squad is home", () => {
    render(<AtlasPanel atlas={atlasFor([])} />);
    expect(screen.getByTestId("atlas-empty").textContent).toContain("Bring a squad home and every place it walked is marked here");
    // Every road still says, plainly, what walking it pays.
    expect(screen.getByTestId("atlas-road-legend").textContent).toContain("0 of 9 places · pays 2 map fragments");
    expect(screen.getByTestId("atlas-road-legendary").textContent).toContain("pays 2 map fragments and a free pack");
    expect(screen.queryByTestId("atlas-road-exorcism")).toBeNull();
  });

  it("puts the count in plain words, with the road's reward beside it", () => {
    const runs = [run("legend", LEGEND.slice(0, 3).map((place) => place.key)), run("legend", LEGEND.slice(3, 7).map((place) => place.key))];
    render(<AtlasPanel atlas={atlasFor(runs)} />);
    expect(screen.getByTestId("atlas-seen-legend").textContent).toBe("You have seen 7 of the 9 places on the Legend Hunt.");
    expect(screen.getByTestId("atlas-reward-legend").textContent).toBe("See all 9 in one season and it pays 2 map fragments.");
    const bar = within(screen.getByTestId("atlas-road-legend")).getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("7");
    expect(bar.getAttribute("aria-valuemax")).toBe("9");
    expect(screen.getByTestId("atlas-met-legend").textContent).toBe("Met on the road: a merchant (twice) · a storm (4 times)");
  });

  it("shows a place not yet reached as a ? and never its name, even where the league has named it", () => {
    const seen = LEGEND.slice(0, 2);
    const unseen = LEGEND.slice(2);
    const mine = run("legend", seen.map((place) => place.key));
    const atlas = atlasFor([mine], LEGEND.map((place, index) => landmark(place.key, "77", "Bo", 900 + index)), { viewer: "42" });
    const { container } = render(<AtlasPanel atlas={atlas} />);
    const road = screen.getByTestId("atlas-road-legend");
    expect(within(road).getAllByTestId("atlas-unknown-legend")).toHaveLength(unseen.length);
    for (const place of unseen) {
      expect(container.textContent).not.toContain(place.title);
      expect(container.innerHTML).not.toContain(place.key);
    }
    for (const place of seen) expect(within(road).getByTestId(`atlas-place-${place.key}`).textContent).toContain(place.title);
    expect(screen.getByTestId("atlas-unseen-landmarks-legend").textContent).toContain("7 places you haven't reached have been named already");
    expect(screen.getByTestId("atlas-unseen-landmarks-legend").textContent).toContain("first reached by Bo");
  });

  it("says who reached a place first, the reader included, and wears the crest", () => {
    const mine = run("legend", [LEGEND[0].key, LEGEND[1].key]);
    const atlas = atlasFor([mine], [landmark(LEGEND[0].key, "42", "Me", mine.id), landmark(LEGEND[1].key, "77", "Bo", 555)], {
      viewer: "42",
      crests: new Set(["77"]),
    });
    render(<AtlasPanel atlas={atlas} />);
    expect(screen.getByTestId(`atlas-place-${LEGEND[0].key}`).textContent).toContain("first reached by you");
    const theirs = screen.getByTestId(`atlas-place-${LEGEND[1].key}`).textContent;
    expect(theirs).toContain("first reached by Bo");
    expect(theirs).toContain("crest");
    expect(screen.getByTestId("atlas-named").textContent).toContain(LEGEND[0].title);
  });

  it("wears a crest beside the name it belongs to, and ends the sentence on its date", () => {
    const mine = run("legend", [LEGEND[0].key]);
    const atlas = atlasFor([mine], [landmark(LEGEND[5].key, "77", "Bo", 555)], { viewer: "42", crests: new Set(["77"]) });
    render(<AtlasPanel atlas={atlas} />);
    const line = screen.getByTestId("atlas-unseen-landmarks-legend").textContent ?? "";
    expect(line).toMatch(/first reached by Bo★ crest on \S+ \d+\.$/);
    expect(line).not.toMatch(/crest\s*\.$/);
  });

  it("marks a road walked and paid, and one walked but not yet paid", () => {
    const whole = [run("legendary", LEGENDARY.slice(0, 6).map((place) => place.key)), run("legendary", LEGENDARY.slice(6).map((place) => place.key))];
    const paid = atlasFor(whole, [], { awards: [{ tier: "legendary", fragments: 2, comp: true, awardedAt: "2026-09-20T15:00:00.000Z" }] });
    const { unmount } = render(<AtlasPanel atlas={paid} />);
    expect(screen.getByTestId("atlas-seen-legendary").textContent).toBe("You have seen all 12 places on the Legendary route.");
    expect(screen.getByTestId("atlas-reward-legendary").textContent).toBe(
      "Walked end to end this season — you were paid 2 map fragments and a free pack on Sep 20.",
    );
    expect(screen.getByTestId("atlas-road-legendary").textContent).toContain("Walked");
    unmount();

    render(<AtlasPanel atlas={atlasFor(whole)} />);
    expect(screen.getByTestId("atlas-reward-legendary").textContent).toBe(
      "Every place walked. The reward — 2 map fragments and a free pack — is paid the next time a squad comes home from the Legendary route.",
    );
  });

  it("says when older runs show but do not count toward the reward", () => {
    const old: AtlasRun = { ...run("legend", []), stamp: null, rules: 5, forks: 3 };
    const atlas = atlasFor([old, run("legend", [LEGEND[8].key])]);
    const road = atlas.roads.find((entry) => entry.tier === "legend")!;
    render(<AtlasPanel atlas={atlas} />);
    expect(screen.getByTestId("atlas-reward-legend").textContent).toContain(
      `Only runs brought home since the atlas opened count toward it: ${road.counted} of 9 so far.`,
    );
  });

  it("gives every road's toggle a 44px target, and opens the roads with something on them", () => {
    render(<AtlasPanel atlas={atlasFor([run("raid", ["reactor", "ridge"])])} />);
    for (const details of screen.getByTestId("atlas").querySelectorAll("details")) {
      expect(details.querySelector("summary")!.className).toContain("min-h-11");
    }
    expect((screen.getByTestId("atlas-road-raid") as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByTestId("atlas-road-scout") as HTMLDetailsElement).open).toBe(false);
  });

  it("takes nothing from the road but types: the places stay on the server", () => {
    const source = readFileSync(join(process.cwd(), "src/components/cards/AtlasPanel.tsx"), "utf8");
    const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm)].map((match) => ({ typeOnly: Boolean(match[1]), from: match[2] }));
    for (const entry of imports) {
      expect(entry.from).not.toMatch(/@\/lib\/expeditions\/(routes|journal|views|queries)$/);
      if (entry.from === "@/lib/expeditions/atlas") expect(entry.typeOnly).toBe(true);
    }
  });
});
