import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The board is handed its views by the page, which derives them with
// views.ts — `import "server-only"`, since it holds the road. The tests
// derive them the same way, so stand the package in.
vi.mock("server-only", () => ({}));

import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { briefFor, shineOf } from "@/lib/expeditions/config";
import type { ConvoyView, ExpeditionRun, Grave, LostHold } from "@/lib/expeditions/queries";
import type { Rivalry } from "@/lib/expeditions/company";
import type { WeatherKey } from "@/lib/expeditions/weather";
import type { Accolade, StandingRow } from "@/lib/expeditions/standings";
import type { CampaignState } from "@/lib/expeditions/campaigns";
import { EMPTY_CAMP, type CampState } from "@/lib/expeditions/camp";
import type { LeagueBoard } from "@/lib/expeditions/league";
import ExpeditionBoard from "./ExpeditionBoard";
import { forkOptions, forksFor } from "@/lib/expeditions/routes";
import { roadOf } from "@/lib/expeditions/queries";
import { PERSONAS, boardFixture, type Persona } from "@/lib/expeditions/boardFixtures";
import { GLOSSARY, glossaryHits } from "@/lib/expeditions/glossary";
import type { RevealReads } from "@/lib/expeditions/reveal";
import { buildRunViews, campaignRoadTitles, type RunView } from "@/lib/expeditions/views";
import { atlasFor, type Atlas } from "@/lib/expeditions/atlas";

/** A route that changed nothing: every card home, no forks pushed. */
const QUIET_ROUTE = (ids: number[]) => ({
  lootMultiplier: 1,
  pushes: 0,
  silences: 0,
  fates: ids.map((id) => ({ id, fate: "home" as const, mutation: null, woundedUntil: null })),
  fragments: 0,
  rescued: null,
  cleansed: null,
      surge: [],
      echo: null,
  events: [],
});

// The two server actions. "use server" modules pull in server-only
// transitively (runs.ts), so jsdom can't load the real one at all — and the
// board's whole job here is what it does with the results.
const {
  launchExpeditionAction,
  claimExpeditionAction,
  decideForkAction,
  ransomLostCardAction,
  startCampaignAction,
  abandonCampaignAction,
  upgradeCampAction,
  forgePolicyAction,
  revealRoadAction,
} = vi.hoisted(() => ({
  launchExpeditionAction: vi.fn(),
  claimExpeditionAction: vi.fn(),
  decideForkAction: vi.fn(),
  ransomLostCardAction: vi.fn(),
  startCampaignAction: vi.fn(),
  abandonCampaignAction: vi.fn(),
  upgradeCampAction: vi.fn(),
  forgePolicyAction: vi.fn(),
  revealRoadAction: vi.fn(),
}));
vi.mock("@/lib/expeditions/actions", () => ({
  launchExpeditionAction,
  claimExpeditionAction,
  decideForkAction,
  ransomLostCardAction,
  startCampaignAction,
  abandonCampaignAction,
  upgradeCampAction,
  forgePolicyAction,
  revealRoadAction,
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

/** The Eastern day the board is pinned to in these tests. Its brief is
 *  looked up rather than spelled out — briefFor owns that mapping. */
const TODAY = "2026-08-27";
const BRIEF = briefFor(TODAY);

function makeCard(name: string, role: string): PlayerCardData {
  return {
    slug: name.toLowerCase(),
    name,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role,
    overall: 80,
    tier: { key: "gold", label: "Gold" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 48,
    topChampions: [],
    form: [],
    subStats: [{ key: "combat", label: "Combat", value: 50 }],
    highlights: [],
    badges: [],
    standout: false,
    wins: 1,
    losses: 1,
    winratePct: 50,
    level: 10,
    pentas: 0,
    season: "S5",
  };
}

function makeCopy(
  id: number,
  playerName: string,
  tier: string,
  extra: Partial<InventoryRow> = {},
): InventoryRow {
  const role = extra.role ?? "Mid";
  return {
    id,
    season: "S5",
    slug: playerName.toLowerCase(),
    playerName,
    role,
    editionWeek: "2026-08-24",
    overall: 80,
    tier,
    foil: false,
    foilType: null,
    signed: false,
    card: makeCard(playerName, role),
    packOpenId: null,
    acquiredAt: "2026-08-25T00:00:00.000Z",
    printNumber: null,
    mutation: null,
    ...extra,
  };
}

// shineOf: tier ladder index + 1, plus the foil parallel, plus 4 for ink.
// Alba 3 (gold), Bex 2 (silver), Cyn 7 (diamond 6 + prisma 1),
// Dov 16 (challenger 8 + ice 4 + signed 4), Eve 1 (bronze) — and Eve is the
// one that's already out.
const COPIES: InventoryRow[] = [
  makeCopy(1, "Alba", "gold", { role: "Mid" }),
  makeCopy(2, "Bex", "silver", { role: "Top" }),
  makeCopy(3, "Cyn", "diamond", { foil: true, foilType: "prisma", role: "Jungle" }),
  makeCopy(4, "Dov", "challenger", { foil: true, foilType: "ice", signed: true, role: "Support" }),
  makeCopy(5, "Eve", "bronze", { role: "Bot" }),
];

const HOUR = 60 * 60 * 1000;

/** The zone this process runs in, captured before any test moves it.
 *  `delete process.env.TZ` does NOT put Node back on the system zone, so
 *  the field-log case restores by naming the zone rather than by unsetting
 *  the variable. */
const AMBIENT_TZ = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

function makeRun(over: Partial<ExpeditionRun> & { id: number }): ExpeditionRun {
  return {
    tier: "raid",
    squad: [5, 1, 2],
    shine: 12,
    // Noon Eastern on TODAY, fixed rather than relative: the ceremony names
    // the brief of the day the run LAUNCHED, and a `Date.now() - 3h` would
    // make that assertion depend on what time the suite happens to run.
    startedAt: "2026-08-27T16:00:00.000Z",
    resolvesAt: new Date(Date.now() + 1.5 * HOUR).toISOString(),
    outcome: null,
    claimedAt: null,
    forks: 0,
    choices: [],
    insured: false,
    target: null,
    fee: 0,
    encounters: [],
    rules: 2,
    convoy: null,
    campaign: null,
    road: null,
    ...over,
  };
}

function renderBoard(
  over: {
    runs?: ExpeditionRun[];
    deployedIds?: Set<number>;
    copies?: InventoryRow[];
    holds?: LostHold[];
    graves?: Grave[];
    fragments?: number;
    patron?: boolean;
    policyUsed?: boolean;
    insuredThisWeek?: number;
    playingToday?: string[];
    rivals?: Record<number, string>;
    convoys?: Record<number, ConvoyView>;
    rivalries?: Rivalry[];
    weather?: WeatherKey | null;
    standings?: StandingRow[];
    accolades?: Accolade[];
    viewerId?: string | null;
    campaign?: CampaignState | null;
    legendMark?: boolean;
    camp?: CampState | null;
    forgedThisWeek?: number | null;
    balance?: number;
    league?: LeagueBoard | null;
    /** The paid reveals, as fetchReveals reads them. Null (the default)
     *  is the read that failed: the fog stays and the button is hidden. */
    reveals?: RevealReads | null;
    /** Views as handed in, in place of the ones derived here. */
    views?: Record<number, RunView>;
    atlas?: Atlas | null;
  } = {},
) {
  // The views the page would derive for these runs, at this instant.
  const views =
    over.views ??
    buildRunViews({
      runs: over.runs ?? [],
      copies: over.copies ?? COPIES,
      now: new Date(),
      reveals: over.reveals ?? null,
      convoys: over.convoys,
      rivals: over.rivals,
      camp: over.camp ? { tent: over.camp.tent } : null,
      fragments: over.fragments ?? 0,
    });
  return render(
    <ExpeditionBoard
      views={views}
      convoys={over.convoys}
      rivalries={over.rivalries}
      weather={over.weather ?? null}
      standings={over.standings}
      accolades={over.accolades}
      viewerId={over.viewerId ?? null}
      campaign={over.campaign ?? null}
      campaignRoad={campaignRoadTitles(over.campaign ?? null)}
      season="S_TEST"
      legendMark={over.legendMark ?? true}
      playingToday={over.playingToday}
      copies={over.copies ?? COPIES}
      runs={over.runs ?? []}
      deployedIds={over.deployedIds ?? new Set([5])}
      today={TODAY}
      holds={over.holds}
      graves={over.graves}
      fragments={over.fragments}
      patron={over.patron}
      policyUsed={over.policyUsed}
      insuredThisWeek={over.insuredThisWeek}
      camp={over.camp}
      forgedThisWeek={over.forgedThisWeek}
      balance={over.balance}
      league={over.league}
      atlas={over.atlas}
    />,
  );
}

/** Pick a copy by the accessible name its chip carries. */
function pick(playerName: string, shine: number) {
  fireEvent.click(screen.getByRole("button", { name: `${playerName} — ${shine} shine` }));
}

/** Alba + Bex + Cyn: 12 shine, one foil, no ink — clears Deep Raid exactly
 *  and misses all three of Legend Hunt's gates. */
function pickTwelveShineSquad() {
  pick("Alba", 3);
  pick("Bex", 2);
  pick("Cyn", 7);
}

/** One route card renders at a time, under the row of route pills: show
 *  `key`'s. The best route the squad can run is preselected; every other
 *  route is a tap away. */
function showRoute(key: string) {
  fireEvent.click(screen.getByTestId(`route-pill-${key}`));
}

/** What an element reads as on screen: its text without the closed
 *  definitions of the Terms inside it. */
function shownText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("[hidden]").forEach((node) => node.remove());
  return copy.textContent ?? "";
}

/** The drawer mounts one panel at a time (the log by default): open `key`. */
function openTab(key: string) {
  fireEvent.click(screen.getByTestId(`tab-${key}`));
}

async function click(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
  });
}

beforeEach(() => {
  launchExpeditionAction.mockReset().mockResolvedValue({ ok: true, runId: 99, resolvesAt: "2026-08-28T00:00:00.000Z", fee: 0, freePolicy: false });
  claimExpeditionAction.mockReset().mockResolvedValue({
    ok: true,
    outcome: { grade: "solid", dollars: 180, comp: true, mark: "sigil", briefHit: true },
    route: QUIET_ROUTE([5, 1, 2]),
    baseDollars: 180,
    merchant: 0,
    stranded: null,
    surge: [],
    echo: null,
    bearerId: 1,
    balance: 5000,
    fragments: 0,
  });
  decideForkAction.mockReset().mockResolvedValue({ ok: true, closesAt: "2026-08-28T00:00:00.000Z" });
  upgradeCampAction.mockReset().mockResolvedValue({ ok: true, camp: EMPTY_CAMP, balance: 0, fragments: 0 });
  forgePolicyAction.mockReset().mockResolvedValue({ ok: true, camp: EMPTY_CAMP, balance: 0, fragments: 0 });
  revealRoadAction.mockReset().mockResolvedValue({ ok: true, fragments: 0 });
  ransomLostCardAction.mockReset().mockResolvedValue({ ok: true, balance: 900, paid: 340 });
  refresh.mockReset();
  // The first-visit guide remembers a dismissal here; every case starts
  // as a first visit.
  window.localStorage.clear();
});

describe("ExpeditionBoard — the day's brief", () => {
  it("posts today's brief with what fielding it is worth", () => {
    renderBoard();

    expect(screen.getByText(`${BRIEF.label} — +20% yield`)).toBeTruthy();
  });

  it("names the role the brief actually asks for", () => {
    renderBoard();

    // "Jungle" for 2026-08-27 — the label alone doesn't say which card to
    // swap in, which is the only decision the brief drives.
    expect(screen.getByTestId("expedition-brief").textContent).toContain(BRIEF.role);
  });
});

describe("ExpeditionBoard — tier cards", () => {
  it("prints each tier's entry requirements and duration, in the board's word for shine", () => {
    renderBoard();

    showRoute("raid");
    const raid = screen.getByTestId("tier-raid");
    expect(within(raid).getByText("Deep Raid")).toBeTruthy();
    expect(shownText(screen.getByTestId("tier-raid-needs"))).toBe("power 12 · 1 foil");
    expect(within(raid).getByText("24 hours away · 2 forks")).toBeTruthy();

    showRoute("legend");
    const legend = screen.getByTestId("tier-legend");
    expect(shownText(screen.getByTestId("tier-legend-needs"))).toBe("power 20 · 2 foils · 1 signed");
    expect(within(legend).getByText("48 hours away · 3 forks")).toBeTruthy();
    // "power" is the Term, and its definition owns up to the rules' word.
    const power = within(screen.getByTestId("tier-legend-needs")).getByRole("button", { name: "power" });
    expect(power.closest("[data-term]")?.getAttribute("data-term")).toBe("power");
    expect(document.getElementById(power.getAttribute("aria-controls")!)!.textContent).toContain("the rules call it shine");
    expect(shownText(legend)).not.toMatch(/\bshine\b/);

    // The ungated tier says so rather than showing an empty line.
    showRoute("scout");
    expect(shownText(screen.getByTestId("tier-scout-needs"))).toBe("Anyone can run it");
  });

  it("locks the Gilded Road for everyone but a patron", () => {
    renderBoard();

    showRoute("gilded");
    const gilded = screen.getByTestId("tier-gilded");
    expect(within(gilded).getByTestId("tier-gilded-patron")).toBeTruthy();
    expect(shownText(screen.getByTestId("tier-gilded-needs"))).toBe("patrons only · power 6 · 3 signed");
    expect(within(gilded).getByTestId("tier-gilded-locked")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Launch The Gilded Road" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Patrons only");
  });

  it("explains trail miles and the three titles in the rules of the road", () => {
    renderBoard();
    openTab("rules");
    const rule = screen.getByTestId("rule-miles");
    expect(rule.textContent).toContain("Scouting Run 1");
    expect(rule.textContent).toContain("Legendary route 4");
    expect(rule.textContent).toContain("An Exorcism is a rite, not a road");
    expect(within(rule).getByTestId("rule-title-trailworn").textContent).toContain("8 miles");
    expect(within(rule).getByTestId("rule-title-veteran").textContent).toContain("16 miles");
    expect(within(rule).getByTestId("rule-title-wayfarer").textContent).toContain("30 miles");
    expect(within(rule).getByTestId("rule-title-wayfarer").textContent).toContain("one more shine");
  });

  it("explains the Gilded Road in the rules of the road", () => {
    renderBoard();
    openTab("rules");
    const rule = screen.getByTestId("rule-gilded");
    expect(rule.textContent).toContain("3 signed cards");
    expect(rule.textContent).toContain("$1,000–$3,000");
    expect(screen.getByTestId("insurance-note").textContent).toContain("1 of 1 left this week");
  });

  it("opens the Gilded Road to a patron", () => {
    renderBoard({ patron: true });

    showRoute("gilded");
    const gilded = screen.getByTestId("tier-gilded");
    expect(within(gilded).queryByTestId("tier-gilded-locked")).toBeNull();
    expect((screen.getByRole("button", { name: "Launch The Gilded Road" }) as HTMLButtonElement).textContent).toBe("Send them out");
  });

  it("disables a tier the selection can't field, listing every unmet reason", () => {
    renderBoard();
    pickTwelveShineSquad();

    showRoute("legend");
    const legend = screen.getByTestId("tier-legend");
    // squadMeets' sentences — the board must not restate the gates in its
    // own words, or the two drift — with the one word the board says
    // differently: power, where the rules say shine.
    expect(within(legend).getByText("Legend Hunt needs 2 foil cards — this squad has 1.")).toBeTruthy();
    expect(within(legend).getByText("Legend Hunt needs 1 signed card — this squad has 0.")).toBeTruthy();
    expect(within(legend).getByText("Legend Hunt needs 20 power — this squad has 12.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);

    // The same squad clears Deep Raid on the nose: 12 shine, one foil.
    showRoute("raid");
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(screen.getByTestId("tier-raid")).queryByRole("listitem")).toBeNull();
  });

  it("shuts a tier whose run is still in the field, and leaves the others open", () => {
    // One of each at a time: launch_expedition raises `tier already out`,
    // and the board has to say so before the click rather than after it.
    renderBoard({ runs: [makeRun({ id: 30, tier: "legend", squad: [9, 8, 7] })] });
    pickTwelveShineSquad();

    showRoute("legend");
    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText(/One Legend Hunt at a time/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);

    // The raid slot is untouched — a tier is a slot, not a lock on the board.
    showRoute("raid");
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("tier-raid-out")).toBeNull();
  });

  it("reopens a tier once its run has been claimed", () => {
    renderBoard({
      runs: [makeRun({ id: 31, tier: "raid", squad: [9, 8, 7], claimedAt: new Date().toISOString() })],
    });
    pickTwelveShineSquad();
    showRoute("raid");

    expect(screen.queryByTestId("tier-raid-out")).toBeNull();
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds every tier shut until three cards are picked", () => {
    renderBoard();
    pick("Alba", 3);

    showRoute("scout");
    expect((screen.getByRole("button", { name: "Launch Scouting Run" }) as HTMLButtonElement).disabled).toBe(true);
    expect(
      within(screen.getByTestId("tier-scout")).getByText(
        "An expedition takes exactly 3 cards — this squad has 1.",
      ),
    ).toBeTruthy();
  });

  it("launches the chosen tier with the chosen squad", async () => {
    renderBoard();
    pickTwelveShineSquad();
    showRoute("raid");

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(launchExpeditionAction).toHaveBeenCalledTimes(1);
    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3], { insured: false, target: null, convoy: null });
    expect(refresh).toHaveBeenCalledTimes(1);
    // The squad went out — the picker is empty again rather than still
    // offering the three cards that just left.
    expect(screen.getByTestId("squad-shine").textContent).toContain("0");
  });

  it("surfaces a refused launch and doesn't refresh", async () => {
    launchExpeditionAction.mockResolvedValue({ ok: false, error: "One of those cards is already out on an expedition." });
    renderBoard();
    pickTwelveShineSquad();
    showRoute("raid");

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(screen.getByText("One of those cards is already out on an expedition.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("ExpeditionBoard — the squad picker", () => {
  it("totals the selection's shine as the sum of shineOf", () => {
    renderBoard();
    pickTwelveShineSquad();

    const expected = shineOf(COPIES[0]) + shineOf(COPIES[1]) + shineOf(COPIES[2]);
    expect(expected).toBe(12);
    expect(screen.getByTestId("squad-shine").textContent).toContain(String(expected));
  });

  it("chips every copy with what it is worth", () => {
    renderBoard();

    // "power" on the chip, the rules' shine behind it (the chips' names
    // still say shine, for the screen reader and these tests).
    expect(screen.getByText("power 7")).toBeTruthy();
    expect(screen.getByText("power 16")).toBeTruthy();
  });

  it("locks copies that are already out and says why", () => {
    renderBoard();

    const eve = screen.getByRole("button", { name: "Eve — 1 shine" }) as HTMLButtonElement;
    expect(eve.disabled).toBe(true);
    expect(eve.title).toBe("On expedition.");

    fireEvent.click(eve);
    expect(screen.getByTestId("squad-shine").textContent).toContain("0");
  });

  it("takes three and no more", () => {
    renderBoard();
    pickTwelveShineSquad();

    // The third pick folds the grid into a summary; "Change" opens it again.
    expect(screen.queryByRole("button", { name: "Dov — 16 shine" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const dov = screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement;
    expect(dov.disabled).toBe(true);
    expect(dov.textContent).toContain("three picked");

    // Dropping one frees the slot again.
    pick("Bex", 2);
    expect((screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("ExpeditionBoard — runs in the field", () => {
  it("counts a squad that is still out down, with no way to claim it", () => {
    renderBoard({ runs: [makeRun({ id: 20 })], deployedIds: new Set([5, 1, 2]) });

    const run = screen.getByTestId("run-20");
    // The fixture resolves at exactly +1h30m, so whether this reads 30m or
    // 29m depends on how many microseconds passed between building the run
    // and rendering it. The assertion is "it counts down from about an hour
    // and a half", not "the machine was slow".
    expect(within(run).getByText(/Back in 1h (28|29|30)m/)).toBeTruthy();
    expect(within(run).queryByRole("button", { name: /^Claim/ })).toBeNull();
    expect(within(run).getByRole("heading", { name: "Deep Raid" })).toBeTruthy();
  });

  it("offers the claim once the squad is due back", () => {
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    expect(screen.getByRole("button", { name: "Claim the Deep Raid" })).toBeTruthy();
    expect(within(screen.getByTestId("run-21")).queryByText(/Back in/)).toBeNull();
  });

  it("shows who went out on a run", () => {
    renderBoard({ runs: [makeRun({ id: 20 })], deployedIds: new Set([5, 1, 2]) });

    const run = screen.getByTestId("run-20");
    for (const name of ["Eve", "Alba", "Bex"]) {
      expect(within(run).getByText(name)).toBeTruthy();
    }
  });

  it("draws the route under a run and keeps its trail journal, folded to the latest lines", () => {
    // Nine hours into a 24h raid with two forks: the first leg's two trail
    // lines and the arrival at fork 1 are all in the past, so the journal
    // has three lines to show and nothing yet to fold.
    renderBoard({
      runs: [
        makeRun({
          id: 23,
          forks: 2,
          startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
          resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
        }),
      ],
      deployedIds: new Set([5, 1, 2]),
    });

    const run = screen.getByTestId("run-23");
    expect(within(run).getByTestId("living-map")).toBeTruthy();
    // The latest line is the map's caption; the rest fold under the card.
    expect(within(run).getByTestId("map-caption").textContent).toContain("The squad reached the reactor.");
    const journal = within(run).getByTestId("journal-23");
    expect(within(journal).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(journal.textContent).toContain("The squad reached the reactor.");
    expect(within(run).queryByText(/just set out/)).toBeNull();
  });

  it("says the squad has just set out before the trail has anything to report", () => {
    renderBoard({
      runs: [makeRun({ id: 24, startedAt: new Date().toISOString(), resolvesAt: new Date(Date.now() + 24 * HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    const run = screen.getByTestId("run-24");
    expect(within(run).getByText(/The squad has just set out/)).toBeTruthy();
    expect(within(run).queryByTestId("journal-24")).toBeNull();
  });

  it("shows art for every kind of print that can march, not just player cards", () => {
    // A champions relic names its champion on champWin and a moment names
    // it on moment — neither carries a `signature`. Reading only the
    // signature rendered both as a "?" box in the squad strip.
    const marching: InventoryRow[] = [
      makeCopy(1, "Alba", "gold", {
        card: { ...makeCard("Alba", "Mid"), signature: { champion: "Ahri", games: 9 } },
      }),
      makeCopy(2, "the fool", "challenger", {
        card: {
          ...makeCard("the fool", "Mid"),
          champWin: {
            rank: "JOKER",
            setIndex: 5,
            setSize: 6,
            team: "Faceless",
            seasonWon: "S4",
            champion: "Xin Zhao",
            joker: true,
          },
        },
      }),
      makeCopy(3, "Cyn", "diamond", {
        card: {
          ...makeCard("Cyn", "Jungle"),
          moment: {
            id: 7,
            title: "ONE MAN ARMY",
            headline: "40% of the damage",
            summonerName: "Cyn",
            champion: "Yasuo",
            teamName: null,
            weekStart: "2026-08-24",
            playerSlug: "cyn",
          },
        },
      }),
    ];

    renderBoard({
      copies: marching,
      runs: [makeRun({ id: 22, squad: [1, 2, 3] })],
      deployedIds: new Set([1, 2, 3]),
    });

    const run = screen.getByTestId("run-22");
    const art = run.querySelectorAll("img");
    expect(art).toHaveLength(3);
    expect(within(run).queryByText("?")).toBeNull();
    const sources = [...art].map((image) => image.getAttribute("src") ?? "");
    expect(sources.some((src) => /XinZhao/i.test(src))).toBe(true);
    expect(sources.some((src) => /Ahri/i.test(src))).toBe(true);
    expect(sources.some((src) => /Yasuo/i.test(src))).toBe(true);
  });
});

describe("ExpeditionBoard — the field log", () => {
  // 10pm Eastern on 1 September, which is already the 2nd in UTC. A log
  // that formats without a timeZone prints the SERVER's day into the HTML
  // and the VIEWER's day after hydration — a React mismatch, and the wrong
  // date, for every run launched between midnight and 4am UTC.
  const LATE_ON_THE_FIRST = "2026-09-02T02:00:00.000Z";

  function finishedRun() {
    return makeRun({
      id: 30,
      startedAt: LATE_ON_THE_FIRST,
      resolvesAt: "2026-09-02T10:00:00.000Z",
      claimedAt: "2026-09-02T10:30:00.000Z",
      outcome: {
        grade: "solid", dollars: 120, comp: false, mark: null, bearer: null,
        lootMultiplier: 1, pushes: 0, fragments: 0, fates: [], events: [], rescued: null, cleansed: null,
      surge: [],
      echo: null,
      },
    });
  }

  afterEach(() => {
    process.env.TZ = AMBIENT_TZ;
  });

  it("dates a finished run on the Eastern calendar, not on the renderer's zone", () => {
    // Rendered from a UTC box — the server's situation. Without the fix the
    // log reads "Sep 2" here and "Sep 1" in an Eastern browser.
    process.env.TZ = "UTC";
    expect(new Date(LATE_ON_THE_FIRST).toLocaleDateString("en-US", { month: "short", day: "numeric" }))
      .toBe("Sep 2");

    renderBoard({ runs: [finishedRun()] });

    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(within(log).getByText("Sep 1")).toBeTruthy();
  });

  it("reads the same date from an Eastern browser, so hydration agrees", () => {
    process.env.TZ = "America/New_York";

    renderBoard({ runs: [finishedRun()] });

    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(within(log).getByText("Sep 1")).toBeTruthy();
    expect(within(log).getByText("$120")).toBeTruthy();
  });
});

describe("ExpeditionBoard — the claim ceremony", () => {
  const resolvable = () =>
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

  it("banks the payout and names the card the mark landed on", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    expect(claimExpeditionAction).toHaveBeenCalledWith(21);
    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$180");
    expect(within(ceremony).getByText("Alba — Home")).toBeTruthy();
    expect(within(ceremony).getByText(/wears the sigil mark/)).toBeTruthy();
    // Sigil, not the mark the card was already wearing (none).
    expect(within(ceremony).getByRole("img", { name: "Expedition mark — Sigil" })).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("calls out the free pack and the brief bonus when they landed", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("free pack");
    expect(ceremony.textContent).toContain(BRIEF.label);
  });

  it("stays quiet about a mark when none dropped", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "poor", dollars: 40, comp: false, mark: null, briefHit: false },
      route: QUIET_ROUTE([5, 1, 2]),
      baseDollars: 40,
      bearerId: null,
      balance: 1040,
      fragments: 0,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
    });
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$40");
    expect(within(ceremony).queryByText(/wears the/)).toBeNull();
    expect(ceremony.textContent).not.toContain("free pack");
  });

  it("can be dismissed with the keyboard", async () => {
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));
    expect(screen.getByTestId("expedition-ceremony")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Back to the board");

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByTestId("expedition-ceremony")).toBeNull();
  });

  it("surfaces a refused claim, and re-reads the server so a paid run can't stick", async () => {
    claimExpeditionAction.mockResolvedValue({ ok: false, error: "That squad is still out — check back soon." });
    resolvable();

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    expect(screen.getByText("That squad is still out — check back soon.")).toBeTruthy();
    expect(screen.queryByTestId("expedition-ceremony")).toBeNull();
    // No ceremony and no optimistic move to the log: the board shows what
    // the server says. The refresh is what keeps an 'already claimed'
    // refusal — the claim landed, the response was dropped — from leaving
    // a live Claim button over a run that is already paid.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Claim the Deep Raid" })).toBeTruthy();
  });
});

describe("ExpeditionBoard — a copy the shelf named", () => {
  it("starts the squad with ?send='s copy, unless it is away", () => {
    const copies = [makeCopy(1, "Alba", "gold"), makeCopy(2, "Bex", "gold")];
    render(<ExpeditionBoard copies={copies} runs={[]} views={{}} deployedIds={new Set()} today={TODAY} initialPick={2} />);
    expect(screen.getByRole("button", { name: /^Bex — / }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Alba — / }).getAttribute("aria-pressed")).toBe("false");
    cleanup();

    render(<ExpeditionBoard copies={copies} runs={[]} views={{}} deployedIds={new Set([2])} today={TODAY} initialPick={2} />);
    expect(screen.getByRole("button", { name: /^Bex — / }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ExpeditionBoard — the rules of the road", () => {
  it("prints every run's worst case and every mutation's consequences", () => {
    renderBoard();
    openTab("rules");

    const rules = screen.getByTestId("expedition-rules");
    expect(within(rules).getByText("The rules of the road")).toBeTruthy();
    expect(within(rules).getAllByText("Cards can DIE").length).toBeGreaterThan(0);
    for (const key of ["irradiated", "hardened", "haunted", "cursed", "voidtouched"]) {
      const rule = within(rules).getByTestId(`rule-${key}`);
      expect(rule.textContent).toContain("Fantasy:");
      expect(rule.textContent).toContain("Market:");
    }
    expect(rules.textContent).toContain("Silence is safe.");
    expect(rules.textContent).toContain("Never at risk:");
  });

  it("names the picked cards in each route's consent line, and softens it with insurance", () => {
    renderBoard();
    pickTwelveShineSquad();

    showRoute("scout");
    expect(screen.getByTestId("consent-scout").textContent).toBe("Nothing on this run can hurt a card.");
    showRoute("raid");
    expect(screen.getByTestId("consent-raid").textContent).toContain("Alba, Bex, Cyn can come home wounded");
    showRoute("legendary");
    expect(screen.getByTestId("consent-legendary").textContent).toContain("can DIE");

    fireEvent.click(screen.getByRole("checkbox", { name: /Insure this run/ }));
    expect(screen.getByTestId("consent-legendary").textContent).toContain("can be lost");
    showRoute("legend");
    expect(screen.getByTestId("consent-legend").textContent).toContain("wounded");
  });

  it("caps insurance at one policy a week, two for a patron", () => {
    renderBoard();
    expect(screen.getByTestId("insurance-note").textContent).toContain("1 of 1 left this week");

    cleanup();
    renderBoard({ insuredThisWeek: 1 });
    const box = screen.getByRole("checkbox", { name: /Insure this run/ }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByTestId("insurance-note").textContent).toContain("spent for the week — 1 a week, 2 for patrons");

    cleanup();
    renderBoard({ patron: true, insuredThisWeek: 1 });
    expect((screen.getByRole("checkbox", { name: /Insure this run/ }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByTestId("insurance-note").textContent).toContain("1 of 2 left this week");
  });

  it("keeps a one-of-one off the routes that can lose it, saying which card", () => {
    const eclipse = makeCopy(6, "Fen", "challenger", { foil: true, foilType: "eclipse", signed: true, role: "Mid" });
    renderBoard({ copies: [...COPIES, eclipse] });
    pick("Fen", 16);
    pick("Dov", 16);
    pick("Cyn", 7);

    showRoute("legend");
    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("Fen is one of one and cannot go on a route where a card can be lost.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legend Hunt" }) as HTMLButtonElement).disabled).toBe(true);
    showRoute("raid");
    expect((screen.getByRole("button", { name: "Launch Deep Raid" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls a moment or a plate a relic, not a one-of-one, and keeps it off the same routes", () => {
    const moment = makeCopy(7, "Big Game", "gold", { role: "Mid", card: { moment: { id: 1 } } as never });
    renderBoard({ copies: [...COPIES, moment] });
    const chip = screen.getByText("Big Game").closest("button")!;
    expect(within(chip).getByText("relic")).toBeTruthy();
    expect(within(chip).queryByText("1/1")).toBeNull();
    pick("Big Game", 6);
    pick("Dov", 16);
    pick("Cyn", 7);

    showRoute("legend");
    const legend = screen.getByTestId("tier-legend");
    expect(within(legend).getByText("Big Game is a relic and cannot go on a route where a card can be lost.")).toBeTruthy();
  });

  it("holds the Legendary route behind three fragments", () => {
    renderBoard({ fragments: 1 });
    pick("Dov", 16);
    pick("Cyn", 7);
    pick("Alba", 3);

    showRoute("legendary");
    const legendary = screen.getByTestId("tier-legendary");
    expect(within(legendary).getByText(/Needs 3 map fragments — you hold 1\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Legendary route" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("fragments").textContent).toBe("1/3 map fragment");
  });

  it("sends the insurance and the cleanse target with the launch", async () => {
    const haunted = makeCopy(7, "Gil", "gold", {
      role: "Mid",
      card: { ...makeCard("Gil", "Mid"), mutation: { key: "haunted", date: "2026-08-20", run: 3 } },
    });
    renderBoard({ copies: [...COPIES, haunted] });
    pick("Gil", 3);
    pick("Bex", 2);
    pick("Alba", 3);
    // The policy is offered on a route that can hurt a card; switching to
    // the Exorcism after ticking it must not send it.
    showRoute("raid");
    fireEvent.click(screen.getByRole("checkbox", { name: /Insure this run/ }));
    showRoute("exorcism");

    await click(screen.getByRole("button", { name: "Launch Exorcism" }));

    // An Exorcism cannot hurt a card, so the policy is not sent with it.
    // Squad order is shelf order, not click order (the RPC doesn't care;
    // the field strip does).
    expect(launchExpeditionAction).toHaveBeenCalledWith("exorcism", [1, 2, 7], { insured: false, target: 7, convoy: null });
  });
});

describe("ExpeditionBoard — forks", () => {
  // A 24h raid launched nine hours ago: fork 1 (8h) is open until 16h.
  const atFork = () =>
    makeRun({
      id: 40,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("puts the open fork at the top with its story and every option's odds", () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-40-0");
    expect(within(fork).getByText("The reactor")).toBeTruthy();
    expect(within(fork).getByText("Deep Raid · fork 1 of 2")).toBeTruthy();
    const push = within(fork).getByRole("button", { name: "Go into the reactor — push" }) as HTMLButtonElement;
    expect(push.disabled).toBe(false);
    expect(push.textContent).toContain("15% a card is wounded");
    expect(push.textContent).toContain("20% to bring home irradiated");
    // No signed card in Eve/Alba/Bex: the favour is shown, locked, and says why.
    const favour = within(fork).getByRole("button", { name: "Call in a favour — favour" }) as HTMLButtonElement;
    expect(favour.disabled).toBe(true);
    expect(favour.textContent).toContain("Needs a signed card");
    // Silence is named in plain words: no answer, the squad plays it safe.
    expect(fork.textContent).toContain("If you do nothing by");
    expect(fork.textContent).toContain("the squad plays it safe");
  });

  it("lets a squad card speak at the fork", () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-40-0");
    const banter = within(fork).getByTestId("banter");
    // The line is seeded off the run, so it is stable — and it is one of the
    // squad talking, not the narrator: it names a card that went out.
    expect(banter.textContent).toMatch(/Eve|Alba|Bex/);
  });

  it("answers the fork through the action and refreshes", async () => {
    renderBoard({ runs: [atFork()], deployedIds: new Set([5, 1, 2]) });

    await click(screen.getByRole("button", { name: "Go into the reactor — push" }));

    expect(decideForkAction).toHaveBeenCalledWith(40, 0, "push");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows nothing to answer once the fork is decided", () => {
    renderBoard({
      runs: [makeRun({ ...atFork(), choices: [{ index: 0, choice: "camp", at: "" }] })],
      deployedIds: new Set([5, 1, 2]),
    });

    expect(screen.queryByTestId("fork-40-0")).toBeNull();
    expect(screen.queryByRole("region", { name: "Forks waiting on you" })).toBeNull();
  });
});

describe("ExpeditionBoard — the road", () => {
  // Nine hours into a 24h raid with two forks, stamped with the road
  // rulebook: the first fork is open, and it is whichever place run 41's
  // seed drew — the page must show THAT place, not the fixed reactor.
  const onRoad = () =>
    makeRun({
      id: 41,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      rules: 3,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("shows the place this run drew, and the role calls its squad can make", () => {
    renderBoard({ runs: [onRoad()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-41-0");
    const place = forksFor("raid", { runId: 41, rules: 3, forks: 2 })[0];
    expect(within(fork).getByText(place.title)).toBeTruthy();
    expect(within(fork).getByRole("button", { name: `${place.pushLabel} — push` })).toBeTruthy();
    // Eve is the Bot, Alba the Mid, Bex the Top: three calls are buttons.
    expect(within(fork).getByRole("button", { name: "Kite it — kite" })).toBeTruthy();
    expect(within(fork).getByRole("button", { name: "Roam for it — roam" })).toBeTruthy();
    expect(within(fork).getByRole("button", { name: "Hold the checkpoint — hold" })).toBeTruthy();
    // No Jungle, no Support: those two are a line, not grey buttons.
    expect(within(fork).queryByRole("button", { name: /Scout it first/ })).toBeNull();
    expect(within(fork).getByTestId("role-calls-missing").textContent).toMatch(/a Jungle could scout it first/);
    expect(within(fork).getByTestId("role-calls-missing").textContent).toMatch(/a Support could ward the approach/);
    // The prints' options are still listed and locked, as they always were.
    expect((within(fork).getByRole("button", { name: "Call in a favour — favour" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends a role call through the action like any other answer", async () => {
    renderBoard({ runs: [onRoad()], deployedIds: new Set([5, 1, 2]) });

    await click(screen.getByRole("button", { name: "Hold the checkpoint — hold" }));

    expect(decideForkAction).toHaveBeenCalledWith(41, 0, "hold");
  });

  it("titles the checkpoint the squad has reached, and never the one it has not", () => {
    const { container } = renderBoard({ runs: [onRoad()], deployedIds: new Set([5, 1, 2]) });

    const run = screen.getByTestId("run-41");
    const [here, next] = forksFor("raid", { runId: 41, rules: 3, forks: 2 });
    const map = within(run).getByTestId("living-map");
    expect(map.textContent).toContain(here.title);
    // Nobody in Eve, Alba and Bex has walked this far before: the second
    // checkpoint is a `?`, and its name is nowhere on the page at all.
    expect(within(map).getByTestId("map-place-1").getAttribute("data-known")).toBe("false");
    expect(within(map).getByTestId("map-place-1").getAttribute("data-glyph-name")).toBe("unknown");
    expect(container.innerHTML).not.toContain(next.title);
    expect(container.innerHTML.toLowerCase()).not.toContain(next.title.toLowerCase());
    expect(within(run).getByTestId("unseen-41").textContent).toBe("?One checkpoint ahead the squad hasn't seen yet.");
  });

  it("explains the road and the role calls in the rules of the road", () => {
    renderBoard();
    openTab("rules");
    const rules = screen.getByTestId("expedition-rules");
    expect(rules.textContent).toContain("The road is drawn when you launch.");
    for (const call of ["hold", "scout", "roam", "kite", "ward"]) expect(within(rules).getByTestId(`rule-call-${call}`)).toBeTruthy();
    expect(rules.textContent).toContain("A rival squad");
    expect(rules.textContent).toContain("A shrine");
  });
});

describe("ExpeditionBoard — the road ahead", () => {
  // Nine hours into a 24h raid, rules 3: the first checkpoint is open, the
  // second is ahead and nobody in the squad knows it.
  const raid = () =>
    makeRun({
      id: 41,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      rules: 3,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });
  // Five hours into a 72h Legendary with four checkpoints: all four ahead,
  // none known — and every place the second can be is one the squad dreads.
  const legendary = () =>
    makeRun({
      id: 52,
      tier: "legendary",
      squad: [5, 1, 2],
      forks: 4,
      rules: 3,
      startedAt: new Date(Date.now() - 5 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 67 * HOUR).toISOString(),
    });
  const unpaid: RevealReads = { mine: new Set(), partner: new Set() };

  it("draws a dread mark over a place the squad has not seen but has a bad feeling about", () => {
    const { container } = renderBoard({ runs: [legendary()], deployedIds: new Set([5, 1, 2]) });

    const map = within(screen.getByTestId("run-52")).getByTestId("living-map");
    const stops = within(map).getAllByTestId(/^map-place-/);
    expect(stops).toHaveLength(4);
    expect(stops.every((stop) => stop.getAttribute("data-known") === "false")).toBe(true);
    // The second checkpoint is dreaded whichever place it is; the dread is
    // all that is said about it.
    expect(within(map).getByTestId("map-dread-1")).toBeTruthy();
    expect(within(map).getByTestId("map-label-1").textContent).toBe("UnchartedA bad feeling");
    expect(screen.getByTestId("dread-52").textContent).toContain("The squad has a bad feeling about the second stop");
    // No Warden in the squad: nothing about the dark or the tolls.
    expect(screen.queryByTestId("warden-52")).toBeNull();
    for (const fork of forksFor("legendary", { runId: 52, rules: 3, forks: 4 })) expect(container.innerHTML).not.toContain(fork.title);
  });

  it("spends a fragment on the road ahead through the action, then re-reads the page", async () => {
    renderBoard({ runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: unpaid, fragments: 2 });

    const reveal = within(screen.getByTestId("reveal-41")).getByRole("button", { name: "See the road ahead · 1 map fragment" }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(false);
    // "map fragment" is explained where it is spent, in the note under
    // the map.
    expect(within(screen.getByTestId("reveal-note-41")).getByRole("button", { name: "map fragment" })).toBeTruthy();
    expect(screen.getByTestId("reveal-note-41").textContent).toContain("You hold 2");

    await click(reveal);

    expect(revealRoadAction).toHaveBeenCalledWith(41);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("reveal-error-41")).toBeNull();
  });

  it("shows a refused reveal under the button, and spends nothing more", async () => {
    revealRoadAction.mockResolvedValue({ ok: false, error: "This road is already revealed." });
    renderBoard({ runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: unpaid, fragments: 1 });

    await click(within(screen.getByTestId("reveal-41")).getByRole("button", { name: /See the road ahead/ }));

    expect(screen.getByTestId("reveal-error-41").textContent).toBe("This road is already revealed.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says why the road can't be revealed, in words beside the button", () => {
    renderBoard({ runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: unpaid, fragments: 0 });
    let reveal = within(screen.getByTestId("reveal-41")).getByRole("button", { name: /See the road ahead/ }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    const reason = document.getElementById(reveal.getAttribute("aria-describedby")!)!;
    expect(reason.hasAttribute("data-reason")).toBe(true);
    expect(reason.textContent).toBe("Takes 1 map fragment — you have none to spend.");
    cleanup();

    // Paid for: every checkpoint is on the map, and the button says so.
    renderBoard({ runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: { mine: new Set([41]), partner: new Set() }, fragments: 3 });
    reveal = within(screen.getByTestId("reveal-41")).getByRole("button", { name: /See the road ahead/ }) as HTMLButtonElement;
    expect(reveal.disabled).toBe(true);
    expect(document.getElementById(reveal.getAttribute("aria-describedby")!)!.textContent).toMatch(/^You revealed this road/);
    const next = forksFor("raid", { runId: 41, rules: 3, forks: 2 })[1];
    expect(within(screen.getByTestId("run-41")).getByTestId("living-map").textContent).toContain(next.title);
    expect(screen.queryByTestId("unseen-41")).toBeNull();
  });

  it("offers no reveal when the squad already knows the road, or the reveals could not be read", () => {
    // A Trailworn Eve knows the next checkpoint: nothing ahead is unknown.
    const trailworn = COPIES.map((copy) => (copy.id === 5 ? { ...copy, card: { ...copy.card, trail: { miles: 9, runs: 4, deepest: "raid" } } } : copy)) as InventoryRow[];
    renderBoard({ copies: trailworn, runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: unpaid, fragments: 3 });
    expect(screen.queryByTestId("reveal-41")).toBeNull();
    cleanup();

    renderBoard({ runs: [raid()], deployedIds: new Set([5, 1, 2]), reveals: null, fragments: 3 });
    expect(screen.queryByTestId("reveal-41")).toBeNull();
    // The fog does not lift because the button is gone.
    expect(screen.getByTestId("unseen-41")).toBeTruthy();
  });

  it("says the squad is reaching the fork when the clock is ahead of the view", () => {
    // Derived two hours ago, before the first checkpoint opened: the view
    // has no open fork, but the browser's clock says there is one.
    const run = raid();
    const stale = buildRunViews({ runs: [run], copies: COPIES, now: new Date(Date.now() - 2 * HOUR), reveals: null });
    expect(stale[41].openFork).toBeNull();
    renderBoard({ runs: [run], deployedIds: new Set([5, 1, 2]), views: stale });

    const waiting = screen.getByTestId("fork-reaching-41");
    expect(waiting.textContent).toContain("The squad is reaching the fork");
    expect(waiting.textContent).toContain("the squad plays it safe");
    expect(screen.queryByTestId("fork-41-0")).toBeNull();
    expect(within(waiting).queryAllByRole("button").filter((button) => button.classList.contains("btn-coral"))).toHaveLength(0);
  });

  describe("re-reading the page when the road moves on", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const viewsDueIn = (ms: number) => {
      const run = raid();
      const views = buildRunViews({ runs: [run], copies: COPIES, now: new Date(), reveals: null });
      return { run, views: { 41: { ...views[41], nextAt: new Date(Date.parse(views[41].asOf) + ms).toISOString() } } };
    };

    it("refreshes a moment after the soonest view's nextAt", () => {
      const { run, views } = viewsDueIn(5_000);
      renderBoard({ runs: [run], deployedIds: new Set([5, 1, 2]), views });
      act(() => {
        vi.advanceTimersByTime(4_500);
      });
      expect(refresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("never overflows the timer on a view due weeks away, and stops when the board goes", () => {
      const { run, views } = viewsDueIn(60 * 24 * HOUR);
      const { unmount } = renderBoard({ runs: [run], deployedIds: new Set([5, 1, 2]), views });
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(refresh).not.toHaveBeenCalled();
      unmount();
      const soon = viewsDueIn(1_000);
      const again = renderBoard({ runs: [soon.run], deployedIds: new Set([5, 1, 2]), views: soon.views });
      again.unmount();
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});

describe("ExpeditionBoard — missing cards", () => {
  const hold: LostHold = { holdId: 70, cardId: 4, expiresAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString(), lostOn: 30, season: "S5" };

  it("lists a lost card with its ransom priced off its shine, and ransoms on the second tap", async () => {
    ransomLostCardAction.mockResolvedValue({ ok: true, balance: 900, paid: 940 });
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });

    const row = screen.getByTestId("hold-70");
    expect(within(row).getAllByText("Dov").length).toBeGreaterThan(0);
    // 300 + 40 x 16 shine.
    const ransom = within(row).getByRole("button", { name: "Ransom for 940" });
    fireEvent.click(ransom);
    expect(ransomLostCardAction).not.toHaveBeenCalled();
    await click(within(row).getByRole("button", { name: "Confirm — pay 940 to ransom Dov" }));
    expect(ransomLostCardAction).toHaveBeenCalledWith(70);
    expect(screen.getByTestId("expedition-notice").textContent).toContain("Dov is home, wounded, for $940");
  });

  it("locks the lost card in the picker and calls it lost, not away", () => {
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });

    const dov = screen.getByRole("button", { name: "Dov — 16 shine" }) as HTMLButtonElement;
    expect(dov.disabled).toBe(true);
    expect(dov.title).toBe("Lost.");
  });

  it("opens the Rescue with the hold as its target", async () => {
    renderBoard({ holds: [hold], deployedIds: new Set([5, 4]) });
    pick("Alba", 3);
    pick("Bex", 2);
    pick("Cyn", 7);
    showRoute("rescue");

    await click(screen.getByRole("button", { name: "Launch Rescue" }));

    expect(launchExpeditionAction).toHaveBeenCalledWith("rescue", [1, 2, 3], { insured: false, target: 70, convoy: null });
  });

  it("says a Rescue has nobody to go after when nothing is lost", () => {
    renderBoard();
    pickTwelveShineSquad();

    showRoute("rescue");
    expect(within(screen.getByTestId("tier-rescue")).getByText(/Nothing is lost/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Launch Rescue" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ExpeditionBoard — the Mythic route", () => {
  it("prints the route past the rift with its own gates, and explains it in the rules", () => {
    renderBoard({ legendMark: false });
    showRoute("mythic");
    const card = screen.getByTestId("tier-mythic");
    expect(card.textContent).toContain("Mythic route");
    expect(card.textContent).toContain("a Voidtouched card");
    expect(card.textContent).toContain("a Legend mark");
    expect(card.textContent).toContain("3 map fragments");
    openTab("rules");
    const rule = screen.getByTestId("rule-mythic");
    expect(rule.textContent).toContain("Momentum");
    expect(rule.textContent).toContain("Voidborn");
  });
});

describe("ExpeditionBoard — campaigns", () => {
  const open: CampaignState = {
    id: 7, key: "broken_map", stage: 1, runs: [40], road: ["waterworks", "pits"],
    log: [{ tier: "scout", grade: "poor", pushes: 0, survivors: 3, places: [], claimedAt: "2026-09-09T00:00:00Z" }],
    startedAt: "2026-09-08T00:00:00Z", finishedAt: null, abandoned: false, relic: null,
  };

  it("follows the open campaign and marks the route its next stage walks", () => {
    renderBoard({ campaign: open });
    openTab("campaigns");
    expect(screen.getByTestId("campaigns").textContent).toContain("The Broken Map");
    expect(screen.getByTestId("campaign-stage").textContent).toContain("Stage 2 of 3");
    // The road the stage walks, named on the server as the page names it.
    expect(screen.getByTestId("campaign-story").textContent).toContain("The road ahead: The flooded works → The dog pits.");
    showRoute("raid");
    expect(screen.getByTestId("tier-raid-campaign").textContent).toContain("Stage 2 of The Broken Map");
    expect(screen.queryByTestId("tier-scout-campaign")).toBeNull();
    expect(screen.queryByTestId("tier-legend-campaign")).toBeNull();
  });

  it("offers both campaigns when none is open, and opens one through the action", async () => {
    startCampaignAction.mockResolvedValue({ ok: true });
    renderBoard();
    openTab("campaigns");
    expect(screen.getByTestId("campaign-broken_map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Begin The Lost Print/ }));
    await waitFor(() => expect(startCampaignAction).toHaveBeenCalledWith("lost_print", "S_TEST"));
    openTab("rules");
    expect(screen.getByTestId("rule-campaigns").textContent).toContain("campaign relic");
  });
});

describe("ExpeditionBoard — season standings", () => {
  const standing = (over: Partial<StandingRow> & { discordId: string }): StandingRow => ({
    username: over.discordId, avatarUrl: null, runs: 1, miles: 0, loot: 0, survivals: 0, rivalsBeaten: 0, ...over,
  });

  it("ranks the season, picks the viewer out, and wears the marks once the season has closed", () => {
    const rows = [
      standing({ discordId: "bo", username: "Bo", miles: 6, loot: 1200 }),
      standing({ discordId: "ann", username: "Ann", miles: 9, loot: 300, survivals: 1, rivalsBeaten: 2 }),
      ...Array.from({ length: 8 }, (_, index) => standing({ discordId: `mid-${index}`, username: `Mid ${index}`, miles: 3 })),
      standing({ discordId: "me", username: "Me", miles: 1 }),
    ];
    const accolades: Accolade[] = [
      { kind: "pathfinder", discordId: "ann", username: "Ann", value: 9, awardedAt: "2026-09-09T00:00:00Z" },
      { kind: "plunderer", discordId: "bo", username: "Bo", value: 1200, awardedAt: "2026-09-09T00:00:00Z" },
    ];
    renderBoard({ standings: rows, accolades, viewerId: "me" });
    openTab("standings");
    const table = screen.getByTestId("standings");
    const ids = [...table.querySelectorAll("tbody tr")].map((row) => row.getAttribute("data-testid"));
    // Eight rows and the viewer's own, out past them.
    expect(ids).toHaveLength(9);
    expect(ids[0]).toBe("standing-ann");
    expect(ids[1]).toBe("standing-bo");
    expect(ids[8]).toBe("standing-me");
    expect(within(table).getByTestId("standing-me").textContent).toMatch(/^11/);
    expect(within(table).getByTestId("standing-ann").textContent).toContain("⟟");
    expect(within(table).getByTestId("standing-bo").textContent).toContain("◈");
    expect(within(table).getByTestId("accolade-pathfinder").textContent).toContain("Ann");
    openTab("rules");
    const rule = screen.getByTestId("rule-standings");
    expect(within(rule).getByTestId("rule-mark-survivor").textContent).toContain("Legendary routes brought home whole");
  });

  it("says nothing until somebody has claimed a run", () => {
    renderBoard();
    expect(screen.queryByTestId("standings")).toBeNull();
  });
});

describe("ExpeditionBoard — the weather", () => {
  it("posts this week's sky with the brief, marks a run by the weather it launched under, and explains the five", () => {
    renderBoard({ weather: "fog", runs: [makeRun({ id: 7, weather: "drought" }), makeRun({ id: 8, tier: "scout", weather: "clear" })] });
    const banner = screen.getByTestId("expedition-weather");
    expect(banner.textContent).toContain("Fog");
    expect(banner.textContent).toContain("Every fork is dark");
    expect(banner.textContent).toContain("A run keeps the weather it launched under");
    expect(screen.getByTestId("weather-7").textContent).toContain("under drought");
    expect(screen.queryByTestId("weather-8")).toBeNull();
    openTab("rules");
    const rule = screen.getByTestId("rule-weather");
    for (const key of ["clear", "fog", "drought", "harvest", "watch"]) expect(within(rule).getByTestId(`rule-weather-${key}`)).toBeTruthy();
    expect(within(rule).getByTestId("rule-weather-watch").textContent).toContain("playoff week");
  });

  it("says nothing about the sky on a board without one", () => {
    renderBoard();
    expect(screen.queryByTestId("expedition-weather")).toBeNull();
  });
});

describe("ExpeditionBoard — rivalries", () => {
  it("keeps the season's score against each collector raced", () => {
    renderBoard({
      rivalries: [
        { who: "doug", name: "Doug", beaten: 2, beatenBy: 1, last: "2026-09-03T00:00:00Z" },
        { who: "ann", name: "Ann", beaten: 0, beatenBy: 1, last: "2026-09-02T00:00:00Z" },
        { who: "bo", name: "Bo", beaten: 1, beatenBy: 1, last: "2026-09-01T00:00:00Z" },
      ],
    });
    openTab("standings");
    const strip = screen.getByTestId("rivalries");
    expect(within(strip).getByTestId("rivalry-doug").textContent).toContain("Doug2–1yours ahead");
    expect(within(strip).getByTestId("rivalry-ann").textContent).toContain("Ann0–1theirs ahead");
    expect(within(strip).getByTestId("rivalry-bo").textContent).toContain("Bo1–1level");
  });

  it("says nothing about rivalries until there is one, and explains company in the rules", () => {
    renderBoard();
    expect(screen.queryByTestId("rivalries")).toBeNull();
    openTab("rules");
    const rule = screen.getByTestId("rule-company");
    expect(rule.textContent).toContain("more shine");
    expect(rule.textContent).toContain("The dead walk");
    expect(rule.textContent).toContain("2×");
  });
});

describe("ExpeditionBoard — the graveyard and a changed squad", () => {
  it("keeps the fallen on the page", () => {
    const grave: Grave = {
      id: 1, inventoryId: 99, slug: "hal", playerName: "Hal", tier: "diamond", foil: true, foilType: "ice", signed: false,
      card: makeCard("Hal", "Mid"), runId: 50, cause: "route", diedAt: "2026-08-20T12:00:00.000Z",
    };
    renderBoard({ graves: [grave] });

    openTab("graveyard");
    const stone = screen.getByTestId("grave-1");
    expect(within(stone).getByText("Hal")).toBeTruthy();
    expect(stone.textContent).toContain("Fell on the Legendary route");
    // A card that never walked a road has no miles line on its stone.
    expect(within(stone).queryByTestId("grave-miles-1")).toBeNull();
  });

  it("carves the miles a fallen card walked into its stone", () => {
    const grave: Grave = {
      id: 2, inventoryId: 98, slug: "ivy", playerName: "Ivy", tier: "gold", foil: false, foilType: null, signed: false,
      card: { ...makeCard("Ivy", "Jungle"), trail: { miles: 17, runs: 7, deepest: "legend" } }, runId: 51, cause: "route", diedAt: "2026-08-21T12:00:00.000Z",
    };
    renderBoard({ graves: [grave] });

    openTab("graveyard");
    expect(screen.getByTestId("grave-miles-2").textContent).toBe("17 miles walked · Veteran");
  });

  it("shows every card that came home changed, drawn with what it now wears", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 390, comp: false, mark: null, briefHit: false },
      route: {
        ...QUIET_ROUTE([5, 1, 2]),
        lootMultiplier: 1.5,
        pushes: 2,
        fates: [
          { id: 5, fate: "home", mutation: "irradiated", woundedUntil: null },
          { id: 1, fate: "wounded", mutation: null, woundedUntil: "2026-08-30T16:00:00.000Z" },
          { id: 2, fate: "home", mutation: null, woundedUntil: null },
        ],
        events: [{ fork: 0, tone: "good", text: "The reactor: Eve came out of it irradiated." }],
      },
      baseDollars: 260,
      bearerId: null,
      balance: 5000,
      fragments: 0,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
    });
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(ceremony.textContent).toContain("$260 × 1.5 from the forks");
    expect(within(ceremony).getByText("Eve — Irradiated")).toBeTruthy();
    expect(within(ceremony).getByText("Alba — Wounded")).toBeTruthy();
    expect(within(screen.getByTestId("fate-5")).getByTestId("mutation").querySelector(".card-mut-irradiated")).toBeTruthy();
    expect(screen.queryByTestId("fate-2")).toBeNull();
    expect(within(ceremony).getByTestId("ceremony-events").textContent).toContain("Eve came out of it irradiated");
  });
});

describe("ExpeditionBoard — match day", () => {
  it("names who plays tonight and chips the cards that would surge", () => {
    const copies = [
      makeCopy(1, "Alba", "gold", { card: { ...makeCard("Alba", "Mid"), teamName: "Solari Sun" } }),
      makeCopy(2, "Bex", "silver", { card: { ...makeCard("Bex", "Top"), teamName: "Old Guard" } }),
    ];
    renderBoard({ copies, playingToday: ["Solari Sun", "Lunar Tide"] });

    const banner = screen.getByTestId("match-day");
    expect(banner.textContent).toContain("Solari Sun, Lunar Tide play tonight");
    expect(banner.textContent).toContain("+20%");
    expect(screen.getByTestId("plays-1")).toBeTruthy();
    expect(screen.queryByTestId("plays-2")).toBeNull();
  });

  it("says nothing about match day on a quiet night", () => {
    renderBoard();
    expect(screen.queryByTestId("match-day")).toBeNull();
  });

  it("tells the ceremony the surge paid, and the log that a moment echoed", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 216, comp: false, mark: null, briefHit: false },
      route: QUIET_ROUTE([5, 1, 2]),
      baseDollars: 180,
      merchant: 0,
      stranded: null,
      surge: ["Solari Sun"],
      echo: { inventoryId: 900, slug: "sun-top", playerName: "Sun Top", moment: 2 },
      bearerId: null,
      balance: 5000,
      fragments: 0,
    });
    renderBoard({
      runs: [
        makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() }),
        makeRun({
          id: 22,
          squad: [1, 2, 3],
          claimedAt: "2026-08-28T00:00:00.000Z",
          outcome: {
            grade: "solid", dollars: 216, comp: false, mark: null, bearer: null, lootMultiplier: 1, pushes: 0, fragments: 0,
            fates: [], events: [], rescued: null, cleansed: null, surge: ["Solari Sun"], echo: { slug: "sun-top", week: "2026-08-17", moment: 2 },
          },
        }),
      ],
      deployedIds: new Set([5, 1, 2]),
    });

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const ceremony = screen.getByTestId("expedition-ceremony");
    expect(within(ceremony).getByTestId("ceremony-surge").textContent).toContain("Solari Sun played on launch day");
    expect(within(ceremony).getByTestId("ceremony-echo").textContent).toContain("Sun Top");
    const log = screen.getByRole("region", { name: "Finished expeditions" });
    expect(log.textContent).toContain("match day ×1.2");
    expect(log.textContent).toContain("a moment echoed");
  });
});

describe("ExpeditionBoard — the rival fork", () => {
  // A 72h Legendary launched 30 hours ago with four forks: legs of 14.4h,
  // so fork 2 (the singing dark) opened at 28.8h and is open now.
  const legendary = () =>
    makeRun({
      id: 50,
      tier: "legendary",
      squad: [5, 1, 2],
      forks: 4,
      startedAt: new Date(Date.now() - 30 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 42 * HOUR).toISOString(),
    });

  it("names the squad's real next opponent at the singing dark when the page knows it", () => {
    renderBoard({ runs: [legendary()], deployedIds: new Set([5, 1, 2]), rivals: { 50: "Lunar Tide" } });

    const fork = screen.getByTestId("fork-50-1");
    expect(within(fork).getByTestId("rival-story").textContent).toContain("it is Lunar Tide's");
    expect(within(fork).getByText("The singing dark")).toBeTruthy();
  });

  it("keeps the written story when the squad is mixed or nothing is scheduled", () => {
    renderBoard({ runs: [legendary()], deployedIds: new Set([5, 1, 2]) });

    const fork = screen.getByTestId("fork-50-1");
    expect(within(fork).queryByTestId("rival-story")).toBeNull();
    expect(fork.textContent).toContain("Something is singing under the floor and the squad wants to leave.");
  });
});

describe("ExpeditionBoard — convoys", () => {
  const atFork = () =>
    makeRun({
      id: 50,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      convoy: 5,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("sends the convoy choice with the launch, tidied", async () => {
    renderBoard();
    pickTwelveShineSquad();
    showRoute("raid");
    fireEvent.change(screen.getByTestId("convoy-mode"), { target: { value: "join" } });
    fireEvent.change(screen.getByLabelText("Convoy code"), { target: { value: " abc234 " } });

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));

    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3], { insured: false, target: null, convoy: "ABC234" });
  });

  it("shows the code on a run waiting for a partner, and the partner once they joined", () => {
    renderBoard({
      runs: [atFork(), makeRun({ id: 51, tier: "legend", squad: [3, 4, 1], convoy: 6 })],
      deployedIds: new Set([5, 1, 2, 3, 4]),
      convoys: {
        50: { code: "ABC234", host: true, partner: null },
        51: { code: "ZZZ999", host: false, partner: { discordId: "77", username: "Rio", runId: 60, choices: [] } },
      },
    });

    expect(screen.getByTestId("convoy-50").textContent).toContain("ABC234");
    expect(screen.getByTestId("convoy-51").textContent).toContain("Convoy with Rio");
  });

  it("tells the fork what the partner said and what that means", () => {
    renderBoard({
      runs: [atFork()],
      deployedIds: new Set([5, 1, 2]),
      convoys: { 50: { code: "ABC234", host: true, partner: { discordId: "77", username: "Rio", runId: 60, choices: [{ index: 0, choice: "camp", at: "" }] } } },
    });

    const line = within(screen.getByTestId("fork-50-0")).getByTestId("convoy-fork");
    expect(line.textContent).toContain("Rio says camp");
    expect(line.textContent).toContain("camps here whatever you say");
  });
});

// ── §10.4 of the design: the board, as three collectors first see it ─────
//
// The screenshots (e2e/expedition-board.spec.ts) are where a person judges
// the page; these hold the parts of the checklist a DOM can prove, on the
// same three fixture collectors the staff preview shows.

function renderPersona(persona: Persona) {
  return render(<ExpeditionBoard {...boardFixture(persona, new Date())} />);
}

/** The zones a phone shows before any scrolling: the guide or Right now,
 *  the heads of the steps, the route row and the This-week line. */
function aboveTheFold(): Element[] {
  const zones: (Element | null)[] = [
    screen.queryByTestId("guide"),
    screen.queryByTestId("right-now"),
    screen.getByTestId("step-squad").querySelector("h2"),
    screen.getByTestId("squad-shine"),
    screen.getByTestId("step-route").querySelector("h2"),
    screen.getByTestId("expedition-brief"),
  ];
  return zones.filter((node): node is Element => node !== null);
}

/** Visible text nodes in `root`, outside controls and outside Terms. A
 *  control's label is a verb ("Go for it", "Send a rescue"); the words it
 *  acts on are explained by the Terms around it. */
function looseText(root: Element): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim()) continue;
    if (parent.closest("[data-term], [data-edge-title], [hidden], button, summary, select, a")) continue;
    // The place's story and a squadmate's banter are the road talking:
    // "they camp by the river" is English there, not the camp choice.
    if (parent.closest("[data-story]")) continue;
    found.push(node.textContent);
  }
  return found;
}

/** What a disabled control says about why, in text a reader can see. */
function visibleReason(control: Element): string {
  const inside = control.querySelector("[data-reason]")?.textContent?.trim();
  if (inside) return inside;
  return (control.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => (id ? document.getElementById(id) : null))
    .filter((node): node is HTMLElement => node !== null && node.hasAttribute("data-reason") && !node.closest("[hidden]"))
    .map((node) => node.textContent?.trim() ?? "")
    .join(" ")
    .trim();
}

describe("ExpeditionBoard — the page experience (§10.4) on the three personas", () => {
  for (const persona of PERSONAS) {
    it(`${persona}: shows exactly one primary button before the stepper — the one next thing to do`, () => {
      renderPersona(persona);
      const stepper = screen.getByTestId("stepper");
      const primary = [...screen.getByTestId("expedition-board").querySelectorAll(".btn-coral")].filter(
        (button) => button.compareDocumentPosition(stepper) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(primary).toHaveLength(1);
    });

    it(`${persona}: puts every game word above the fold inside a Term`, () => {
      renderPersona(persona);
      const unexplained = aboveTheFold()
        .flatMap(looseText)
        .flatMap((text) => glossaryHits(text).map((key) => `"${GLOSSARY[key].label}" in "${text.trim()}"`));
      expect(unexplained).toEqual([]);
    });

    it(`${persona}: says why every disabled control is disabled, in visible text`, () => {
      renderPersona(persona);
      const disabled = [...screen.getByTestId("expedition-board").querySelectorAll("button:disabled, input:disabled, select:disabled")];
      const silent = disabled.filter((control) => visibleReason(control) === "").map((control) => control.getAttribute("aria-label") ?? control.textContent);
      expect(silent).toEqual([]);
    });
  }

  it("says nothing needs you, and what is next, when nothing does — with no primary button to find", () => {
    const now = new Date();
    renderBoard({
      runs: [makeRun({ id: 60, tier: "scout", forks: 1, startedAt: new Date(now.getTime() - HOUR).toISOString(), resolvesAt: new Date(now.getTime() + 7 * HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });
    const none = screen.getByTestId("now-none");
    expect(none.textContent).toContain("Nothing needs you.");
    expect(none.textContent).toContain("reaches a");
    expect(within(screen.getByTestId("right-now")).queryAllByRole("button").filter((button) => button.classList.contains("btn-coral"))).toHaveLength(0);
  });

  it("new: picks, chooses a run and launches from what is on screen, never opening the rules", async () => {
    renderPersona("new");
    await click(screen.getByRole("button", { name: "Suggest a squad and a run" }));
    expect(screen.getByTestId("squad-shine").textContent).toContain("3 picked");
    const launch = screen.getByRole("button", { name: "Launch Scouting Run" }) as HTMLButtonElement;
    expect(launch.disabled).toBe(false);
    expect(launch.classList.contains("btn-coral")).toBe(true);
    await click(launch);
    expect(launchExpeditionAction).toHaveBeenCalledWith("scout", expect.any(Array), { insured: false, target: null, convoy: null });
    expect(screen.queryByTestId("expedition-rules")).toBeNull();
  });

  it("mid: answers the fork with one of the two big choices, never opening the rules", async () => {
    renderPersona("mid");
    const fork = screen.getByTestId("fork-301-0");
    const go = within(fork)
      .getAllByRole("button")
      .find((button) => button.classList.contains("btn-coral"))!;
    await click(go);
    expect(decideForkAction).toHaveBeenCalledWith(301, 0, expect.stringMatching(/^(push|favour|light)$/));
    expect(within(fork).getByText(/If you do nothing by/)).toBeTruthy();
    expect(screen.queryByTestId("expedition-rules")).toBeNull();
  });

  it("veteran: brings the squad home from the top of the page, never opening the rules", async () => {
    renderPersona("veteran");
    await click(screen.getByRole("button", { name: "Claim the Legend Hunt" }));
    expect(claimExpeditionAction).toHaveBeenCalledWith(501);
    expect(screen.queryByTestId("expedition-rules")).toBeNull();
  });

  it("explains a word in place, and its 'More in the rules' opens the Rules tab", async () => {
    renderPersona("new");
    const term = within(screen.getByTestId("guide")).getByRole("button", { name: "fork" });
    expect(term.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(term);
    expect(term.getAttribute("aria-expanded")).toBe("true");
    const note = document.getElementById(term.getAttribute("aria-controls")!)!;
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain(GLOSSARY.fork.says);
    await click(within(note).getByRole("link", { name: /More in the rules/ }));
    expect(screen.getByTestId("tab-rules").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("expedition-rules")).toBeTruthy();
  });

  it("cycles Suggest to a squad of three different edge kinds on the second press", () => {
    renderPersona("veteran");
    fireEvent.click(screen.getByTestId("suggest-squad"));
    const first = screen.getByTestId("squad-shine").textContent;
    fireEvent.click(screen.getByTestId("suggest-squad"));
    const second = screen.getByTestId("squad-shine").textContent;
    expect(second).toContain("3 picked");
    expect(second).toContain("all three count");
    expect(second).not.toBe(first);
  });

  it("mid: opens the route card on a route this collector could run, not one already out", () => {
    // Both the Scouting Run and the Deep Raid are in the field; the card
    // under the row opens on the first route nothing but the squad shuts.
    renderPersona("mid");
    expect(screen.getByTestId("route-pill-scout").textContent).toContain("out now");
    expect(screen.queryByTestId("tier-scout")).toBeNull();
    expect(screen.getByTestId("tier-legend")).toBeTruthy();
    expect(screen.getByTestId("route-pill-legend").getAttribute("aria-pressed")).toBe("true");
  });

  it("hides the first-visit guide once dismissed, and remembers it", () => {
    const { unmount } = renderPersona("new");
    fireEvent.click(screen.getByRole("button", { name: "Got it, hide this" }));
    expect(screen.queryByTestId("guide")).toBeNull();
    unmount();
    renderPersona("new");
    expect(screen.queryByTestId("guide")).toBeNull();
  });
});

describe("ExpeditionBoard — edges on the board", () => {
  const titled = (copy: InventoryRow, archetype: string): InventoryRow => ({ ...copy, card: { ...copy.card, archetype } });
  // Eve, Alba, Bex carrying edges that act at a fork, on a run stamped
  // with the edge rulebook and standing at its first fork.
  const edged = [titled(COPIES[0], "Unkillable"), titled(COPIES[1], "Farm Demon"), COPIES[2], COPIES[3], titled(COPIES[4], "Playmaker")];
  const atEdgedFork = () =>
    makeRun({
      id: 70,
      tier: "raid",
      squad: [5, 1, 2],
      forks: 2,
      rules: 6,
      startedAt: new Date(Date.now() - 9 * HOUR).toISOString(),
      resolvesAt: new Date(Date.now() + 15 * HOUR).toISOString(),
    });

  it("prints each edge that changes a choice on its own line, under that choice", () => {
    const run = atEdgedFork();
    renderBoard({ copies: edged, runs: [run], deployedIds: new Set([5, 1, 2]) });
    const options = forkOptions("raid", 0, [edged[4], edged[0], edged[1]], [], roadOf(run));
    const withEdges = options.filter((option) => option.edges && option.edges.length > 0 && option.locked === null);
    expect(withEdges.length).toBeGreaterThan(0);
    const fork = screen.getByTestId("fork-70-0");
    for (const option of withEdges) {
      const lines = within(fork).getByTestId(`fork-edges-${option.choice}`);
      for (const edge of option.edges!) expect(lines.textContent).toContain(edge.line);
      const button = within(fork).getByRole("button", { name: `${option.label} — ${option.choice}` });
      // The button keeps what the choice does; the edges are the line under it.
      expect(button.textContent).toContain(option.baseTease!);
      for (const edge of option.edges!) expect(button.textContent).not.toContain(edge.line);
    }
  });

  it("says nothing about edges on a run stamped before them", () => {
    renderBoard({ copies: edged, runs: [{ ...atEdgedFork(), rules: 5 }], deployedIds: new Set([5, 1, 2]) });
    expect(within(screen.getByTestId("fork-70-0")).queryByTestId(/^fork-edges-/)).toBeNull();
  });

  it("lists the edges that fired in the ceremony, each title once", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 210, comp: false, mark: null, briefHit: false },
      route: {
        ...QUIET_ROUTE([5, 1, 2]),
        events: [
          { fork: 0, tone: "good", text: "Farm Demon: the camp paid a little more.", ability: "Farm Demon" },
          { fork: 1, tone: "good", text: "Farm Demon: and again.", ability: "Farm Demon" },
          { fork: 1, tone: "good", text: "The wound meant for Alba never landed.", ability: "Unkillable" },
          { fork: null, tone: "neutral", text: "The squad came home." },
        ],
      },
      baseDollars: 180,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
      bearerId: null,
      balance: 5000,
      fragments: 0,
    });
    renderBoard({
      copies: edged,
      runs: [makeRun({ id: 21, rules: 6, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });

    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));

    const edges = screen.getByTestId("ceremony-edges");
    expect(within(edges).getAllByRole("listitem")).toHaveLength(2);
    expect(within(edges).getByTestId("ceremony-edge-Farm Demon").textContent).toContain("2 times");
    expect(within(edges).getByTestId("ceremony-edge-Unkillable").textContent).toContain("never landed");
    // The full event list still has every line, edges included.
    expect(screen.getByTestId("ceremony-events").textContent).toContain("The squad came home.");
  });

  it("has no edges section when none fired", async () => {
    renderBoard({
      runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })],
      deployedIds: new Set([5, 1, 2]),
    });
    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));
    expect(screen.getByTestId("expedition-ceremony")).toBeTruthy();
    expect(screen.queryByTestId("ceremony-edges")).toBeNull();
  });
});

// ── The base camp (Phase 3) and the league goal (Phase 4) on the board ────

const camp = (over: Partial<CampState> = {}): CampState => ({ ...EMPTY_CAMP, ...over });

describe("ExpeditionBoard — the base camp", () => {
  it("has a Camp tab only when there is a camp to show", () => {
    renderBoard();
    expect(screen.queryByTestId("tab-camp")).toBeNull();
    cleanup();

    renderBoard({ camp: camp(), balance: 2000, fragments: 2 });
    openTab("camp");
    expect(screen.getByTestId("tab-camp").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("camp-wallet").textContent).toContain("$2,000");
    expect(screen.getByTestId("camp-wallet").textContent).toContain("2 map fragments");
  });

  it("builds through the action and refreshes; a refusal is printed in the panel", async () => {
    renderBoard({ camp: camp({ tent: 1 }), balance: 5000, fragments: 2 });
    openTab("camp");
    await click(screen.getByTestId("camp-buy-tent"));
    expect(upgradeCampAction).toHaveBeenCalledWith("tent", 2);
    expect(refresh).toHaveBeenCalledTimes(1);

    upgradeCampAction.mockResolvedValue({ ok: false, error: "You can't cover that price." });
    await click(screen.getByTestId("camp-buy-slot"));
    expect(upgradeCampAction).toHaveBeenLastCalledWith("slot", 1);
    expect(screen.getByTestId("camp-error").textContent).toBe("You can't cover that price.");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("forges through the action with the count the player saw", async () => {
    renderBoard({ camp: camp({ forge: 1, forgedPolicies: 1 }), balance: 0, fragments: 2, forgedThisWeek: 0 });
    openTab("camp");
    await click(screen.getByTestId("camp-buy-policy"));
    expect(forgePolicyAction).toHaveBeenCalledWith(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("hangs the shelf's relics and only the viewer's own marks on the wall", () => {
    const relic = makeCopy(8, "Vesper", "diamond", {
      card: { ...makeCard("Vesper", "Mid"), campaign: { key: "lost_print", date: "2026-08-20", campaign: 3, runs: [1, 2, 3], from: 1 } },
    });
    const accolades: Accolade[] = [
      { kind: "pathfinder", discordId: "me", username: "Me", value: 40, awardedAt: "2026-08-20T00:00:00.000Z" },
      { kind: "plunderer", discordId: "them", username: "Them", value: 9000, awardedAt: "2026-08-20T00:00:00.000Z" },
    ];
    renderBoard({ camp: camp({ wall: 1 }), copies: [...COPIES, relic], accolades, viewerId: "me" });
    openTab("camp");
    expect(within(screen.getByTestId("camp-wall-relics")).getByText("Vesper")).toBeTruthy();
    const marks = screen.getByTestId("camp-wall-marks");
    expect(within(marks).getAllByRole("listitem")).toHaveLength(1);
    expect(marks.textContent).toContain("Pathfinder");
    // The atlas rows wait for the atlas.
    expect(screen.queryByTestId("camp-wall-landmarks")).toBeNull();
    expect(screen.queryByTestId("camp-wall-roads-empty")).toBeNull();
  });

  it("offers a forged policy beside the insurance on a risky route, never both ticked, and launches with it", async () => {
    renderBoard({ camp: camp({ forge: 1, forgedPolicies: 1 }), forgedThisWeek: 0 });
    pickTwelveShineSquad();
    showRoute("raid");
    const insure = screen.getByRole("checkbox", { name: /Insure this run/ }) as HTMLInputElement;
    const forge = screen.getByRole("checkbox", { name: /Use a forged policy/ }) as HTMLInputElement;
    expect(within(screen.getByTestId("tier-raid")).getByTestId("forged-policy")).toBeTruthy();

    fireEvent.click(insure);
    expect(insure.checked).toBe(true);
    fireEvent.click(forge);
    expect(forge.checked).toBe(true);
    expect(insure.checked).toBe(false);
    fireEvent.click(insure);
    expect(insure.checked).toBe(true);
    expect(forge.checked).toBe(false);
    fireEvent.click(forge);
    expect(screen.getByTestId("step-send").textContent).toContain("insured with a forged policy, no fee");

    await click(screen.getByRole("button", { name: "Launch Deep Raid" }));
    expect(launchExpeditionAction).toHaveBeenCalledWith("raid", [1, 2, 3], { insured: false, target: null, convoy: null, forged: true });
  });

  it("hides the forged policy on a route that can't hurt a card, and says why it can't be used once the week's is spent", () => {
    renderBoard({ camp: camp({ forge: 1, forgedPolicies: 1 }), forgedThisWeek: 1 });
    pickTwelveShineSquad();
    showRoute("scout");
    expect(screen.queryByTestId("forged-policy")).toBeNull();
    showRoute("raid");
    const forge = screen.getByRole("checkbox", { name: /Use a forged policy/ }) as HTMLInputElement;
    expect(forge.disabled).toBe(true);
    expect(screen.getByTestId("forged-policy-reason").textContent).toContain("Monday");
  });

  it("lets a second Scouting Run go while one is out, once the camp has the slot", () => {
    const scoutOut = (id: number) => makeRun({ id, tier: "scout", squad: [9 + id, 8, 7] });

    // No camp: one Scouting Run at a time.
    renderBoard({ runs: [scoutOut(40)] });
    pickTwelveShineSquad();
    showRoute("scout");
    expect(screen.getByTestId("route-pill-scout").textContent).toContain("out now");
    expect(screen.getByTestId("tier-scout-out").textContent).toContain("One Scouting Run at a time");
    expect((screen.getByRole("button", { name: "Launch Scouting Run" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    // The slot: the second squad can go, and the card says why.
    renderBoard({ runs: [scoutOut(40)], camp: camp({ slots: 1 }) });
    pickTwelveShineSquad();
    showRoute("scout");
    expect(screen.getByTestId("route-pill-scout").textContent).not.toContain("out now");
    expect(screen.queryByTestId("tier-scout-out")).toBeNull();
    expect(screen.getByTestId("tier-scout-slot").textContent).toContain("One Scouting Run is out");
    expect((screen.getByRole("button", { name: "Launch Scouting Run" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();

    // Both slots out: shut again, in the camp's words. Other routes keep
    // one at a time whatever the camp.
    renderBoard({ runs: [scoutOut(40), scoutOut(41), makeRun({ id: 42, tier: "raid", squad: [20, 21, 22] })], camp: camp({ slots: 1 }) });
    pickTwelveShineSquad();
    showRoute("scout");
    expect(screen.getByTestId("route-pill-scout").textContent).toContain("out now");
    expect(screen.getByTestId("tier-scout-out").textContent).toContain("2 Scouting Runs at a time");
    showRoute("raid");
    expect(screen.getByTestId("tier-raid-out").textContent).toContain("One Deep Raid at a time");
  });

  it("tells the collector a second scout can follow after the first launches", async () => {
    launchExpeditionAction.mockResolvedValue({ ok: true, runId: 99, resolvesAt: "2026-08-28T00:00:00.000Z", fee: 0, freePolicy: false, convoyCode: null });
    renderBoard({ camp: camp({ slots: 1 }) });
    pickTwelveShineSquad();
    showRoute("scout");
    await click(screen.getByRole("button", { name: "Launch Scouting Run" }));
    expect(screen.getByTestId("expedition-notice").textContent).toContain("second slot is free");
  });
});

describe("ExpeditionBoard — the league goal", () => {
  const league = () => boardFixture("mid", new Date()).league!;

  it("shows nothing of the league goal when there is none", () => {
    renderBoard();
    expect(screen.queryByTestId("league-line")).toBeNull();
    expect(screen.queryByTestId("tab-league")).toBeNull();
  });

  it("puts the goal's progress in the This-week line, and opens the League tab from it", async () => {
    renderBoard({ league: league() });
    const line = within(screen.getByTestId("expedition-brief")).getByTestId("league-line");
    expect(line.textContent).toContain("League goal");
    expect(line.textContent).toContain("by 4 collectors");
    expect(screen.getByTestId("tab-league").getAttribute("aria-selected")).toBe("false");

    await click(line);

    expect(screen.getByTestId("tab-league").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("league-goal")).toBeTruthy();
    expect(screen.getByTestId("league-goal-mine").textContent).toContain("3rd of 4 collectors");
  });
});

describe("ExpeditionBoard — the personas' camp and league", () => {
  it("gives the veteran a Camp and a League tab, the mid-game collector a League tab, the newcomer neither", () => {
    const tabs = () => [...screen.getByTestId("more-tabs").querySelectorAll("[role=tab]")].map((tab) => tab.textContent);
    const { unmount } = renderPersona("veteran");
    expect(tabs()).toEqual(["Log", "Standings", "Campaigns", "Camp", "League", "Atlas", "Graveyard", "Rules"]);
    openTab("camp");
    expect(screen.getByTestId("camp-slot-level").textContent).toContain("level 1 of 1");
    expect(screen.getByTestId("camp-policy-held").textContent).toContain("You hold 1 of 2 forged policies.");
    expect(within(screen.getByTestId("camp-wall-relics")).getByText("Vesper")).toBeTruthy();
    openTab("league");
    expect(screen.getByTestId("league-last-fell").textContent).toContain("Vanguard");
    unmount();

    const mid = renderPersona("mid");
    expect(tabs()).toEqual(["Log", "Standings", "Campaigns", "League", "Atlas", "Graveyard", "Rules"]);
    mid.unmount();

    renderPersona("new");
    expect(tabs()).toEqual(["Log", "Standings", "Campaigns", "Atlas", "Graveyard", "Rules"]);
  });
});

// ── The atlas (Phase 6) on the board ──────────────────────────────────────

describe("ExpeditionBoard — the atlas", () => {
  it("has an Atlas tab only when there is an atlas, after League and before Graveyard", () => {
    const tabs = () => [...screen.getByTestId("more-tabs").querySelectorAll("[role=tab]")].map((tab) => tab.textContent);
    const { unmount } = renderBoard();
    expect(screen.queryByTestId("tab-atlas")).toBeNull();
    unmount();

    renderBoard({ atlas: atlasFor([]) });
    expect(tabs()).toEqual(["Log", "Standings", "Campaigns", "Atlas", "Graveyard", "Rules"]);
    openTab("atlas");
    // Empty, it says what will fill it.
    expect(screen.getByTestId("atlas-empty").textContent).toContain("Bring a squad home");
  });

  it("veteran: the Atlas tab shows the road walked and paid, the one half-way, and the place named after them", () => {
    renderPersona("veteran");
    openTab("atlas");
    expect(screen.getByTestId("atlas-reward-scout").textContent).toContain("you were paid 1 map fragment");
    expect(screen.getByTestId("atlas-seen-legend").textContent).toBe("You have seen 5 of the 9 places on the Legend Hunt.");
    expect(screen.getByTestId("atlas-named").textContent).toContain("The empty village");
    // Ana's plaque is up: her places wear her crest.
    expect(screen.getByTestId("atlas-place-shaft").textContent).toContain("first reached by Ana");
    expect(screen.getByTestId("atlas-place-shaft").textContent).toContain("crest");
    expect(screen.getByTestId("atlas-unseen-landmarks-legend").textContent).toContain("first reached by Ana");
  });

  it("veteran: hangs the place named after them and the road they walked on the trophy wall", () => {
    renderPersona("veteran");
    openTab("camp");
    expect(within(screen.getByTestId("camp-wall-landmarks")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["The empty village"]);
    expect(within(screen.getByTestId("camp-wall-roads")).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Scouting Run"]);
  });

  it("veteran: a run card's known places say who reached them first, the viewer included", () => {
    const { views } = boardFixture("veteran", new Date());
    renderPersona("veteran");
    const card = screen.getByTestId("run-501");
    const named = views[501].road.flatMap((place) => (place.known && place.landmark ? [place] : []));
    expect(named.map((place) => place.key).sort()).toEqual(["shaft", "village"]);
    for (const place of named) {
      const line = within(card).getByTestId(`landmark-501-${place.index}`);
      expect(line.textContent).toContain(place.title);
      expect(line.textContent).toContain(place.key === "village" ? "first reached by you" : "first reached by Ana");
    }
    // And on the map, under each place's name.
    const marked = within(card)
      .getAllByTestId(/^map-label-/)
      .filter((label) => label.textContent?.includes("First here"));
    expect(marked).toHaveLength(2);
  });

  it("mid: the raid's map says Ana reached the place it stands at first", () => {
    renderPersona("mid");
    const card = screen.getByTestId("run-301");
    const line = within(card).getByTestId("landmark-301-0");
    expect(line.textContent).toContain("The flooded works: first reached by Ana");
    expect(within(card).getByTestId("map-label-0").textContent).toContain("First here: Ana");
  });

  it("tells the ceremony a place was reached first and a road walked, in plain words", async () => {
    claimExpeditionAction.mockResolvedValue({
      ok: true,
      outcome: { grade: "solid", dollars: 210, comp: false, mark: null, briefHit: false },
      route: QUIET_ROUTE([5, 1, 2]),
      baseDollars: 210,
      merchant: 0,
      stranded: null,
      surge: [],
      echo: null,
      bearerId: null,
      balance: 5000,
      fragments: 2,
      rescueMissed: false,
      campaign: null,
      atlas: { firsts: ["The flooded works"], road: { tier: "raid", fragments: 1, comp: false } },
    });
    renderBoard({ runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })], deployedIds: new Set([5, 1, 2]) });
    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));
    expect(screen.getByTestId("ceremony-firsts").textContent).toBe(
      "You're the first in the league to reach the flooded works — it's named after you this season.",
    );
    expect(screen.getByTestId("ceremony-road").textContent).toBe("You've walked every place on the Deep Raid this season: +1 map fragment.");
  });

  it("says nothing of the atlas in a ceremony that has no news from it", async () => {
    renderBoard({ runs: [makeRun({ id: 21, resolvesAt: new Date(Date.now() - HOUR).toISOString() })], deployedIds: new Set([5, 1, 2]) });
    await click(screen.getByRole("button", { name: "Claim the Deep Raid" }));
    expect(screen.getByTestId("expedition-ceremony")).toBeTruthy();
    expect(screen.queryByTestId("ceremony-firsts")).toBeNull();
    expect(screen.queryByTestId("ceremony-road")).toBeNull();
  });
});
